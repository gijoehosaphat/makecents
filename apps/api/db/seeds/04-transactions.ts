import { Knex } from 'knex'

// Six calendar months of history ending today (this month and the five before it), generated relative to the
// date the seed runs, so a demo started in any month or year has data for its current month. A fixed random
// seed keeps the shape of the data the same every time.
const MONTHS_OF_HISTORY = 6

const CHECKING = 1
const SAVINGS = 2
const CREDIT_CARD = 3

const OPENING_BALANCE: { [bankAccountId: number]: number } = {
  [CHECKING]: 320000,
  [SAVINGS]: 950000,
  // What the first card payment clears; later payments clear the previous month's charges
  [CREDIT_CARD]: -104257,
}

/** Everything the seed knows about a transaction before it is saved. Amounts are cents; spending is negative. */
interface Draft {
  bankAccountId: number
  posted: Date
  amount: number
  type: string
  name: string
  memo?: string
  category?: string
  customName?: string
  // 'auto' marks the recurring rows the app would categorize by itself; everything else reads as chosen by hand
  source?: 'auto'
  // Everyday spending from the last few days is left uncategorized so there is something to sort in the demo
  recent?: boolean
  splits?: { category: string; cents: number }[]
  transferTo?: Draft
}

// mulberry32: a tiny seeded generator, so reruns produce the same data
function seededRandom(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = seededRandom(20240229)
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]
const dollars = (amount: number) => Math.round(amount * 100)
/** A random amount in cents between two dollar values. */
const cents = (minDollars: number, maxDollars: number) => between(dollars(minDollars), dollars(maxDollars))
/** `count` distinct days of the month between `from` and `to`, in order. */
function days(count: number, from: number, to: number) {
  const chosen = new Set<number>()
  while (chosen.size < Math.min(count, to - from + 1)) chosen.add(between(from, to))
  return [...chosen].sort((a, b) => a - b)
}

