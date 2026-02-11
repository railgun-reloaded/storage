import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/wallet/schema.ts',
  out: './drizzle/wallet',
  verbose: true,
  strict: true,
});
