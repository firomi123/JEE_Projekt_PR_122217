import { APP_NAME, loginSchema, PROFILE_LIMITS, registerSchema } from '@driver-docs/shared';
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
