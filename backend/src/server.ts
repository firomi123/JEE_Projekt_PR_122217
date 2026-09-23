import { APP_NAME } from '@driver-docs/shared';
import { createApp } from './app.js';

/**
 * Parses the TCP port the API should listen on from the `PORT` environment variable.
 *
 * @param raw - The raw value of `process.env.PORT`; `undefined` or an empty string
 *   selects the default port 3000.
 * @returns An integer port in the range 1–65535.
 * @throws {Error} If the value is not an integer in the range 1–65535.
 */
function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: "${raw}"`);
  }
  return port;
}

const port = parsePort(process.env.PORT);

createApp().listen(port, () => {
  // Replaced by the pino logger in Stage 3.
  console.log(`${APP_NAME} API listening on port ${port}`);
});
