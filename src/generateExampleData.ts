import path from 'path'
import ejs from 'ejs'
import { mkdirSync, writeFileSync } from 'fs'

async function generateExampleData() {
  const templatePath = path.join(__dirname, './templates/example-transactions-template.ejs')

  // Set up 3-month date range (ending today)
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - 3)

  const templateData = {
    startDate: startDate,
    endDate: endDate,
    checkingBalance: '3542.75',
    savingsBalance: '15789.32',
    creditCardBalance: '-1245.68',
  }

  const qfx = await ejs.renderFile(templatePath, templateData)

  mkdirSync(path.join(__dirname, '../dist'), { recursive: true })

  writeFileSync(path.join(__dirname, '../dist/example-transactions.qfx'), qfx, { encoding: 'utf-8', flag: 'w' })

  console.log('✓ Generated example-transactions.qfx with 3 months of data')
  console.log(`  Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
  console.log(`  Accounts: Checking, Savings, Credit Card`)
}

generateExampleData()
