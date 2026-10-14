import { Knex } from 'knex'

const ACCOUNT_ID = 1

// Groups and their categories. Payroll groups hold income, which the app uses to work out expected
// monthly income and which can never be part of a budget.
const GROUPS: { name: string; kind: 'spending' | 'payroll'; categories: string[] }[] = [
  { name: 'Income', kind: 'payroll', categories: ['Paycheque', 'Freelance'] },
  { name: 'Housing', kind: 'spending', categories: ['Rent', 'Utilities', 'Internet & Phone', 'Home & Garden'] },
  { name: 'Food', kind: 'spending', categories: ['Groceries', 'Restaurants', 'Coffee & Snacks'] },
  { name: 'Transportation', kind: 'spending', categories: ['Gas', 'Transit & Rideshare', 'Car Insurance'] },
  {
    name: 'Lifestyle',
    kind: 'spending',
    categories: ['Entertainment', 'Subscriptions', 'Shopping', 'Fitness', 'Travel', 'Gifts & Donations'],
  },
  { name: 'Health', kind: 'spending', categories: ['Pharmacy', 'Medical & Dental'] },
]

// Amounts are cents. A budget without an effective date is a plain monthly limit. One with an effective
// date accrues its monthly amount from that date and carries what is left over (or overspent) forward.
// `accruingMonths` is how many months back the accrual starts, so the demo reads the same in any year.
const BUDGETS: {
  name: string
  amount: number
  categories: string[]
  accruingMonths?: number
  startingAmount?: number
}[] = [
  { name: 'Groceries', amount: 70000, categories: ['Groceries'] },
  { name: 'Eating Out', amount: 35000, categories: ['Restaurants', 'Coffee & Snacks'] },
  { name: 'Getting Around', amount: 30000, categories: ['Gas', 'Transit & Rideshare'] },
  { name: 'Utilities & Phone', amount: 35000, categories: ['Utilities', 'Internet & Phone'] },
  { name: 'Fun & Subscriptions', amount: 20000, categories: ['Entertainment', 'Subscriptions'] },
  { name: 'Health', amount: 15000, categories: ['Pharmacy', 'Medical & Dental'] },
  { name: 'Vacation Fund', amount: 25000, categories: ['Travel'], accruingMonths: 5 },
  {
    name: 'Shopping & Home',
    amount: 15000,
    categories: ['Shopping', 'Home & Garden'],
    accruingMonths: 5,
    startingAmount: 20000,
  },
]

export async function seed(knex: Knex): Promise<void> {
  // Categories, groups and budgets were already removed with the account (see 02-accounts.ts)
  const categoryIds = new Map<string, number>()

  for (const group of GROUPS) {
    const [{ id: groupId }] = await knex('app_private.custom_category_group')
      .insert({ account_id: ACCOUNT_ID, name: group.name, kind: group.kind })
      .returning('id')

    for (const name of group.categories) {
      const [{ id: categoryId }] = await knex('app_private.category')
        .insert({ account_id: ACCOUNT_ID, user_id: 1, name, kind: group.kind })
        .returning('id')
      categoryIds.set(name, categoryId)
      await knex('app_private.category_group').insert({
        account_id: ACCOUNT_ID,
        category_id: categoryId,
        custom_category_group_id: groupId,
      })
    }
  }

  const now = new Date()
  for (const budget of BUDGETS) {
    // Noon UTC on the 1st keeps the calendar date the same in every time zone
    const effectiveDate =
      budget.accruingMonths === undefined
        ? null
        : new Date(Date.UTC(now.getFullYear(), now.getMonth() - budget.accruingMonths, 1, 12))

    const [{ id: budgetId }] = await knex('app_private.budget')
      .insert({
        account_id: ACCOUNT_ID,
        user_id: 1,
        name: budget.name,
        amount: budget.amount,
        effective_date: effectiveDate,
        starting_amount: effectiveDate ? (budget.startingAmount ?? 0) : null,
      })
      .returning('id')

    await knex('app_private.budget_category').insert(
      budget.categories.map((name) => {
        const categoryId = categoryIds.get(name)
        if (categoryId === undefined) throw new Error(`Budget "${budget.name}" uses unknown category "${name}"`)
        return { account_id: ACCOUNT_ID, user_id: 1, budget_id: budgetId, category_id: categoryId }
      }),
    )
  }
}
