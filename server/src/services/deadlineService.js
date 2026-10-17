import Category from '../models/Category.js';
import LoanHistory from '../models/LoanHistory.js';
import { ApiError } from '../middleware/errorMiddleware.js';
import { PRIORITIES, stepPriority } from '../utils/constants.js';
import { refreshSchedule } from './reminderService.js';

function serialize(value) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function recordHistory(
  { loan, actorId, kind, field = '', from = null, to = null, reason = '' },
  { session } = {},
) {
  const [entry] = await LoanHistory.create(
    [
      {
        loanId: loan._id,
        actorId,
        kind,
        field,
        from: serialize(from),
        to: serialize(to),
        reason,
      },
    ],
    session ? { session } : undefined,
  );

  return entry;
}

export async function resolveCategory(loan, { session } = {}) {
  const ref = loan.categoryId;
  if (!ref) return null;
  if (typeof ref === 'object' && ref.defaultPriority) return ref;
  return Category.findById(ref, null, session ? { session } : undefined);
}

export async function categoryDefaultPriority(categoryId, { session } = {}) {
  if (!categoryId) return null;
  const category = await Category.findById(categoryId, null, session ? { session } : undefined);
  return category?.defaultPriority ?? null;
}

// Moving the deadline has to re-arm the schedule in the same breath, otherwise unsent
// reminders keep pointing at the old date and fire at the wrong time.
export async function changeDeadline(loan, { dueDate, reason = '', actorId }, { session } = {}) {
  const next = new Date(dueDate);
  if (Number.isNaN(next.getTime())) {
    throw new ApiError(400, 'Deadline is not a valid date');
  }
  if (next.getTime() <= new Date(loan.lentAt).getTime()) {
    throw new ApiError(400, 'Deadline must fall after the lending date');
  }
  if (next.getTime() === loan.dueDate.getTime()) {
    throw new ApiError(400, 'The deadline is already set to that date');
  }

  const from = loan.dueDate;
  loan.dueDate = next;
  await refreshSchedule(loan, { session, now: new Date() });
  await loan.save(session ? { session } : undefined);

  const direction = next.getTime() > from.getTime() ? 'postponed' : 'preponed';
  await recordHistory(
    { loan, actorId, kind: 'deadline', field: 'dueDate', from, to: next, reason },
    { session },
  );

  return { loan, direction, from, to: next };
}

export async function changePriority(
  loan,
  { priority, direction, reason = '', actorId },
  { session } = {},
) {
  const from = loan.priority;
  let next;
  let source = 'manual';

  if (direction === 'reset') {
    const category = await resolveCategory(loan, { session });
    next = category?.defaultPriority ?? 'medium';
    source = 'category';
  } else if (direction === 'up' || direction === 'down') {
    next = stepPriority(from, direction);
    if (next === from) {
      throw new ApiError(
        400,
        `Priority is already at the ${direction === 'up' ? 'highest' : 'lowest'} level`,
      );
    }
  } else {
    if (!PRIORITIES.includes(priority)) {
      throw new ApiError(400, `Priority must be one of: ${PRIORITIES.join(', ')}`);
    }
    next = priority;
  }

  if (next === from && source === loan.prioritySource) {
    throw new ApiError(400, `Priority is already ${from}`);
  }

  loan.priority = next;
  loan.prioritySource = source;
  await refreshSchedule(loan, { session, now: new Date() });
  await loan.save(session ? { session } : undefined);

  await recordHistory(
    { loan, actorId, kind: 'priority', field: 'priority', from, to: next, reason },
    { session },
  );

  return { loan, from, to: next, source };
}

export async function changeCategory(loan, { categoryId, reason = '', actorId }, { session } = {}) {
  const lenderId = loan.lenderId?._id ?? loan.lenderId;
  const category = await Category.findOne(
    { _id: categoryId, $or: [{ ownerId: null }, { ownerId: lenderId }] },
    null,
    session ? { session } : undefined,
  );
  if (!category) throw new ApiError(404, 'Category not found');

  const previous = loan.categoryId?._id ?? loan.categoryId;
  if (previous && String(previous) === String(category._id)) {
    throw new ApiError(400, 'The entry is already in that category');
  }

  const fromPriority = loan.priority;
  loan.categoryId = category._id;

  // Only entries still tracking their category default follow the move; an explicit
  // lender override is left alone.
  const followsDefault = loan.prioritySource === 'category' && fromPriority !== category.defaultPriority;
  if (followsDefault) {
    loan.priority = category.defaultPriority;
  }

  await refreshSchedule(loan, { session, now: new Date() });
  await loan.save(session ? { session } : undefined);

  await recordHistory(
    {
      loan,
      actorId,
      kind: 'category',
      field: 'categoryId',
      from: previous ? String(previous) : null,
      to: String(category._id),
      reason,
    },
    { session },
  );

  if (followsDefault) {
    await recordHistory(
      {
        loan,
        actorId,
        kind: 'priority',
        field: 'priority',
        from: fromPriority,
        to: category.defaultPriority,
        reason: reason || 'Followed the new category default',
      },
      { session },
    );
  }

  return { loan, category, priorityChanged: followsDefault };
}
