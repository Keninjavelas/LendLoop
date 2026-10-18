import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRIORITY_SCHEDULES } from '../src/utils/constants.js';
import {
  applyCategorySelection,
  applyItemSelection,
  applyPrioritySelection,
  buildPayload,
  channelReadiness,
  createEntryDefaults,
  entryWarnings,
  parseOffsets,
  reminderPlan,
  resolvePriority,
  validateEntry,
  validateStep,
} from '../src/utils/lendingEntry.js';

const NOW = new Date(2026, 9, 18, 12, 0, 0);
const HIGH_CATEGORY = { _id: 'cat-high', name: 'Electronics', defaultPriority: 'high' };
const LOW_CATEGORY = { _id: 'cat-low', name: 'Accessories', defaultPriority: 'low' };

test('builds stable defaults from priorities, preferences and the current day', () => {
  const defaults = createEntryDefaults(null, NOW);

  assert.equal(defaults.lentAt, '2026-10-18');
  assert.equal(defaults.dueDate, '2026-10-19');
  assert.equal(defaults.priority, 'category-default');
  assert.equal(defaults.remindersEnabled, true);
  assert.equal(defaults.frequency, 'daily');
  assert.deepEqual(defaults.channels, PRIORITY_SCHEDULES.medium.channels);

  const preferred = createEntryDefaults(
    {
      defaultReminderChannel: 'whatsapp',
      emailNotifications: false,
      whatsappNotifications: true,
    },
    NOW,
  );
  assert.deepEqual(preferred.channels, ['whatsapp']);
});

test('resolves category inheritance without losing a manual override', () => {
  assert.equal(resolvePriority('category-default', HIGH_CATEGORY), 'high');
  assert.equal(resolvePriority('low', HIGH_CATEGORY), 'low');
  assert.equal(resolvePriority(undefined, null), 'medium');
});

test('category selection recomputes untouched channels and preserves hand-picked ones', () => {
  const defaults = createEntryDefaults(null, NOW);
  const inherited = applyCategorySelection(defaults, HIGH_CATEGORY, null, false);

  assert.equal(inherited.categoryId, HIGH_CATEGORY._id);
  assert.deepEqual(inherited.channels, PRIORITY_SCHEDULES.high.channels);

  const touched = applyCategorySelection(
    { ...defaults, channels: ['email'] },
    HIGH_CATEGORY,
    null,
    true,
  );
  assert.deepEqual(touched.channels, ['email']);

  const manual = applyCategorySelection(
    { ...defaults, priority: 'low' },
    HIGH_CATEGORY,
    null,
    false,
  );
  assert.deepEqual(manual.channels, defaults.channels);
});

test('priority selection follows the category default until channels are touched', () => {
  const defaults = createEntryDefaults(null, NOW);
  const high = applyPrioritySelection(defaults, 'high', HIGH_CATEGORY, null, false);
  assert.deepEqual(high.channels, PRIORITY_SCHEDULES.high.channels);

  const backToCategory = applyPrioritySelection(high, 'category-default', HIGH_CATEGORY, null, false);
  assert.deepEqual(backToCategory.channels, PRIORITY_SCHEDULES.high.channels);

  const touched = applyPrioritySelection(
    { ...defaults, channels: ['email'] },
    'high',
    HIGH_CATEGORY,
    null,
    true,
  );
  assert.deepEqual(touched.channels, ['email']);
});

test('linking a listing prefills its fields and fixes channel defaults', () => {
  const defaults = createEntryDefaults(null, NOW);
  const item = {
    _id: 'item-1',
    title: 'Oscilloscope',
    description: 'Two-channel bench oscilloscope',
    categoryId: HIGH_CATEGORY,
  };
  const linked = applyItemSelection(defaults, item, [HIGH_CATEGORY], null, false);

  assert.equal(linked.itemId, item._id);
  assert.equal(linked.itemName, item.title);
  assert.equal(linked.description, item.description);
  assert.equal(linked.categoryId, HIGH_CATEGORY._id);
  assert.deepEqual(linked.channels, PRIORITY_SCHEDULES.high.channels);

  const unlinked = applyItemSelection(linked, null, [HIGH_CATEGORY], null, false);
  assert.equal(unlinked.itemId, '');
  assert.equal(unlinked.itemName, item.title);
});

