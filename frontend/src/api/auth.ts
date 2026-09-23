import type {
  LoginInput,
  LoginResponse,
  MeResponse,
  RegisterInput,
  RegisterResponse,
} from '@driver-docs/shared';
import { apiRequest } from './client';

/**
 * `POST /api/auth/login`.
 *
 * @param data - Username and password.
 * @returns Access token, its lifetime and the user.
 * @throws {ApiError} 401 `INVALID_CREDENTIALS`, 429 `TOO_MANY_REQUESTS`, 400.
 */
export function login(data: LoginInput): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', { method: 'POST', json: data });
}

/**
 * `POST /api/auth/register`.
 *
 * @param data - Registration form.
 * @returns The created user.
 * @throws {ApiError} 400 with field details, 409 with the taken fields.
 */
export function register(data: RegisterInput): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>('/api/auth/register', { method: 'POST', json: data });
}

/**
 * `GET /api/auth/me` – checks that the stored token is still valid.
 *
 * @returns The current user.
 * @throws {ApiError} 401 if the token is invalid or expired.
 */
export function me(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/auth/me');
}
