# `makecents` personal budgeting software

This app is intended to help you manage your personal finances by importing, categorizing your bank transactions and creating budgets to assist you in managing your money.

![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot.png 'makecents personal budgeting software')

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

This starts PostgreSQL, applies the database migrations and runs the app (the first start is slow while the web app builds). Then:

1. Open <http://localhost:3001> and sign up with any email and password.
2. Drag [`demo/example-transactions.qfx`](demo/example-transactions.qfx) onto the upload area. It contains a checking account, a savings account and a credit card with a few months of fake transactions.
3. Explore the dashboard, reports and budgets. Import your own QFX or CSV export from your bank the same way.

The demo data lives in a Docker volume. `docker compose down -v` deletes it. Set the `AUTH_SECRET` environment variable in your shell before the first start if you want something other than the default secret.

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
5. Open <http://localhost:3001>, sign up, and import [`demo/example-transactions.qfx`](demo/example-transactions.qfx) or your own bank export.

You can also run the apps individually: `pnpm dev` inside `apps/api` or `apps/web`.

### Database migrations

- `pnpm migrate` applies every pending migration.
- From `apps/api`: `pnpm migrate:up` applies one at a time, `pnpm migrate:down` rolls back the last, and `./script/db-migrate-create <name>` creates a new one.

### Fresh example data

`demo/example-transactions.qfx` has fixed dates. To generate a file covering the last three months from today, run `pnpm example-data` and use `dist/example-transactions.qfx`.

### Checks

From the root directory: `pnpm typecheck`, `pnpm lint` and `pnpm test`. These also run in CI (GitHub Actions). Typechecking needs the generated GraphQL types, so run the API and `pnpm --dir apps/web codegen` first (`pnpm dev` does this for you). The API tests create (and drop) a temporary database on the PostgreSQL server in `apps/api/.env`, so that role needs `CREATEDB`. `pnpm format` runs Prettier.

## TODO

- _External loans_: Add ability to create loans that are just manually updated. This is for things like mortgages, where the payment amount is fixed but the interest and principal amounts vary each month. It would be nice to be able to track the loan balance over time and see how much interest vs principal is being paid each month. Also relevant to home renovation loans, where the amount can vary each month but there is still a fixed payment amount.
- _Filtering un/categorized transactions_: When filtering transactions by whether they are categorized or not, the split transactions are not handled correctly. If a transaction is split into multiple categories, only when the original transaction is categorized does it get filtered out of the "uncategorized" view. Ideally, if any part of the transaction is uncategorized, it should show up in the uncategorized view.
- Better initial seeding of non transaction data like categories, groups and other types used to organize your transactions. Really only useful for first time installations.
- Better graphs and budgeting features.
- Close the loop on budgeting reconsiliation. Ideally at the end of each month you would reconscile each budget and allocate every last dollar into a particular budget. For instance you budget $100 for "food", but only spent $94. The $6 should be re-allocated to another budget like "savings" or "fun money". And in the opposite case, if you overspend in a budget, you should be able to take money from another budget to cover the overspend.
- Improve search and the ability to filter transactions by multiple criteria. Search by amount, date range, etc. We already have a bunch of things setup here.
- _Transaction clarity_ When viewing a transaction, sometimes the memo data is cryptic. Improve the transaction detail view to show more useful information, potentially launching a simple google search for the vendor name to help the user identify the transaction. Also potentially support aliases for vendors so the user can rename them to something more meaningful.
- _Automatic transaction categorization_: Improve transaction categorization using better rules and automatic categorization based on prior user behavior. Ideally this happens at import time. There are some remnants of regular expressions to assist in matching but it is not fleshed out at all.
- Closely monitor postgraphile and their upcoming v5 release for new features and improvements we can take advantage of. Seems like this is a rather large change and I would be fearful of it breaking schema.
- Better handling of multiple currencies? I primarily use CAD but have accounts with USD. All the bank accounts are marked as such, but there is little else in the app that respects currency differences and no concept of exchange rates. Maybe this is OK?
- The API layer doesn't really get "built" into a deployable artifact. We should have a proper build step that compiles the TS into JS and outputs to a dist/ folder. Probably w/ vite.

## Thanks

Special thanks to Connor & Mike for listening to me blab on about this for... years.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You are free to use, modify, and share this software for any noncommercial purpose. Commercial use requires a separate license from the author.
