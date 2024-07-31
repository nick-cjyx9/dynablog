/* eslint-disable node/prefer-global/process */
import { type Config, defineConfig } from 'drizzle-kit'
import 'dotenv/config'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migration',
  dialect: 'sqlite',
  dbCredentials: {
    accountId: process.env.ACCOUNT_ID,
    databaseId: process.env.DB_ID,
    token: process.env.TOKEN,
  },
  driver: 'd1-http',
  verbose: true,
  strict: true,
} as Config)
