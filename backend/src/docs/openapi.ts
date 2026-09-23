import {
  APP_NAME,
  DOCUMENT_LIMITS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  HISTORY_ACTIONS,
  loginSchema,
  MAX_UPLOAD_BYTES,
  PROFILE_LIMITS,
  registerSchema,
  STATUS_TRANSITIONS,
} from '@driver-docs/shared';
import { z } from 'zod';

/**
 * Converts a Zod schema into an OpenAPI 3.0 schema object describing the request
 * body a client must send (the input side, before trimming/lowercasing).
 *
 * @param schema - A shared validation schema.
 * @returns JSON Schema compatible with OpenAPI 3.0 (`$schema` removed).
 */
function requestSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
  }) as Record<string, unknown>;
  return rest;
}

/** Reference to a schema in `components.schemas`. */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/**
 * Builds a JSON response object for the OpenAPI document.
 *
 * @param description - Meaning of the response.
 * @param schemaName - Name of the response schema in `components.schemas`.
 * @returns An OpenAPI response object with an `application/json` body.
 */
function jsonResponse(description: string, schemaName: string) {
  return { description, content: { 'application/json': { schema: ref(schemaName) } } };
}

/** Response used by every endpoint for errors in the uniform format. */
const errorResponse = (description: string) => jsonResponse(description, 'ErrorResponse');

/** Path parameter `id` of a document. */
const documentIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

/** Responses shared by every endpoint that addresses one document. */
const documentErrors = {
  401: errorResponse('Brak, błędny lub wygasły token'),
  404: errorResponse('Dokument nie istnieje, został usunięty albo należy do innego użytkownika'),
};

/**
 * Builds a multipart request body with the file field and the given text fields.
 *
 * @param fields - OpenAPI schemas of the text fields.
 * @param required - Names of required fields (besides `file`).
 * @returns An OpenAPI request body object.
 */
function multipartBody(fields: Record<string, unknown>, required: string[] = []) {
  return {
    required: true,
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          required: ['file', ...required],
          properties: {
            file: {
              type: 'string',
              format: 'binary',
              description: `JPG, PNG lub PDF (rozpoznawane po zawartości), maks. ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`,
            },
            ...fields,
          },
        },
      },
    },
  };
}

/** Text field `changeNote` of an upload. */
const changeNoteField = {
  type: 'string',
  maxLength: DOCUMENT_LIMITS.changeNote,
  description: 'Opis wersji, np. skan z pieczątką odbiorcy',
};

/** Human-readable list of allowed status transitions for the PATCH description. */
const transitionsText = Object.entries(STATUS_TRANSITIONS)
  .map(([from, to]) => `${from} → ${to.length > 0 ? to.join(', ') : '(brak, tylko do odczytu)'}`)
  .join('; ');

/**
 * Builds the OpenAPI 3.0 specification of the REST API, served at
 * `/api/docs/openapi.json` and rendered by Swagger UI at `/api/docs`.
 *
 * The registration and login body schemas are generated from the shared Zod
 * schemas, so the documented rules are exactly the ones the API enforces. The
 * profile body is described by hand, because its Zod schema normalizes values
 * before validating them and the generated input schema would lose the limits
 * (the limits come from the shared `PROFILE_LIMITS`). Every new endpoint must be
 * added here (a functional test checks the list of documented paths).
 *
 * @returns The OpenAPI document as a plain object.
 */
