import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/wallet/schema.js',
  out: './drizzle/wallet',
  verbose: true,
  strict: true,
});
