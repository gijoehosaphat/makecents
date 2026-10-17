# `makecents` personal budgeting software

This app is intended to help you manage your personal finances by importing, categorizing your bank transactions and creating budgets to assist you in managing your money.

![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot1.png 'makecents personal budgeting software')
![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot2.png 'makecents personal budgeting software')
![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot3.png 'makecents personal budgeting software')
![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot4.png 'makecents personal budgeting software')
![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot5.png 'makecents personal budgeting software')

**WARNING**: Please do not deploy your instance to the public. Maybe that goes without saying, but this is intended to be run for your own personal use.

## Features

- Import and categorize bank transactions
- Create and manage budgets
- Generate reports and insights on spending
- Support for QFX files (QuickBooks) & arbitrary CSVs with included template mapper.

## Quick demo (Docker only)

You only need [Docker](https://docs.docker.com/get-docker/) with Compose.

```bash
docker compose up --build
```

This starts PostgreSQL, applies the database migrations, loads demo data and runs the app (the first start is slow while the web app builds). Then:

1. Open <http://localhost:3001> and sign in with `admin@somewhere.com` / `devpassword123`.
2. Explore the dashboard, reports and budgets. The demo has a checking account, a savings account and a credit card with six months of fake transactions, plus categories, groups, budgets, transfers and split transactions. The dates are generated relative to the day the demo first starts, so the current month always has data.
3. Import your own QFX or CSV export from your bank by dragging it onto the upload area. To try an import without one, run `pnpm example-data` for a fake QFX file dated from today (see [Fresh example data](#fresh-example-data)).

The demo data lives in a Docker volume and is only loaded into an empty database. `docker compose down -v` deletes it, and the next `docker compose up` loads fresh data dated from that day. Set the `AUTH_SECRET` environment variable in your shell before the first start if you want something other than the default secret.

## Development setup

For working on the code. See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture and conventions.

### Prerequisites

- [Mise](https://mise.jdx.dev/getting-started.html). Run `mise trust && mise install` for the pinned Node and pnpm versions.
- A PostgreSQL server (see Postgraphile's [version recommendations](https://postgraphile.org/postgraphile/requirements#postgresql-use-latest)) with an empty database, `budget` by default. For example: `docker run -d --name makecents-db -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=budget -p 5432:5432 postgres:17.4`

### Set up and run

1. `pnpm setup` installs dependencies for the whole workspace.
2. Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env`, then set `DATABASE_URL` in the API file to your database. Change both `AUTH_SECRET` values (and `BETTER_AUTH_SECRET`) if you will use real data.
3. `pnpm migrate` creates the tables.
4. `pnpm dev` runs the API (port 3002) and the web app (port 3001) with reloading. `pnpm start` runs a production build instead.
5. Open <http://localhost:3001>, sign up, and import your own bank export or a fake file from `pnpm example-data` (see [Fresh example data](#fresh-example-data)).

You can also run the apps individually: `pnpm dev` inside `apps/api` or `apps/web`.

### Database migrations

- `pnpm migrate` applies every pending migration.
- From `apps/api`: `pnpm migrate:up` applies one at a time, `pnpm migrate:down` rolls back the last, and `./script/db-migrate-create <name>` creates a new one.

### Fresh example data

To generate a fake QFX file (a checking account, a savings account and a credit card) covering the last three months from today, run `pnpm example-data` and import `dist/example-transactions.qfx`. It is generated rather than committed so its dates are never stale.

### Checks

From the root directory: `pnpm typecheck`, `pnpm lint` and `pnpm test`. These also run in CI (GitHub Actions). Typechecking needs the generated GraphQL types, so run the API and `pnpm --dir apps/web codegen` first (`pnpm dev` does this for you). The API tests create (and drop) a temporary database on the PostgreSQL server in `apps/api/.env`, so that role needs `CREATEDB`. `pnpm format` runs Prettier.

## Roadmap

Planned and possible work is in [ROADMAP.md](ROADMAP.md).

## Thanks

Special thanks to Connor & Mike for listening to me blab on about this for... years.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You are free to use, modify, and share this software for any noncommercial purpose. Commercial use requires a separate license from the author.
