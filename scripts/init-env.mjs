#!/usr/bin/env node
/**
 * Creates `.env` from `.env.example`, filling in random secrets and the values
 * derived from them (DATABASE_URL, S3_SECRET_KEY).
 *
 * Usage: `npm run env:init` (refuses to overwrite an existing .env; pass
 * `-- --force` to regenerate it, which makes existing Docker volumes unusable
 * because the database and MinIO keep their original passwords).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = resolve(repoRoot, '.env.example');
const envPath = resolve(repoRoot, '.env');

/**
 * Generates a random secret that is safe to embed in URLs and shell commands.
 *
 * @param {number} bytes - Number of random bytes (from the OS CSPRNG) to encode.
 * @returns {string} Lowercase hex string of length `2 * bytes`.
 */
function hexSecret(bytes) {
  return randomBytes(bytes).toString('hex');
}

/**
 * Parses `KEY=value` lines of a dotenv file into a map. Comment lines (`#`) and
 * blank lines are skipped; values are taken verbatim (no quotes or interpolation).
 *
 * @param {string} text - Contents of a dotenv file.
 * @returns {Map<string, string>} Keys in file order mapped to their raw values.
 */
function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

/**
 * Returns the dotenv text with the value of each given key replaced; every other
 * line (including comments) is preserved.
 *
 * @param {string} text - Contents of the template dotenv file.
 * @param {Record<string, string>} replacements - New values by key.
 * @returns {string} The updated file contents.
 */
function applyValues(text, replacements) {
  return text.replace(/^([A-Z0-9_]+)=(.*)$/gm, (line, key) =>
    key in replacements ? `${key}=${replacements[key]}` : line,
  );
}

if (existsSync(envPath) && !process.argv.includes('--force')) {
  console.error('.env already exists; use `npm run env:init -- --force` to regenerate it.');
  process.exit(1);
}

const template = readFileSync(examplePath, 'utf8');
const defaults = parseEnv(template);

const postgresPassword = hexSecret(24);
const minioPassword = hexSecret(24);
const replacements = {
  POSTGRES_PASSWORD: postgresPassword,
  MINIO_ROOT_PASSWORD: minioPassword,
  S3_SECRET_KEY: minioPassword,
  JWT_SECRET: randomBytes(48).toString('base64'),
  MASTER_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  GRAFANA_ADMIN_PASSWORD: hexSecret(12),
  // Must pass the registration password rules: uppercase, digit, special character.
  OFFICE_PASSWORD: `Biuro-${hexSecret(10)}-9`,
  DATABASE_URL:
    `postgresql://${defaults.get('POSTGRES_USER')}:${postgresPassword}` +
    `@localhost:${defaults.get('POSTGRES_PORT')}/${defaults.get('POSTGRES_DB')}`,
};

writeFileSync(envPath, applyValues(template, replacements), { mode: 0o600 });
console.log(`Created ${envPath} with generated secrets.`);
