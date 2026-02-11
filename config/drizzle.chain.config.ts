import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/chain/schema.ts',
  out: './drizzle/chain',
  verbose: true,
  strict: true,
});
