import { Knex } from 'knex'
import dotenv from 'dotenv'
dotenv.config()

const config: Knex.Config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 1 },
  migrations: { directory: './db/migrations' },
  seeds: { directory: './db/seeds' },
}

export default config
