# `makecents` personal budgeting software

This app is intended to help you manage your personal finances by importing, categorizing your bank transactions and creating budgets to assist you in managing your money.

![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot.png 'makecents personal budgeting software')

**WARNING**: Please do not deploy your instance to the public. Maybe that goes without saying, but this is intended to be run for your own personal use.

## Features

- Import and categorize bank transactions
- Create and manage budgets
- Generate reports and insights on spending
- Support for QFX files (QuickBooks) & arbitrary CSVs with included template mapper.

## Prerequisites

- Ensure you have a PostgreSQL database set up and running. See Postgraphile recommendations for PostgreSQL versions. https://postgraphile.org/postgraphile/requirements#postgresql-use-latest
  - Create a new `DATABASE` for this project. Name it whatever you want, but the default is: `budget`. Update the .env configs if you choose a different name.
  - I personally use postgres:17.4 Docker image
- If utilizing Docker, you will need Docker and Docker Compose installed on your machine. See https://docs.docker.com/get-docker/ for installation instructions.
- This repository uses Mise. See installation instructions for your platform at https://mise.jdx.dev/getting-started.html
  - Please ensure you `mise trust` and `mise install` to ensure you are using the correct versions of Node, etc.

## DB migrations

We need to create the schema, tables, etc in the database. We do this using Knex migrations.

- Ensure you are at the root directory and have created `apps/api/.env` from `apps/api/.env.example`.

### Run all migrations or...

- To execute all the migrations: `pnpm migrate`

### ...run migrations one at a time

- From `apps/api`, you can run `pnpm migrate:up` repeatedly until all the migrations have run successfully if you prefer to see them happen one at a time.
- To rollback the last migration, run `pnpm migrate:down` from `apps/api`.

## Getting transactions prepared

It is best to use YOUR real data, but for testing purposes there is a seed file that will populate the database with some fake data.

### Use real data or...

- Grab a QFX file from your bank or credit card provider. You can usually download this from their website.
- Note where your downloaded qfx file is, we will reference it later.

### ...generate example data

- Ensure you are at the root directory.
- Run: `pnpm example-data`
- Note the `dist/example-transactions.qfx` file that is created, we will reference it later.

## Running the application

There are two applications in this repository: the API and the Client (frontend). You can run them separately or together and/or using Docker Compose.

### Running from the CLI

#### Run both, at the same time or...

- Ensure you are at the root directory.
- Run: `pnpm setup` once, then `pnpm dev` or `pnpm start` (Production)

#### Running the API individually and...

- Change directory to: `cd apps/api`
- Run the API: `pnpm dev` or `pnpm start` (Production)

#### ...running the Client individually

- Change directory to: `cd apps/web`
- Run the Client: `pnpm dev` or `pnpm start` (Production)

### Running using Docker Compose

- Ensure you are at the root directory.
- Run: `docker compose up --build`
- This starts PostgreSQL, applies migrations and runs the app on `http://localhost:3001`. Set `AUTH_SECRET` in your shell to override the default secret.

## Checks

From the root directory: `pnpm typecheck` and `pnpm test`. These also run in CI (GitHub Actions). The API tests create (and drop) a temporary database on the PostgreSQL server in `apps/api/.env`, so that role needs `CREATEDB`. Typechecking needs the generated GraphQL types, so run the API and `pnpm --dir apps/web codegen` first (`pnpm dev` does this for you).

## Accessing the application

- Open your web browser and navigate to: `http://localhost:3001`
- If you configured an authentication provider, you will see a login button for that provider. If no user exists, it will be created automatically upon first login.
- Once logged in, you can drag your OFX file onto the upload area to import your transactions.

## TODO

- _External loans_: Add ability to create loans that are just manually updated. This is for things like mortgages, where the payment amount is fixed but the interest and principal amounts vary each month. It would be nice to be able to track the loan balance over time and see how much interest vs principal is being paid each month. Also relevant to home renovation loans, where the amount can vary each month but there is still a fixed payment amount.
- _Filtering un/categorized transactions_: When filtering transactions by whether they are categorized or not, the split transactions are not handled correctly. If a transaction is split into multiple categories, only when the original transaction is categorized does it get filtered out of the "uncategorized" view. Ideally, if any part of the transaction is uncategorized, it should show up in the uncategorized view.
- Tests?
- Better initial seeding of non transaction data like categories, groups and other types used to organize your transactions. Really only useful for first time installations.
- Better graphs and budgeting features.
- Close the loop on budgeting reconsiliation. Ideally at the end of each month you would reconscile each budget and allocate every last dollar into a particular budget. For instance you budget $100 for "food", but only spent $94. The $6 should be re-allocated to another budget like "savings" or "fun money". And in the opposite case, if you overspend in a budget, you should be able to take money from another budget to cover the overspend.
- Improve search and the ability to filter transactions by multiple criteria. Search by amount, date range, etc. We already have a bunch of things setup here.
- _Transaction clarity_ When viewing a transaction, sometimes the memo data is cryptic. Improve the transaction detail view to show more useful information, potentially launching a simple google search for the vendor name to help the user identify the transaction. Also potentially support aliases for vendors so the user can rename them to something more meaningful.
- _Automatic transaction categorization_: Improve transaction categorization using better rules and automatic categorization based on prior user behavior. Ideally this happens at import time. There are some remnants of regular expressions to assist in matching but it is not fleshed out at all.
- Closely monitor postgraphile and their upcoming v5 release for new features and improvements we can take advantage of. Seems like this is a rather large change and I would be fearful of it breaking schema.
- Better handling of multiple currencies? I primarily use CAD but have accounts with USD. All the bank accounts are marked as such, but there is little else in the app that respects currency differences and no concept of exchange rates. Maybe this is OK?
- The API layer doesn't really get "built" into a deployable artifact. We should have a proper build step that compiles the TS into JS and outputs to a dist/ folder. Probably w/ vite.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the architecture, how the import flow works, and how to run the tests.

## Thanks

Special thanks to Connor & Mike for listening to me blab on about this for... years.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You are free to use, modify, and share this software for any noncommercial purpose. Commercial use requires a separate license from the author.
