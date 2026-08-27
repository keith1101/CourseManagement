
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --project tsconfig.json prisma/seed.ts',
  },
  datasource: {
    // Runtime traffic uses Neon’s pooled DATABASE_URL. Prisma migrations need
    // the direct URL so PgBouncer cannot interfere with session operations.
    url: process.env.DATABASE_URL_UNPOOLED ?? env('DATABASE_URL'),
  },
});
