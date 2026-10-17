import Category from '../models/Category.js';
import ReminderTemplate from '../models/ReminderTemplate.js';

// The six shared categories from the design note, with the default priority each one
// gives a new lending entry.
export const SYSTEM_CATEGORIES = [
  {
    name: 'Books & Notes',
    defaultPriority: 'low',
    description: 'Textbooks, notebooks, printed notes and handouts',
  },
  {
    name: 'Electronics',
    defaultPriority: 'high',
    description: 'Laptops, tablets, phones, chargers and other devices',
  },
  {
    name: 'Calculators',
    defaultPriority: 'medium',
    description: 'Scientific and graphing calculators',
  },
  {
    name: 'Money / Valuables',
    defaultPriority: 'high',
    description: 'Cash, ID cards, keys, passes and anything expensive to replace',
  },
  {
    name: 'Accessories',
    defaultPriority: 'low',
    description: 'Bags, stationery, sports kit and small everyday things',
  },
  {
    name: 'Other',
    defaultPriority: 'medium',
    description: 'Anything that does not fit another category',
  },
];

function priorityTemplates() {
  return [
    {
      name: 'Low priority — gentle nudge',
      scope: 'priority',
      priority: 'low',
      subject: '{itemName} is {duePhrase}',
      body:
        'Hi {borrowerName},\n\n' +
        'A quick note that {itemName} ({category}) is {duePhrase} — {dueDate}.\n' +
        'No rush, just keep it on your list.\n\n' +
        'Thanks,\n{lenderName}',
    },
    {
      name: 'Medium priority — return reminder',
      scope: 'priority',
      priority: 'medium',
      subject: 'Reminder: {itemName} is {duePhrase}',
      body:
        'Hi {borrowerName},\n\n' +
        'This is a reminder that {itemName} is {duePhrase} ({dueDate}). ' +
        'Please arrange its return by the deadline.\n\n' +
        'Thank you,\n{lenderName}',
    },
    {
      name: 'High priority — urgent return',
      scope: 'priority',
      priority: 'high',
      subject: 'Urgent: {itemName} is {duePhrase}',
      body:
        'Hi {borrowerName},\n\n' +
        '{itemName} is {duePhrase} — the agreed deadline is {dueDate}. ' +
        'It is marked as {priority} priority, so please return it on time or reply with a new date.\n\n' +
        'Thank you,\n{lenderName}',
    },
    {
      name: 'Friendly return reminder',
      scope: 'general',
      subject: 'Reminder: {itemName} is {duePhrase}',
      body:
        'Hi {borrowerName},\n\n' +
        'Just a friendly reminder that {itemName} ({category}) is {duePhrase} — {dueDate}.\n\n' +
        'Thanks,\n{lenderName}',
    },
  ];
}

function categoryTemplates(categoryIds) {
  return [
    {
      name: 'Electronics — return with accessories',
      scope: 'category',
      categoryId: categoryIds.get('Electronics'),
      subject: '{itemName} — please return it with its charger',
      body:
        'Hi {borrowerName},\n\n' +
        'The {itemName} you borrowed is {duePhrase} ({dueDate}). ' +
        'Please return it with any cables, chargers or cases that came with it, ' +
        'and let me know straight away if anything is damaged.\n\n' +
        'Thanks,\n{lenderName}',
    },
    {
      name: 'Valuables — arrange a handover',
      scope: 'category',
      categoryId: categoryIds.get('Money / Valuables'),
      subject: '{itemName} is {duePhrase}',
      body:
        'Hi {borrowerName},\n\n' +
        'A reminder that {itemName} is {duePhrase} ({dueDate}). ' +
        'As it is a valuable, please hand it back in person or tell me a time that suits you.\n\n' +
        'Thank you,\n{lenderName}',
    },
  ].filter((template) => template.categoryId);
}

async function insertOne(Model, filter, doc) {
  if (await Model.exists(filter)) return false;
  try {
    await Model.create(doc);
    return true;
  } catch (error) {
    // Two server processes seeding at once: the unique index already did the job.
    if (error?.code === 11000) return false;
    throw error;
  }
}

// Idempotent by design and insert-only: a lender who changed a shared category's default
// priority keeps that change across restarts instead of having it silently rewritten.
export async function seedDefaults() {
  const summary = { categories: 0, templates: 0 };

  for (const category of SYSTEM_CATEGORIES) {
    const created = await insertOne(
      Category,
      { ownerId: null, name: category.name },
      { ...category, ownerId: null, isSystem: true },
    );
    if (created) summary.categories += 1;
  }

  const systemCategories = await Category.find({ ownerId: null }, { name: 1 }).lean();
  const categoryIds = new Map(systemCategories.map((category) => [category.name, category._id]));

  for (const template of [...priorityTemplates(), ...categoryTemplates(categoryIds)]) {
    const created = await insertOne(
      ReminderTemplate,
      { ownerId: null, name: template.name },
      { ...template, ownerId: null, isSystem: true },
    );
    if (created) summary.templates += 1;
  }

  return summary;
}
