import { Knex } from 'knex'

const ACCOUNT_ID = 1

// Groups and their categories. Payroll groups hold income, which fills Ready to Assign and can never be part of a
// budget.
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

// Envelope budgeting starts this many months before the current one, so the demo has history to carry over and
// reads the same in any year.
const START_MONTHS_AGO = 3

// Amounts are cents. `amount` is the planned monthly assignment, which every month from the start gets. An
// `openingBalance` is money the budget already held when envelope budgeting started.
const BUDGETS: {
  name: string
  amount: number
  categories: string[]
  openingBalance?: number
  /** Assigned this month instead of the planned amount, so the demo shows an overspent budget to cover. */
  currentMonthAmount?: number
}[] = [
  { name: 'Groceries', amount: 70000, categories: ['Groceries'] },
  { name: 'Eating Out', amount: 35000, categories: ['Restaurants', 'Coffee & Snacks'], currentMonthAmount: 5000 },
  { name: 'Getting Around', amount: 30000, categories: ['Gas', 'Transit & Rideshare'] },
  { name: 'Utilities & Phone', amount: 35000, categories: ['Utilities', 'Internet & Phone'] },
  { name: 'Fun & Subscriptions', amount: 20000, categories: ['Entertainment', 'Subscriptions'] },
  { name: 'Health', amount: 15000, categories: ['Pharmacy', 'Medical & Dental'] },
  { name: 'Vacation Fund', amount: 25000, categories: ['Travel'] },
  { name: 'Shopping & Home', amount: 15000, categories: ['Shopping', 'Home & Garden'], openingBalance: 20000 },
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

  // Months as the first of the month, YYYY-MM-01, from the start month through the current one.
  const now = new Date()
  const months = Array.from({ length: START_MONTHS_AGO + 1 }, (_, index) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth() - START_MONTHS_AGO + index, 1)).toISOString().slice(0, 10),
  )
  await knex('app_private.account').where({ id: ACCOUNT_ID }).update({ envelope_start_month: months[0] })

  for (const budget of BUDGETS) {
    const [{ id: budgetId }] = await knex('app_private.budget')
      .insert({
        account_id: ACCOUNT_ID,
        user_id: 1,
        name: budget.name,
        amount: budget.amount,
        starting_amount: budget.openingBalance ?? 0,
      })
      .returning('id')

    await knex('app_private.budget_category').insert(
      budget.categories.map((name) => {
        const categoryId = categoryIds.get(name)
        if (categoryId === undefined) throw new Error(`Budget "${budget.name}" uses unknown category "${name}"`)
        return { account_id: ACCOUNT_ID, user_id: 1, budget_id: budgetId, category_id: categoryId }
      }),
    )

    await knex('app_private.budget_assignment').insert(
      months.map((month, index) => ({
        account_id: ACCOUNT_ID,
        budget_id: budgetId,
        month,
        amount: index === months.length - 1 ? (budget.currentMonthAmount ?? budget.amount) : budget.amount,
      })),
    )
  }
}