export async function seed(knex: Knex): Promise<void> {
  // Deletes ALL existing entries (transfers and splits cascade from the transactions)
  await knex('app_private.transaction').del()

  const categoryIds = new Map<string, number>(
    (await knex('app_private.category').select('id', 'name')).map((row) => [row.name, row.id]),
  )
  const categoryId = (name: string) => {
    const id = categoryIds.get(name)
    if (id === undefined) throw new Error(`Unknown category "${name}", see 03-categories.ts`)
    return id
  }

  const today = new Date()
  const endOfToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  const recentCutoff = endOfToday - 4 * 24 * 60 * 60 * 1000
  const drafts: Draft[] = []

  // Months are generated oldest first, so card payments can total the month before them
  for (let offset = -(MONTHS_OF_HISTORY - 1); offset <= 0; offset++) {
    const first = new Date(Date.UTC(today.getFullYear(), today.getMonth() + offset, 1, 12))
    const year = first.getUTCFullYear()
    const month = first.getUTCMonth()
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const on = (day: number) => new Date(Date.UTC(year, month, Math.min(day, lastDay), 12))

    // Anything dated after today is dropped when the month is not over yet
    const add = (day: number, draft: Omit<Draft, 'posted'>) => {
      const posted = on(day)
      if (posted.getTime() > endOfToday) return undefined
      const complete: Draft = { ...draft, posted, recent: draft.recent && posted.getTime() > recentCutoff }
      drafts.push(complete)
      return complete
    }
    const spend = (day: number, draft: Omit<Draft, 'posted' | 'recent'>) => add(day, { ...draft, recent: true })

    // --- Checking: income, bills and everyday debit spending ---
    // Paid on the 1st and 15th, so even the first days of a month show income
    add(1, {
      bankAccountId: CHECKING,
      amount: dollars(2380),
      type: 'DIRECTDEP',
      name: 'ACME CORP PAYROLL',
      memo: 'PAYROLL DEPOSIT',
      category: 'Paycheque',
      source: 'auto',
    })
    add(15, {
      bankAccountId: CHECKING,
      amount: dollars(2380),
      type: 'DIRECTDEP',
      name: 'ACME CORP PAYROLL',
      memo: 'PAYROLL DEPOSIT',
      category: 'Paycheque',
      source: 'auto',
    })
    if (month % 2 === 0) {
      add(between(18, 26), {
        bankAccountId: CHECKING,
        amount: cents(280, 760),
        type: 'CREDIT',
        name: 'INTERAC E-TRANSFER RECEIVED',
        memo: 'PIXEL WORKS DESIGN - INVOICE',
        category: 'Freelance',
      })
    }

    add(1, {
      bankAccountId: CHECKING,
      amount: -dollars(1650),
      type: 'DEBIT',
      name: 'INTERAC E-TRANSFER SENT',
      memo: 'RENT - M HENDERSON',
      customName: 'Rent',
      category: 'Rent',
      source: 'auto',
    })
    add(3, {
      bankAccountId: CHECKING,
      amount: -dollars(142.6),
      type: 'DIRECTDEBIT',
      name: 'INTACT INSURANCE',
      memo: 'AUTO POLICY',
      category: 'Car Insurance',
      source: 'auto',
    })
    add(5, {
      bankAccountId: CHECKING,
      amount: -dollars(54.99),
      type: 'DIRECTDEBIT',
      name: 'GOODLIFE FITNESS',
      memo: 'MEMBERSHIP',
      category: 'Fitness',
      source: 'auto',
    })
    add(8, {
      bankAccountId: CHECKING,
      amount: -cents(58, 112),
      type: 'DIRECTDEBIT',
      name: 'TORONTO HYDRO',
      memo: 'ELECTRICITY',
      category: 'Utilities',
      source: 'auto',
    })
    add(10, {
      bankAccountId: CHECKING,
      amount: -cents(36, 94),
      type: 'DIRECTDEBIT',
      name: 'ENBRIDGE GAS',
      memo: 'NATURAL GAS',
      category: 'Utilities',
      source: 'auto',
    })
    add(12, {
      bankAccountId: CHECKING,
      amount: -dollars(89.99),
      type: 'DIRECTDEBIT',
      name: 'ROGERS CABLE',
      memo: 'INTERNET',
      category: 'Internet & Phone',
      source: 'auto',
    })
    add(20, {
      bankAccountId: CHECKING,
      amount: -dollars(75),
      type: 'DIRECTDEBIT',
      name: 'BELL MOBILITY',
      memo: 'MOBILE',
      category: 'Internet & Phone',
      source: 'auto',
    })

    const grocers = ['LOBLAWS #1234', 'SOBEYS #0684', 'FRESHCO #812', 'FARM BOY #14', 'NO FRILLS #2207']
    for (const day of days(4, 2, 28)) {
      spend(day, {
        bankAccountId: CHECKING,
        amount: -cents(48, 138),
        type: 'POS',
        name: pick(grocers),
        memo: 'DEBIT PURCHASE',
        category: 'Groceries',
      })
    }
    spend(between(6, 24), {
      bankAccountId: CHECKING,
      amount: -cents(12, 58),
      type: 'POS',
      name: 'SHOPPERS DRUG MART #2314',
      memo: 'DEBIT PURCHASE',
      category: 'Pharmacy',
    })
    if (offset % 2 === 0) {
      add(between(4, 25), {
        bankAccountId: CHECKING,
        amount: -dollars(60),
        type: 'ATM',
        name: 'ATM WITHDRAWAL',
        memo: 'SCOTIABANK ATM',
      })
    }
    if (offset % 3 !== 0) {
      add(between(5, 24), {
        bankAccountId: CHECKING,
        amount: -cents(22, 48),
        type: 'DEBIT',
        name: 'INTERAC E-TRANSFER SENT',
        memo: 'DINNER SPLIT',
        category: 'Restaurants',
      })
    }
    if (offset % 3 === 0) {
      add(between(6, 26), {
        bankAccountId: CHECKING,
        amount: cents(25, 60),
        type: 'CREDIT',
        name: 'INTERAC E-TRANSFER RECEIVED',
        memo: 'FROM DANIEL K',
      })
    }

    // Moving money to savings after payday
    const toSavings = add(16, {
      bankAccountId: CHECKING,
      amount: -dollars(400),
      type: 'XFER',
      name: 'TRANSFER TO SAVINGS',
      memo: 'AUTO SAVE',
    })
    const fromChecking = add(16, {
      bankAccountId: SAVINGS,
      amount: dollars(400),
      type: 'XFER',
      name: 'TRANSFER FROM CHECKING',
      memo: 'AUTO SAVE',
    })
    if (toSavings && fromChecking) toSavings.transferTo = fromChecking

    // --- Savings: interest on the last day of the month ---
    add(lastDay, {
      bankAccountId: SAVINGS,
      amount: cents(38, 52),
      type: 'INT',
      name: 'INTEREST PAID',
      memo: 'MONTHLY INTEREST',
    })

    // --- Credit card ---
    for (const day of days(between(6, 8), 1, 28)) {
      spend(day, {
        bankAccountId: CREDIT_CARD,
        amount: -cents(3.25, 8.9),
        type: 'DEBIT',
        name: pick(['TIM HORTONS #0412', 'STARBUCKS #11456', 'SECOND CUP #302', 'BALZAC COFFEE']),
        category: 'Coffee & Snacks',
      })
    }
    for (const day of days(between(4, 6), 1, 28)) {
      spend(day, {
        bankAccountId: CREDIT_CARD,
        amount: -cents(24, 96),
        type: 'DEBIT',
        name: pick([
          'PIZZERIA LIBRETTO',
          'THE KEG STEAKHOUSE',
          'SWISS CHALET #118',
          'MARKET BISTRO',
          'DOORDASH*SUSHI HOUSE',
          'BANH MI BOYS',
        ]),
        category: 'Restaurants',
      })
    }
    for (const day of days(2, 3, 27)) {
      spend(day, {
        bankAccountId: CREDIT_CARD,
        amount: -cents(52, 74),
        type: 'DEBIT',
        name: pick(['SHELL C12345', 'PETRO-CANADA #4411', 'ESSO 7-ELEVEN #031']),
        category: 'Gas',
      })
    }
    spend(between(2, 8), {
      bankAccountId: CREDIT_CARD,
      amount: -cents(20, 40),
      type: 'DEBIT',
      name: 'PRESTO FARE',
      memo: 'LOAD CARD',
      category: 'Transit & Rideshare',
    })
    for (const day of days(2, 5, 28)) {
      spend(day, {
        bankAccountId: CREDIT_CARD,
        amount: -cents(12, 31),
        type: 'DEBIT',
        name: 'UBER *TRIP',
        memo: 'HELP.UBER.COM',
        category: 'Transit & Rideshare',
      })
    }
    for (const day of days(between(1, 2), 4, 28)) {
      spend(day, {
        bankAccountId: CREDIT_CARD,
        amount: -cents(22, 68),
        type: 'DEBIT',
        name: 'LCBO #0234',
        category: 'Entertainment',
      })
    }
    if (offset % 2 === 0) {
      spend(between(5, 27), {
        bankAccountId: CREDIT_CARD,
        amount: -cents(28, 44),
        type: 'DEBIT',
        name: 'CINEPLEX #3351',
        category: 'Entertainment',
      })
    }
    for (const [day, name, amount] of [
      [9, 'NETFLIX.COM', 17.99],
      [14, 'SPOTIFY P1A2B3C4', 11.99],
      [21, 'APPLE.COM/BILL', 3.99],
    ] as const) {
      add(day, {
        bankAccountId: CREDIT_CARD,
        amount: -dollars(amount),
        type: 'DEBIT',
        name,
        category: 'Subscriptions',
        source: 'auto',
      })
    }
    for (const day of days(between(1, 3), 2, 28)) {
      spend(day, {
        bankAccountId: CREDIT_CARD,
        amount: -cents(24, 118),
        type: 'DEBIT',
        name: pick(['AMAZON.CA', 'UNIQLO EATON CENTRE', 'WINNERS #308', 'INDIGO BOOKS #112', 'LULULEMON ATHLETICA']),
        category: 'Shopping',
      })
    }
    if (random() < 0.6) {
      spend(between(3, 27), {
        bankAccountId: CREDIT_CARD,
        amount: -cents(38, 96),
        type: 'DEBIT',
        name: pick(['CANADIAN TIRE #045', 'HOME DEPOT #7054', 'IKEA NORTH YORK']),
        category: 'Home & Garden',
      })
    }
    if (offset % 3 === 0) {
      spend(between(4, 24), {
        bankAccountId: CREDIT_CARD,
        amount: -cents(30, 85),
        type: 'DEBIT',
        name: 'ETSY.COM',
        category: 'Gifts & Donations',
      })
    }

    // A warehouse run split across what was in the cart: the card is charged once, the budgets see each part
    const costco = spend(between(8, 26), {
      bankAccountId: CREDIT_CARD,
      amount: -cents(190, 270),
      type: 'DEBIT',
      name: 'COSTCO WHOLESALE #321',
      category: 'Groceries',
    })
    if (costco) {
      costco.splits = [
        { category: 'Home & Garden', cents: cents(30, 55) },
        { category: offset % 2 === 0 ? 'Pharmacy' : 'Shopping', cents: cents(15, 45) },
      ]
    }

    // One-off events at fixed points in the history
    if (offset === -4 || offset === -1) {
      add(between(8, 20), {
        bankAccountId: CREDIT_CARD,
        amount: -dollars(offset === -4 ? 185 : 240),
        type: 'DEBIT',
        name: 'BRIGHTSMILE DENTAL',
        category: 'Medical & Dental',
      })
    }
    if (offset === -3) {
      add(6, {
        bankAccountId: CREDIT_CARD,
        amount: -dollars(642.18),
        type: 'DEBIT',
        name: 'AIR CANADA 0142157890',
        category: 'Travel',
      })
      add(8, {
        bankAccountId: CREDIT_CARD,
        amount: -dollars(480),
        type: 'DEBIT',
        name: 'AIRBNB * HMXQ7ZP4',
        category: 'Travel',
      })
    }
    if (offset === -1) {
      add(12, {
        bankAccountId: CREDIT_CARD,
        amount: -dollars(189),
        type: 'DEBIT',
        name: 'VIA RAIL CANADA',
        category: 'Travel',
      })
      // Also split on the debit side, like a drugstore trip that included a few non-pharmacy items
      add(17, {
        bankAccountId: CHECKING,
        amount: -dollars(86.4),
        type: 'POS',
        name: 'SHOPPERS DRUG MART #2314',
        memo: 'DEBIT PURCHASE',
        category: 'Pharmacy',
        splits: [{ category: 'Shopping', cents: dollars(24) }],
      })
    }
    if (offset === -2) {
      add(19, {
        bankAccountId: CREDIT_CARD,
        amount: dollars(34.99),
        type: 'CREDIT',
        name: 'AMAZON.CA REFUND',
        category: 'Shopping',
      })
    }

    // The card is paid in full on the 22nd: the first payment clears the opening balance, the rest the month before
    const paymentDate = on(22)
    if (paymentDate.getTime() <= endOfToday) {
      const owed =
        offset === -(MONTHS_OF_HISTORY - 1)
          ? -OPENING_BALANCE[CREDIT_CARD]
          : -drafts
              .filter(
                (draft) =>
                  draft.bankAccountId === CREDIT_CARD &&
                  draft.type !== 'PAYMENT' &&
                  draft.posted.getUTCFullYear() * 12 + draft.posted.getUTCMonth() === year * 12 + month - 1,
              )
              .reduce((sum, draft) => sum + draft.amount, 0)
      const payment = add(22, {
        bankAccountId: CHECKING,
        amount: -owed,
        type: 'PAYMENT',
        name: 'PAYMENT - REWARDS VISA',
        memo: 'CREDIT CARD PAYMENT',
      })
      const received = add(22, {
        bankAccountId: CREDIT_CARD,
        amount: owed,
        type: 'PAYMENT',
        name: 'PAYMENT - THANK YOU',
      })
      if (payment && received) payment.transferTo = received
    }
  }

  // Save the plain rows and the parents of splits first; the splits and transfers refer back to their ids
  const keyOf = (draft: Draft, index: number) =>
    `${['', 'CHK', 'SAV', 'CC'][draft.bankAccountId]}${draft.posted.toISOString().slice(0, 10).replace(/-/g, '')}${String(index).padStart(4, '0')}`

  const rows = drafts.map((draft, index) => ({
    posted: draft.posted,
    amount: draft.amount,
    original_amount: draft.amount,
    type: draft.type,
    name: draft.name,
    memo: draft.memo ?? null,
    custom_name: draft.customName ?? null,
    bank_transaction_id: keyOf(draft, index),
    bank_account_id: draft.bankAccountId,
    category_id: draft.category && !draft.recent ? categoryId(draft.category) : null,
    category_source: draft.category && !draft.recent ? (draft.source ?? 'manual') : null,
  }))

  const idByKey = new Map<string, number>()
  for (let start = 0; start < rows.length; start += 200) {
    const saved = await knex('app_private.transaction')
      .insert(rows.slice(start, start + 200))
      .returning(['id', 'bank_transaction_id'])
    for (const row of saved) idByKey.set(row.bank_transaction_id, row.id)
  }
  const idOf = (draft: Draft) => idByKey.get(rows[drafts.indexOf(draft)].bank_transaction_id)!

  // Split parts: the database trims the original row down to whatever the parts leave, and the parts take on
  // its date and bank account
  const parts = drafts.flatMap((draft) =>
    (draft.splits ?? []).map((split) => ({
      split_source_id: idOf(draft),
      amount: Math.sign(draft.amount) * split.cents,
      original_amount: Math.sign(draft.amount) * split.cents,
      type: draft.type,
      name: draft.name,
      memo: draft.memo ?? null,
      custom_name: draft.customName ?? null,
      category_id: categoryId(split.category),
      posted: draft.posted,
      bank_account_id: draft.bankAccountId,
    })),
  )
  if (parts.length) await knex('app_private.transaction').insert(parts)

  // A transfer links the money leaving one account to the same money arriving in another
  const transfers = drafts
    .filter((draft) => draft.transferTo)
    .map((draft) => ({
      transaction_source_id: idOf(draft),
      transaction_target_id: idOf(draft.transferTo!),
    }))
  if (transfers.length) await knex('app_private.transfer').insert(transfers)

  // Balances start from an opening point just before the first transaction, with the transactions added on top
  const openingDate = new Date(Date.UTC(today.getFullYear(), today.getMonth() - (MONTHS_OF_HISTORY - 1), 1, 12))
  openingDate.setUTCDate(0)
  await knex('app_private.bank_account_reconciliation').insert(
    [CHECKING, SAVINGS, CREDIT_CARD].map((bankAccountId) => ({
      bank_account_id: bankAccountId,
      balance: OPENING_BALANCE[bankAccountId],
      as_of: openingDate,
    })),
  )

  console.log(
    `Seeded ${rows.length} transactions, ${parts.length} split parts and ${transfers.length} transfers ` +
      `from ${openingDate.toISOString().slice(0, 10)} to ${today.toISOString().slice(0, 10)}`,
  )
}
