# Roadmap

Planned and possible work for makecents, roughly in priority order. It comes from the old README TODO list plus a comparison with tools like YNAB, Monarch, Actual Budget and Copilot. Nothing here is a commitment, and items can move between tiers.

## Tier 1: Everyday gaps (small, high value)

- **User management** Add support for multiple users, login, and profile management.
- **Manual transaction entry.** Add a transaction by hand (cash spending, accounts you can't export).
- **Categorization rules.** User-defined rules (match payee, memo or amount, then set the category, optionally a split), applied at import and on demand. This builds on the existing suggestion logic. The old regex remnants were removed, so rules are a fresh design. Not sure I think this should be that high currently.
- **Fix the uncategorized filter for splits.** A split transaction should show in the "uncategorized" view if any part of it is uncategorized.
- **Payee clarity and aliases.** Show clearer transaction details, let users rename a cryptic memo or vendor to an alias, and apply the alias to similar transactions. We can already rename, this is an automatic normalization for the name/memo for future transactions.
- **Saved searches and filter presets.** The search and filters already exist; let users save them. Why?

## Tier 2: Budgeting depth (the biggest gap versus YNAB)

- **Envelope / zero-based budgeting.** Allocate income into budgets, show an unallocated ("Ready to Assign") amount, and let users move money between budgets, including covering an overspend from another budget.
- **Rollover.** Carry unspent or overspent amounts into the next month. Accruing budgets are the closest thing today.
- **Per-category targets.** Monthly amounts per category inside a budget, not just one total.
- **Savings and debt goals.** Target amount and date, with progress and the monthly amount needed.

## Tier 3: Forecasting and reporting

- **Recurring transaction and bill detection.** Find subscriptions and regular bills, list upcoming ones, and flag changes in amount.
- **Cash-flow forecast.** Project balances from recurring items and expected income, with a "safe to spend" figure.
- **Net worth over time.** Needs balances for every account plus manual asset and liability accounts.
- **Better reports.** Income vs. expense, trends, year-over-year comparison, and a flow diagram.
- **Alerts.** Overspending, large transactions, low balance and upcoming bills, delivered by email or push.

## Tier 4: More account types

- **External loans.** Manually updated loans such as mortgages and renovation loans, with a fixed payment and a variable interest/principal split, balance tracking over time, and interest vs. principal per month.
- **Debt payoff planner.** Snowball and avalanche methods, built on the loans above.
- **Investment, property and vehicle accounts.** Mostly manual value tracking, which feeds net worth.
- **Multi-currency.** Today only the account has a currency. Needs exchange rates and currency-aware totals and reports.

## Tier 5: Platform and ecosystem

- **Mobile-friendly UI or PWA.** Installable, quick entry and offline viewing. Local privacy is a challenge here and I am not convinced this is truly worth it.
- **Optional bank sync** (Plaid, MX or similar). Manual import remains the default for privacy. Third-party cost and data sharing make this a deliberate decision, not a given.
- **Importers for other tools.** YNAB, Mint and Actual exports, so people can switch. This is.. important?
- **Documented API and webhooks.** The GraphQL API exists but isn't documented.
- **Security extras.** Two-factor auth or passkeys, password reset by email, and an audit log.
- **Backup and restore.** Built-in export and import of a whole account.
- **Collaboration.** Per-person spending views and comments on transactions. The owner/editor/viewer roles exist but have no collaboration UI.
- **Localization.** `next-intl` is in place; add translations and locale-aware formatting.

## Technical / maintenance

- **API build step.** Compile the API's TypeScript to a deployable `dist/` folder, probably with Vite, instead of running from source.
- **PostGraphile v5.** Watch the release for useful features. It is a large change and could break the generated schema, so adopt it carefully (the schema snapshot test will flag changes).