export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: `${APP_NAME} – REST API`,
      version: '0.1.0',
      description:
        'API aplikacji do zarządzania dokumentami przewozowymi kierowcy. ' +
        'Błędy mają format `{ error: { code, message, details? } }`.',
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'health', description: 'Stan usługi' },
      { name: 'auth', description: 'Rejestracja i logowanie' },
      { name: 'profile', description: 'Profil kierowcy' },
      { name: 'documents', description: 'Dokumenty, wersje plików i historia zmian' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['health'],
          summary: 'Liveness – proces działa (także pod /api/health)',
          responses: { 200: jsonResponse('Proces działa', 'LivenessResponse') },
        },
      },
      '/health/ready': {
        get: {
          tags: ['health'],
          summary: 'Readiness – baza danych i MinIO dostępne (także pod /api/health/ready)',
          responses: {
            200: jsonResponse('Wszystkie zależności działają', 'ReadinessResponse'),
            503: jsonResponse('Co najmniej jedna zależność nie działa', 'ReadinessResponse'),
          },
        },
      },
      '/api/auth/register': {
        post: {
          tags: ['auth'],
          summary: 'Rejestracja konta',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('RegisterRequest') } },
          },
          responses: {
            201: jsonResponse('Konto utworzone', 'UserResponse'),
            400: errorResponse('Niepoprawne dane (VALIDATION_ERROR, szczegóły pól w details)'),
            409: errorResponse('Login lub e-mail zajęty (CONFLICT, zajęte pola w details)'),
          },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['auth'],
          summary: 'Logowanie – zwraca token JWT',
          description:
            'Nieudane próby są liczone na adres IP; po przekroczeniu limitu (domyślnie 10 w 15 min) ' +
            'kolejne próby dostają 429 z nagłówkiem Retry-After.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('LoginRequest') } },
          },
          responses: {
            200: jsonResponse('Zalogowano', 'LoginResponse'),
            400: errorResponse('Brak loginu lub hasła (VALIDATION_ERROR)'),
            401: errorResponse('Zły login lub hasło (INVALID_CREDENTIALS)'),
            429: errorResponse('Za dużo nieudanych prób (TOO_MANY_REQUESTS)'),
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['auth'],
          summary: 'Dane zalogowanego użytkownika',
          security: [{ bearerAuth: [] }],
          responses: {
            200: jsonResponse('Zalogowany użytkownik', 'UserResponse'),
            401: errorResponse('Brak, błędny lub wygasły token (UNAUTHORIZED, TOKEN_EXPIRED)'),
          },
        },
      },
      '/api/profile': {
        get: {
          tags: ['profile'],
          summary: 'Profil zalogowanego kierowcy',
          security: [{ bearerAuth: [] }],
          responses: {
            200: jsonResponse('Profil', 'ProfileResponse'),
            401: errorResponse('Brak, błędny lub wygasły token'),
          },
        },
        put: {
          tags: ['profile'],
          summary: 'Zastąpienie profilu (pominięte lub puste pola są czyszczone)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('ProfileRequest') } },
          },
          responses: {
            200: jsonResponse('Zaktualizowany profil', 'ProfileResponse'),
            400: errorResponse('Niepoprawne dane (VALIDATION_ERROR, szczegóły pól w details)'),
            401: errorResponse('Brak, błędny lub wygasły token'),
          },
        },
      },

      '/api/documents': {
        get: {
          tags: ['documents'],
          summary: 'Lista własnych dokumentów (bez usuniętych), od ostatnio zmienionego',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'type', in: 'query', schema: { type: 'string', enum: DOCUMENT_TYPES } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: DOCUMENT_STATUSES } },
            {
              name: 'q',
              in: 'query',
              description: 'Szukany tekst w tytule lub numerze (bez rozróżniania wielkości liter)',
              schema: { type: 'string', maxLength: 100 },
            },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            {
              name: 'pageSize',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            200: jsonResponse('Strona listy', 'DocumentListResponse'),
            400: errorResponse('Niepoprawny filtr lub stronicowanie'),
            401: errorResponse('Brak, błędny lub wygasły token'),
          },
        },
        post: {
          tags: ['documents'],
          summary: 'Dodanie dokumentu z plikiem (wersja 1, status DRAFT)',
          description:
            'Plik jest szyfrowany (AES-256-GCM, własny klucz danych zaszyfrowany kluczem głównym) ' +
            'przed zapisem w MinIO.',
          security: [{ bearerAuth: [] }],
          requestBody: multipartBody(
            {
              type: { type: 'string', enum: DOCUMENT_TYPES },
              title: { type: 'string', minLength: 1, maxLength: DOCUMENT_LIMITS.title },
              number: { type: 'string', maxLength: DOCUMENT_LIMITS.number },
              changeNote: changeNoteField,
            },
            ['type', 'title'],
          ),
          responses: {
            201: jsonResponse('Dokument utworzony', 'DocumentResponse'),
            400: errorResponse('Niepoprawne pola lub plik (zły format, za duży, brak pliku)'),
            401: errorResponse('Brak, błędny lub wygasły token'),
          },
        },
      },
      '/api/documents/{id}': {
        get: {
          tags: ['documents'],
          summary: 'Szczegóły dokumentu z listą wersji i historią zmian',
          security: [{ bearerAuth: [] }],
          parameters: [documentIdParam],
          responses: { 200: jsonResponse('Dokument', 'DocumentResponse'), ...documentErrors },
        },
        patch: {
          tags: ['documents'],
          summary: 'Zmiana tytułu, numeru lub statusu (każda zmiana trafia do historii)',
          description: `Dozwolone zmiany statusu: ${transitionsText}.`,
          security: [{ bearerAuth: [] }],
          parameters: [documentIdParam],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('UpdateDocumentRequest') } },
          },
          responses: {
            200: jsonResponse('Dokument po zmianie', 'DocumentResponse'),
            400: errorResponse('Niepoprawne dane lub pusta zmiana'),
            ...documentErrors,
            409: errorResponse(
              'Niedozwolona zmiana statusu (INVALID_STATUS_TRANSITION) albo dokument zarchiwizowany (DOCUMENT_ARCHIVED)',
            ),
          },
        },
        delete: {
          tags: ['documents'],
          summary: 'Usunięcie miękkie (dokument znika z API, dane i pliki zostają)',
          security: [{ bearerAuth: [] }],
          parameters: [documentIdParam],
          responses: { 204: { description: 'Usunięto' }, ...documentErrors },
        },
      },
      '/api/documents/{id}/versions': {
        post: {
          tags: ['documents'],
          summary: 'Nowa wersja pliku (numer wersji + 1, poprzednie wersje zostają)',
          security: [{ bearerAuth: [] }],
          parameters: [documentIdParam],
          requestBody: multipartBody({ changeNote: changeNoteField }),
          responses: {
            201: jsonResponse('Dokument z nową wersją', 'DocumentResponse'),
            400: errorResponse('Niepoprawny plik'),
            ...documentErrors,
            409: errorResponse('Dokument zarchiwizowany (DOCUMENT_ARCHIVED)'),
          },
        },
      },
      '/api/documents/{id}/versions/{versionNo}/file': {
        get: {
          tags: ['documents'],
          summary: 'Pobranie odszyfrowanego pliku wersji',
          description:
            'Domyślnie Content-Disposition: inline (podgląd); z download=1 jako załącznik. ' +
            'Odpowiedź nie jest buforowana (Cache-Control: private, no-store).',
          security: [{ bearerAuth: [] }],
          parameters: [
            documentIdParam,
            {
              name: 'versionNo',
              in: 'path',
              required: true,
              schema: { type: 'integer', minimum: 1 },
            },
            { name: 'download', in: 'query', schema: { type: 'string', enum: ['1'] } },
          ],
          responses: {
            200: {
              description: 'Plik (ETag = SHA-256 zawartości)',
              content: {
                'application/pdf': { schema: { type: 'string', format: 'binary' } },
                'image/jpeg': { schema: { type: 'string', format: 'binary' } },
                'image/png': { schema: { type: 'string', format: 'binary' } },
              },
            },
            ...documentErrors,
            500: errorResponse(
              'Plik w magazynie nie przeszedł kontroli integralności (FILE_INTEGRITY_ERROR)',
            ),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        RegisterRequest: requestSchema(registerSchema),
        LoginRequest: requestSchema(loginSchema),
        User: {
          type: 'object',
          required: ['id', 'username', 'email', 'createdAt'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string', example: 'jan_kowalski' },
            email: { type: 'string', format: 'email' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        UserResponse: {
          type: 'object',
          required: ['user'],
          properties: { user: ref('User') },
        },
        LoginResponse: {
          type: 'object',
          required: ['accessToken', 'tokenType', 'expiresIn', 'user'],
          properties: {
            accessToken: { type: 'string', description: 'JWT (HS256), claim sub = id użytkownika' },
            tokenType: { type: 'string', enum: ['Bearer'] },
            expiresIn: { type: 'integer', description: 'Czas życia tokenu w sekundach' },
            user: ref('User'),
          },
        },
        ProfileRequest: {
          type: 'object',
          description:
            'Każde pole jest opcjonalne; brak pola, null lub pusty tekst czyści wartość.',
          properties: {
            firstName: {
              type: 'string',
              nullable: true,
              maxLength: PROFILE_LIMITS.firstName,
              description: 'Litery (także polskie), spacja, myślnik, apostrof',
              example: 'Jan',
            },
            lastName: {
              type: 'string',
              nullable: true,
              maxLength: PROFILE_LIMITS.lastName,
              description: 'Litery (także polskie), spacja, myślnik, apostrof',
              example: 'Kowalski',
            },
            phone: {
              type: 'string',
              nullable: true,
              description: '9–15 cyfr, opcjonalnie + na początku; spacje i myślniki są usuwane',
              example: '+48 601 234 567',
            },
            licenseNumber: {
              type: 'string',
              nullable: true,
              minLength: 4,
              maxLength: PROFILE_LIMITS.licenseNumber,
              description: 'Litery, cyfry, / i -; zamieniane na wielkie litery',
              example: '00123/15/1465',
            },
            companyName: {
              type: 'string',
              nullable: true,
              maxLength: PROFILE_LIMITS.companyName,
              example: 'Trans-Pol Sp. z o.o.',
            },
          },
        },
        Profile: {
          type: 'object',
          required: ['firstName', 'lastName', 'phone', 'licenseNumber', 'companyName', 'updatedAt'],
          properties: {
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true, example: '+48601234567' },
            licenseNumber: { type: 'string', nullable: true },
            companyName: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        ProfileResponse: {
          type: 'object',
          required: ['profile'],
          properties: { profile: ref('Profile') },
        },
        UpdateDocumentRequest: {
          type: 'object',
          description: 'Co najmniej jedno pole; pominięte pola zostają bez zmian.',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: DOCUMENT_LIMITS.title },
            number: {
              type: 'string',
              nullable: true,
              maxLength: DOCUMENT_LIMITS.number,
              description: 'null lub pusty tekst usuwa numer',
            },
            status: { type: 'string', enum: DOCUMENT_STATUSES },
          },
        },
        DocumentSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            type: { type: 'string', enum: DOCUMENT_TYPES },
            status: { type: 'string', enum: DOCUMENT_STATUSES },
            title: { type: 'string' },
            number: { type: 'string', nullable: true },
            currentVersion: { type: 'integer' },
            mimeType: { type: 'string', enum: ['image/jpeg', 'image/png', 'application/pdf'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        DocumentVersion: {
          type: 'object',
          properties: {
            versionNo: { type: 'integer' },
            mimeType: { type: 'string' },
            sizeBytes: { type: 'integer' },
            sha256: { type: 'string', description: 'SHA-256 oryginalnego pliku (hex)' },
            changeNote: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DocumentHistoryEntry: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: HISTORY_ACTIONS },
            field: { type: 'string', nullable: true },
            oldValue: { type: 'string', nullable: true },
            newValue: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        DocumentDetails: {
          allOf: [
            ref('DocumentSummary'),
            {
              type: 'object',
              properties: {
                versions: { type: 'array', items: ref('DocumentVersion') },
                history: { type: 'array', items: ref('DocumentHistoryEntry') },
              },
            },
          ],
        },
        DocumentResponse: {
          type: 'object',
          properties: { document: ref('DocumentDetails') },
        },
        DocumentListResponse: {
          type: 'object',
          properties: {
            items: { type: 'array', items: ref('DocumentSummary') },
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        LivenessResponse: {
          type: 'object',
          properties: { status: { type: 'string', enum: ['ok'] } },
        },
        ReadinessResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ready', 'not_ready'] },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'string', enum: ['up', 'down'] },
                storage: { type: 'string', enum: ['up', 'down'] },
              },
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