test('validates each step and normalises custom offsets', () => {
  const defaults = createEntryDefaults(null, NOW);

  assert.equal(validateStep('item', defaults).itemName, 'Give the item a name');
  assert.equal(validateStep('borrower', { ...defaults, borrowerName: 'Maya', borrowerEmail: 'bad' }).borrowerEmail, 'That does not look like an email address');
  assert.equal(
    validateStep('terms', { ...defaults, lentAt: '2026-10-18', dueDate: '2026-10-18' }).dueDate,
    'The deadline must fall after the lending date',
  );
  assert.equal(
    validateStep('reminders', { ...defaults, channels: [] }).channels,
    'Pick at least one channel, or switch reminders to manual only',
  );
  assert.equal(
    validateStep('reminders', { ...defaults, frequency: 'custom', customOffsets: 'nope' }).customOffsets,
    'List at least one day offset, e.g. -3, -1, 0',
  );
  assert.deepEqual(parseOffsets('-1, 0, -1, nope, 3'), [-1, 0, 3]);

  const complete = {
    ...defaults,
    itemName: 'Oscilloscope',
    categoryId: HIGH_CATEGORY._id,
    borrowerName: 'Maya',
  };
  assert.deepEqual(validateEntry(complete), {});
});

test('builds the existing API payload without resolving the priority sentinel', () => {
  const values = {
    ...createEntryDefaults(null, NOW),
    itemId: 'item-1',
    itemName: '  Oscilloscope  ',
    description: '  Bench unit  ',
    categoryId: HIGH_CATEGORY._id,
    borrowerName: '  Maya Patel  ',
    borrowerEmail: '  MAYA@Example.test  ',
    borrowerPhone: ' +91 90000 00001 ',
    consentEmail: true,
    consentWhatsApp: true,
    consentNote: '  Agreed in class  ',
    lentAt: '2026-10-18',
    dueDate: '2026-10-22',
    priority: 'category-default',
    notes: '  Private note  ',
    frequency: 'custom',
    customOffsets: '0, -2, -2',
    templateMode: 'custom',
    customMessage: '  Please return {itemName}.  ',
  };

  const payload = buildPayload(values);

  assert.equal(payload.itemName, 'Oscilloscope');
  assert.equal(payload.description, 'Bench unit');
  assert.equal(payload.itemId, 'item-1');
  assert.equal(payload.priority, 'category-default');
  assert.equal(payload.borrower.name, 'Maya Patel');
  assert.equal(payload.borrower.email, 'maya@example.test');
  assert.equal(payload.borrower.consent.email, true);
  assert.equal(payload.borrower.consent.recordedAt, undefined);
  assert.equal(payload.notes, 'Private note');
  assert.deepEqual(payload.reminders.customOffsetsDays, [-2, 0]);
  assert.equal(payload.reminders.customMessage, 'Please return {itemName}.');
});

test('describes channel readiness and reminder plans honestly', () => {
  const defaults = createEntryDefaults(null, NOW);
  const readiness = channelReadiness({
    ...defaults,
    channels: ['email', 'whatsapp'],
    consentEmail: false,
    consentWhatsApp: true,
    borrowerPhone: '+91 90000 00001',
  });

  assert.equal(readiness.find((entry) => entry.channel === 'email').ready, false);
  assert.equal(readiness.find((entry) => entry.channel === 'email').reason, 'consent not recorded');
  assert.equal(readiness.find((entry) => entry.channel === 'whatsapp').ready, true);

  const plan = reminderPlan({ ...defaults, priority: 'high' }, null);
  assert.equal(plan.mode, 'automatic');
  assert.deepEqual(plan.offsets, PRIORITY_SCHEDULES.high.offsetsDays);
  assert.equal(plan.labels.length, 3);

  const custom = reminderPlan({ ...defaults, frequency: 'custom', customOffsets: '0, -2' }, null);
  assert.deepEqual(custom.offsets, [-2, 0]);

  assert.equal(reminderPlan({ ...defaults, remindersEnabled: false }, null).mode, 'off');
  assert.equal(reminderPlan({ ...defaults, frequency: 'manual' }, null).mode, 'manual');
});

test('warns about idle schedules and linked listing side effects', () => {
  const defaults = createEntryDefaults(null, NOW);
  const warnings = entryWarnings(
    { ...defaults, channels: ['email'], consentEmail: false },
    null,
    { title: 'Oscilloscope' },
  );

  assert.ok(warnings.some((warning) => /armed but idle/i.test(warning)));
  assert.ok(warnings.some((warning) => /marks the linked listing as borrowed/i.test(warning)));
});
