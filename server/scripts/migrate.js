import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../.env') });

const { connectDB } = await import('../src/config/db.js');
const { seedDefaults } = await import('../src/config/seedDefaults.js');
const Category = (await import('../src/models/Category.js')).default;
const Item = (await import('../src/models/Item.js')).default;
const Loan = (await import('../src/models/Loan.js')).default;
const User = (await import('../src/models/User.js')).default;
const { DEFAULT_PREFERENCES } = await import('../src/models/User.js');
const { REMINDER_CHANNELS, normaliseEmail } = await import('../src/utils/constants.js');
const { priorityDefaults, refreshSchedule } = await import('../src/services/reminderService.js');

if (!process.env.MONGODB_URI) {
  console.error('[migrate] MONGODB_URI is not set - copy server/.env.example to server/.env');
  process.exit(1);
}

// Old free-text item categories map onto the six shared categories that now drive
// default priorities. Anything unrecognised falls through to "Other".
const CATEGORY_BY_OLD_NAME = {
  Books: 'Books & Notes',
  Electronics: 'Electronics',
  Stationery: 'Accessories',
  Sports: 'Other',
  Tools: 'Other',
  Clothing: 'Accessories',
  Music: 'Other',
  Home: 'Other',
  Other: 'Other',
  'Books & Notes': 'Books & Notes',
  Calculators: 'Calculators',
  'Money / Valuables': 'Money / Valuables',
  Accessories: 'Accessories',
};

async function dropIndexIfExists(collection, name) {
  const existing = await collection.indexExists(name);
  if (!existing) {
    console.log(`[index] ${collection.collectionName}.${name} already absent`);
    return;
  }
  await collection.dropIndex(name);
  console.log(`[index] dropped ${collection.collectionName}.${name}`);
}

async function migrateItems(categoryIdByName) {
  const raw = Item.collection;
  const legacy = await raw.find({ category: { $exists: true } }).toArray();
  let moved = 0;

  for (const doc of legacy) {
    const targetName = CATEGORY_BY_OLD_NAME[doc.category] ?? 'Other';
    const categoryId = categoryIdByName.get(targetName) ?? categoryIdByName.get('Other');

    const update = { $unset: { category: '' } };
    // Only claim the categoryId when the doc does not already carry a valid one, so a
    // re-run never overwrites a category a lender picked after the first migration.
    if (!doc.categoryId) update.$set = { categoryId };

    await raw.updateOne({ _id: doc._id }, update);
    moved += 1;
    console.log(`[items] ${doc.title ?? doc._id}: "${doc.category}" -> ${targetName}`);
  }

  // Items already migrated but still holding a stale string, and items with neither field.
  const orphaned = await raw.updateMany(
    { categoryId: { $in: [null, undefined] } },
    { $set: { categoryId: categoryIdByName.get('Other') } },
  );

  console.log(`[items] migrated ${moved} legacy rows, backfilled ${orphaned.modifiedCount} orphans`);
}

async function renameBorrowedAt() {
  // Done on the raw collection because `borrowedAt` is no longer in the schema, so the
  // model would silently drop it and default lentAt to "now" on the next save.
  const result = await Loan.collection.updateMany(
    { borrowedAt: { $exists: true }, lentAt: { $exists: false } },
    { $rename: { borrowedAt: 'lentAt' } },
  );
  console.log(`[loans] renamed borrowedAt -> lentAt on ${result.modifiedCount} rows`);
}

async function migrateUsers() {
  // Profile details moved from top-level `phone` into `profile`, and preferences and
  // session versioning were added. Raw updates are used because the current schema no
  // longer exposes the legacy field, so a model save would silently drop it.
  const raw = User.collection;
  const docs = await raw.find({}).toArray();
  let moved = 0;

  for (const doc of docs) {
    const profile = doc.profile && typeof doc.profile === 'object' ? doc.profile : {};
    const preferences =
      doc.preferences && typeof doc.preferences === 'object' ? doc.preferences : {};
    const needsUpdate =
      doc.phone !== undefined ||
      !doc.profile ||
      profile.avatarUrl === undefined ||
      !doc.preferences ||
      !REMINDER_CHANNELS.includes(preferences.defaultReminderChannel) ||
      typeof preferences.emailNotifications !== 'boolean' ||
      typeof preferences.whatsappNotifications !== 'boolean' ||
      doc.authVersion === undefined ||
      doc.deletedAt === undefined;

    if (!needsUpdate) continue;

    const update = {
      $set: {
        email: normaliseEmail(doc.email),
        profile: {
          phone: profile.phone ?? doc.phone ?? '',
          avatarUrl: profile.avatarUrl ?? '',
        },
        preferences: {
          defaultReminderChannel: REMINDER_CHANNELS.includes(preferences.defaultReminderChannel)
            ? preferences.defaultReminderChannel
            : DEFAULT_PREFERENCES.defaultReminderChannel,
          emailNotifications:
            typeof preferences.emailNotifications === 'boolean'
              ? preferences.emailNotifications
              : DEFAULT_PREFERENCES.emailNotifications,
          whatsappNotifications:
            typeof preferences.whatsappNotifications === 'boolean'
              ? preferences.whatsappNotifications
              : DEFAULT_PREFERENCES.whatsappNotifications,
        },
        authVersion: Number.isInteger(doc.authVersion) ? doc.authVersion : 0,
        deletedAt: doc.deletedAt ?? null,
      },
    };
    if (doc.phone !== undefined) update.$unset = { phone: '' };

    await raw.updateOne({ _id: doc._id }, update);
    moved += 1;
  }

  console.log(`[users] normalised ${moved} profiles and preferences`);
}

