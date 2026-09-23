import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env files by itself. On the host (npm run dev,
// prisma migrate dev) the variables come from the repository-root .env;
// in Docker and in tests they are already present in process.env.
const rootEnv = resolve(import.meta.dirname, '..', '.env');
if (!process.env.DATABASE_URL && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Optional so that `prisma generate` works without a database (Docker build).
    url: process.env.DATABASE_URL,
  },
});
