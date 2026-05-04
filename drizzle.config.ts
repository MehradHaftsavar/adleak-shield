import type { Config } from 'drizzle-kit';

export default {
  schema: './drizzle/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.DATABASE_SERVER || 'adleak-sql-server.database.windows.net',
    port: 1433,
    user: process.env.DATABASE_USER || 'adleak-admin',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'adleak-db',
    ssl: true,
  },
} satisfies Config;
