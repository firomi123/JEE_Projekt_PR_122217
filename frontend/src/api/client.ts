import { getAccessToken } from '../auth/token-store';

/** One field problem reported by the API in `error.details`. */
export interface FieldIssue {
  path: string;
  message: string;
}

/** Error thrown for every non-2xx API response and for network failures. */
export class ApiError extends Error {
  /**
   * @param status - HTTP status (0 for a network failure, when no response arrived).
   * @param code - API error code, e.g. `VALIDATION_ERROR`, or `NETWORK_ERROR`.
   * @param message - Message from the API (English, for developers).
   * @param details - Per-field issues (400 / 409), if any.
   * @param retryAfterSeconds - Value of the `Retry-After` header (429), if any.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: FieldIssue[] = [],
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Called when an authenticated request gets 401 (set by the auth provider). */
let unauthorizedHandler: () => void = () => {};

/**
 * Registers what to do when a request that carried a token is answered with 401
 * (expired or revoked session); normally logs the user out.
 *
 * @param handler - The callback.
 */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

/** Options of {@link apiRequest}. */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** JSON body (sent with `Content-Type: application/json`). */
  json?: unknown;
  /** Multipart body (the browser sets the boundary header). */
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Sends a request to the API (same origin, path starting with `/api`) with the
 * current token and converts errors into {@link ApiError}.
 *
 * @param path - API path, e.g. `/api/auth/me`.
 * @param options - Method and body.
 * @returns The raw `Response` of a successful (2xx) request.
 * @throws {ApiError} For non-2xx responses (with the API's code, message and
 *   details) and for network failures (`status` 0, code `NETWORK_ERROR`).
 * Side effects: on 401 for a request that carried a token, calls the registered
 * unauthorized handler before throwing.
 */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.formData) {
    body = options.formData;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }

  if (response.ok) return response;

  const payload = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: FieldIssue[] };
  } | null;
  const retryAfter = Number(response.headers.get('Retry-After'));
  const error = new ApiError(
    response.status,
    payload?.error?.code ?? `HTTP_${response.status}`,
    payload?.error?.message ?? response.statusText,
    Array.isArray(payload?.error?.details) ? payload.error.details : [],
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
  if (response.status === 401 && token) unauthorizedHandler();
  throw error;
}

/**
 * Like {@link apiFetch}, parsing a JSON response body.
 *
 * @param path - API path.
 * @param options - Method and body.
 * @returns The parsed JSON (`undefined` for 204 No Content).
 * @throws {ApiError} See {@link apiFetch}.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
