# Contributing & architecture

This is a personal budgeting app: a Next.js web client talking to a Postgraphile GraphQL API over PostgreSQL. Most behaviour (ownership, access control, import de-duplication) lives in the database, so reading the migrations is the fastest way to understand it.

## Repository layout

```
apps/api/        Express + Postgraphile server, Knex migrations
apps/web/        Next.js app (App Router), MUI, Apollo Client
src/             Script that generates an example QFX file (`pnpm example-data`)
script/          Root dev/start/setup wrappers
```

It is a pnpm workspace (`pnpm-workspace.yaml`) with a single `pnpm-lock.yaml`. Tool versions are pinned in `mise.toml` (Node, pnpm), and `package.json` repeats them in `packageManager` / `engines`. When you bump one, update all of: `mise.toml`, `package.json`, `Dockerfile`, `.github/workflows/ci.yml`.

## Getting started

1. `mise trust && mise install`
2. Create `apps/api/.env` and `apps/web/.env` from the `.env.example` files, pointing `DATABASE_URL` at a PostgreSQL you can create tables in (or use `docker compose up --build` and skip the rest).
3. `pnpm setup` then `pnpm migrate`
4. `pnpm dev` (API on `API_PORT`, web on `WEB_PORT`)

See the README for importing data, and `pnpm example-data` for a fake QFX file.

## Common commands

| Command                                      | What it does                                         |
| -------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev` / `pnpm start`                    | Run API + web (start = production build)             |
| `pnpm migrate`                               | Apply pending migrations                             |
| `pnpm test`                                  | Web unit tests and API integration tests             |
| `pnpm typecheck`                             | `tsc --noEmit` in both apps                          |
| `pnpm lint` / `pnpm lint:fix`                | ESLint (web); errors fail, warnings are a to-do list |
| `pnpm format` / `pnpm format:check`          | Prettier write / check for the whole repo            |
| `pnpm --dir apps/web codegen`                | Regenerate GraphQL types (API must be running)       |
| `./apps/api/script/db-migrate-create <name>` | Create a new migration                               |

## How the pieces fit

```
browser ──► Next.js (web) ──/api/graphql──► Express (api) ──► Postgraphile ──► PostgreSQL
              │  Auth.js session cookie            │  reads the cookie, sets role + user id
              └─ Apollo Client, MUI                └─ one DB transaction per request
```

### Database is the source of truth (`apps/api/db/migrations`)

- Schema changes are Knex migrations written in TypeScript. Never edit one that has shipped; add a new one. Helper SQL is often exported from a migration so a later one can restore it on rollback (for example `IMPORT_TRANSACTIONS_V1`).
- Tables live in the `app_private` schema. Postgraphile exposes `app_private` and `public` and turns tables, foreign keys and SQL functions into the GraphQL API, so **adding a column, table or function changes the API**. Use `COMMENT ... IS '@omit'` to keep something out of the schema.
- **Ownership**: users belong to accounts through `account_member` (`owner`, `editor`, `viewer`). Bank accounts, categories, budgets and so on carry an `account_id`.
- **Row-level security**: every request runs as the `makecents_member` role (valid session) or `makecents_anonymous`, never as the connection role. Policies use `app_private.current_user_id()` and `current_user_account_ids(writable)`. Anonymous requests can only call the `SECURITY DEFINER` sign-up/sign-in functions (`register_user`, `authenticate`).
- **Roles are cluster-wide** in PostgreSQL. Do not run a rollback of the row-level-security migration on a server that hosts other copies of this schema: it drops the roles for all of them.
- Business logic that must be atomic and fast is SQL: for example `import_transactions` (de-duplication by bank id, then by date + amount) and the auto-categorisation functions.

### API (`apps/api/src`)

- `index.ts` wires Express and mounts the Postgraphile middleware.
- `middleware/postgraphileMiddleware.ts` holds the Postgraphile options and plugins (connection filter, aggregates, upsert, many create/update/delete). `pgSettings` decodes the Auth.js cookie with `AUTH_SECRET` to pick the role and `jwt.claims.user_id`.
- In development (`NODE_ENV` not `production`) Postgraphile watches the database and rewrites the gitignored `apps/api/schema.graphql` when it changes.

### Web (`apps/web/src`)

- `app/[accountId]/dashboard/...` are the pages: dashboard, `bank-account/[bankAccountId]`, `search`, `reporting/*`, `settings/*` (categories, groups, budgets, imports).
- `app/api/graphql/route.ts` proxies browser GraphQL requests to the API and forwards the session cookie. `app/api/auth` is Auth.js (credentials login, `src/auth.ts`).
- `graphql/operations/*.graphql` are the queries and mutations. `pnpm --dir apps/web codegen` introspects the running API and generates `graphql/types.d.ts` and `graphql/operations.ts` (both gitignored). After changing a `.graphql` file or the API schema, re-run codegen or you will see type errors about missing fields.
- `components/` is organised by feature; `lib/` holds hooks and pure logic with unit tests next to them (`*.test.ts`).
- UI strings are in `messages/en.json` and used with `next-intl`; do not hard-code user-facing text.

### The import path

1. A file is dropped on the upload area (`lib/useUploadHandler.tsx`, `components/imports`).
2. QFX/OFX goes through `lib/parsers/OpenFinancialExchange.ts`. CSVs go through `lib/parsers/CsvDetect.ts` (guesses the column mapping) and `lib/parsers/Csv.ts`; a saved mapping is a `bank_csv_definition`. Rows get a stable `bankTransactionId` (the bank's FITID, or a hash of the row for CSVs).
3. The client calls the `importTransactions` mutation, which wraps the SQL function. Duplicates are skipped in the database (`lib/csvDuplicates.ts` mirrors the matching rules so the preview can count them), and each import is an `import_batch` that can be undone.
4. Rows are then auto-categorised from prior behaviour (`lib/categorySuggestions.ts` is the UI side of the same idea).

## Testing

- **Web** (`apps/web`): Vitest, no services needed. Put pure logic in `lib/` and test it there.
- **API** (`apps/api/test`): Vitest integration tests against a real PostgreSQL. `test/globalSetup.ts` creates a temporary database (`makecents_test_<random>`) on the server `DATABASE_URL` points at, runs all migrations, and drops it afterwards. Your configured database is never touched, but the role needs `CREATEDB`. Set `TEST_DATABASE_ADMIN_URL` to use a different server.
  - `rowLevelSecurity.test.ts`: cross-account isolation, viewer vs editor, anonymous access.
  - `importTransactions.test.ts`: duplicate detection.
  - `schema.test.ts`: snapshots the generated GraphQL schema in `test/snapshots/api-schema.graphql`. It fails when a migration or plugin changes the API. If the change is intended, review the diff and run `pnpm --filter makecents-api test -u`, then check the web app still typechecks after re-running codegen.
  - Tests that need a user and role use the helpers in `test/helpers.ts` (`asRole` runs a callback as a role inside a rolled-back transaction).
- **CI** (`.github/workflows/ci.yml`) starts PostgreSQL, migrates, starts the API, runs codegen, then `pnpm typecheck` and `pnpm test`.

## Conventions

- Prettier (`prettier.config.mjs`, 120 columns, no semicolons, single quotes) and ESLint (`apps/web/eslint.config.mjs`) are run on demand with the commands above. There is deliberately no commit hook. CI runs `pnpm lint`.
- Keep money as integer minor units (cents) in the database and format at the edges (`lib/formatMoney.ts`).
- Don't commit `.env` files or generated GraphQL output.
