# `makecents` personal budgeting software

This app is intended to help you manage your personal finances by importing, categorizing your bank transactions and creating budgets to assist you in managing your money.

![makecents personal budgeting software](https://github.com/gijoehosaphat/makecents/blob/main/screenshot.png "makecents personal budgeting software")

**WARNING**: Please do not deploy your instance to the public. Maybe that goes without saying, but this is intended to be run for your own personal use.

## Prerequisites
- Ensure you have a PostgreSQL database set up and running. See Postgraphile recommendations for PostgreSQL versions. https://postgraphile.org/postgraphile/requirements#postgresql-use-latest
  - Create a new `DATABASE` for this project. Name it whatever you want, but the default is: `budget`. Update the .env configs if you choose a different name.
  - I personally use postgres:17.4 Docker image
- If utilizing Docker, you will need Docker and Docker Compose installed on your machine. See https://docs.docker.com/get-docker/ for installation instructions.
- This repository uses Mise. See installation instructions for your platform at https://mise.jdx.dev/getting-started.html
  - Please ensure you `mist trust` and `mist install` to ensure you are using the correct versions of Node, etc.

## DB migrations
We need to create the schema, tables, etc in the database. We do this using Knex migrations.
- Change directory to the `app/api` directory.

### Run all migrations or...
- To execute all the migrations: `npx knex migrate:latest`

### ...run migrations one at a time
- You can run `npx knex migrate:up` and keep re-running the above command until all the migrations have run successfully if you prefer to see them happen one at a time.
- To rollback the last migration, you can run: `npx knex migrate:down`

## Getting transactions prepared
It is best to use YOUR real data, but for testing purposes there is a seed file that will populate the database with some fake data. 

### Use real data or...
- Grab a QFX file from your bank or credit card provider. You can usually download this from their website.
- Note where your downloaded qfx file is, we will reference it later.

### ...generate example data
- Ensure you are at the root directory.
- Run: `npx tsx src/generateExampleData.ts`
- Note the `dist/example-transactions.qfx` file that is created, we will reference it later.

## Running the application
There are two applications in this repository: the API and the Client (frontend). You can run them separately or together and/or using Docker Compose.

### Running from the CLI

#### Run both, at the same time or...
- Ensure you are at the root directory.
- Run: `./script/dev` or `./script/start` (Production)

#### Running the API individually and...
- Change directory to: `cd app/api`
- Run the API: `./script/dev` or `./script/start` (Production)

#### ...running the Client individually
- Change directory to: `cd app/web`
- Run the Client: `./script/dev` or `./script/start` (Production)

### Running using Docker Compose
- Ensure you are at the root directory.
- Run: `docker-compose up --build`

## Accessing the application
- Open your web browser and navigate to: `http://localhost:3001`
- If you configured an authentication provider, you will see a login button for that provider. If no user exists, it will be created automatically upon first login.
- Once logged in, you can drag your OFX file onto the upload area to import your transactions.

## TODO

- Tests?
- Only Quickbookx QFX files are currently supported. Includes an exmaple file. However there are amny more formats and file types to support.
- Better initial seeding of non transaction data like categories, groups and other types used to organize your transactions. Really only useful for first time installations.
- User auth exists in order to create a user and for basic identity, but there are very little guardrails around user data and ownership. I experimented w/ postgresql row level security, but backed off. Need to revisit and ensure that users can only see their own data.
- Better graphs and budgeting features.
- Close the loop on budgeting reconsiliation. Ideally at the end of each month you would reconscile each budget and allocate every last dollar into a particular budget. For instance you budget $100 for "food", but only spent $94. The $6 should be re-allocated to another budget like "savings" or "fun money". And in the opposite case, if you overspend in a budget, you should be able to take money from another budget to cover the overspend.
- Typically the application is viewing a month by month scope of transactions. I want better support for a dateless way to browse transactions. For instance, being able to see all uncategorized transactions regardless of date.
- Improve search and the ability to filter transactions by multiple criteria. Search by name, amount, category, date range, etc.
- When viewing a transaction, sometimes the memo data is cryptic. Improve the transaction detail view to show more useful information, potentially launching a simple google search for the vendor name to help the user identify the transaction. Also potentially support aliases for vendors so the user can rename them to something more meaningful.
- Improve transaction categorization using better rules and automatic categorization based on prior user behavior. Ideally this happens at import time. There are some remnants of regular expressions to assist in matching but it is not fleshed out at all.
- Closely monitor postgraphile and their upcoming v5 release for new features and improvements we can take advantage of. Seems like this is a rather large change and I would be fearful of it breaking schema.
- Better handling of multiple currencies? I primarily use CAD but have accounts with USD. All the bank accounts are marked as such, but there is little else in the app that respects currency differences and no concept of exchange rates. Maybe this is OK?
- The API layer doesn't really get "built" into a deployable artifact. We should have a proper build step that compiles the TS into JS and outputs to a dist/ folder. Probably w/ vite.
- I used to run postgraphile as a library served from NextJS itself. This worked great until the tangled dependencies of NextJS and Postgraphile caused issues attempting to upgrade anything.

## Thanks
Special thanks to Connor & Mike for listening to me blab on about this for... years.
