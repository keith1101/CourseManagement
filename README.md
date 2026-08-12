# Course Management API

NestJS + TypeScript + PostgreSQL + Prisma API.

## Stack

- NestJS
- TypeScript
- PostgreSQL
- Prisma ORM
- pnpm

## Local setup

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

The API runs at:

```text
http://localhost:5001/api
```

## Useful commands

```bash
pnpm dev
pnpm build
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Endpoints

```Auth
POST /api/auth/register
POST /api/auth/login
```
