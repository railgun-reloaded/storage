import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/chain/schema.js',
  out: './drizzle/chain',
  verbose: true,
  strict: true,
});
