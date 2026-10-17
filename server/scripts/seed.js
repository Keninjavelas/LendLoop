import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

const { connectDB } = await import('../src/config/db.js');
const { seedDefaults } = await import('../src/config/seedDefaults.js');

if (!process.env.MONGODB_URI) {
  console.error('[seed] MONGODB_URI is not set - copy server/.env.example to server/.env');
  process.exit(1);
}

await connectDB();
const summary = await seedDefaults();
console.log(
  `[seed] shared categories added: ${summary.categories}, reminder templates added: ${summary.templates}`,
);
console.log('[seed] existing rows are left untouched, so lender edits to defaults survive a reseed');
await mongoose.disconnect();