async function backfillLoans() {
  const users = new Map(
    (await User.find({}, { name: 1, email: 1, 'profile.phone': 1 }).lean()).map((user) => [
      String(user._id),
      user,
    ]),
  );
  const items = new Map(
    (await Item.collection.find({}, { title: 1, categoryId: 1 }).toArray()).map((item) => [
      String(item._id),
      item,
    ]),
  );
  const categoryPriority = new Map(
    (await Category.find({}, { defaultPriority: 1 }).lean()).map((category) => [
      String(category._id),
      category.defaultPriority,
    ]),
  );

  // Every existence test below reads the raw document on purpose: the model applies
  // schema defaults on load (priority "medium", origin "request", a reminders
  // subdocument), which would make a pre-migration row look already filled in.
  const stored = await Loan.collection.find({}).toArray();
  let touched = 0;

  for (const doc of stored) {
    const loan = await Loan.findById(doc._id);
    if (!loan) continue;

    const linkedItem = doc.itemId ? items.get(String(doc.itemId)) : null;
    const borrowerUser = doc.borrowerId ? users.get(String(doc.borrowerId)) : null;

    if (!doc.itemName) {
      loan.itemName = linkedItem?.title ?? 'Lent item';
    }
    if (!doc.categoryId && linkedItem?.categoryId) {
      loan.categoryId = linkedItem.categoryId;
    }
    if (!doc.borrower) {
      // Request-created loans point at a registered borrower; manual ones may not. Keep
      // consent unrecorded, matching what approveRequest now writes for a fresh approval.
      loan.borrower = {
        name: borrowerUser?.name ?? 'Borrower',
        email: borrowerUser?.email ?? '',
        phone: borrowerUser?.profile?.phone ?? '',
        consent: { email: false, whatsapp: false, recordedAt: null },
      };
    }
    if (!doc.origin) {
      loan.origin = doc.requestId ? 'request' : 'manual';
    }
    if (!doc.priority) {
      const categoryRef = doc.categoryId ?? linkedItem?.categoryId ?? null;
      loan.priority = (categoryRef && categoryPriority.get(String(categoryRef))) || 'medium';
      loan.prioritySource = 'category';
    }
    if (!doc.reminders) {
      loan.reminders.channels = priorityDefaults(loan.priority).channels;
    }

    await refreshSchedule(loan);
    await loan.save();
    touched += 1;
  }

  console.log(`[loans] backfilled and re-armed ${touched} rows`);
}

await connectDB();

// Seed first so the shared categories exist for items and loans to point at.
const seeded = await seedDefaults();
console.log(`[seed] categories added: ${seeded.categories}, templates added: ${seeded.templates}`);

const categoryIdByName = new Map(
  (await Category.find({ ownerId: null }, { name: 1 }).lean()).map((category) => [
    category.name,
    category._id,
  ]),
);

// Mongoose will not replace a same-named index whose options changed, so the stale
// definitions are dropped here and recreated from the schemas by syncIndexes below.
await dropIndexIfExists(Loan.collection, 'requestId_1');
await dropIndexIfExists(Loan.collection, 'itemId_1');
await dropIndexIfExists(Item.collection, 'status_1_category_1');

await renameBorrowedAt();
await migrateUsers();
await migrateItems(categoryIdByName);
await backfillLoans();

await Item.syncIndexes();
await Loan.syncIndexes();
console.log('[index] rebuilt item and loan indexes from the current schemas');

await mongoose.disconnect();
console.log('[migrate] done');
