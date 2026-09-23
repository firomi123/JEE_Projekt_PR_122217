/**
 * Public entry point of the `@driver-docs/shared` package.
 *
 * Everything exported here is used by both the backend and the frontend
 * (validation schemas, enums, DTO types), so both sides share one definition.
 */
export { APP_NAME, APP_SHORT_NAME } from './app.js';
export * from './auth.js';
export * from './profile.js';
export * from './documents.js';
