import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getApiMessage } from '../../services/api.js';
import { loanService } from '../../services/loanService.js';
import { PRIORITIES, priorityLabel } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';
import { formatDate, fromInputDate, toInputDate } from '../../utils/formatDate.js';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import { Field, fieldClass } from '../common/Field.jsx';

const DAY_MS = 86400000;

const SHIFTS = [
  { label: '−1 day', days: -1 },
  { label: '+1 day', days: 1 },
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
];

const RESET_BASE =
  'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

// `cn` joins without merging, so the selected state has to be a whole string: appending a
// border and background to the resting ones would leave both in the class list and let
// stylesheet order pick the winner. The selected border matches CheckRow's.
const RESET_STATES = {
  idle: 'border-line bg-raised text-muted hover:border-faint hover:text-ink',
  selected: 'border-primary/45 bg-primary-soft text-primary',
};

export default function DeadlinePriorityModal({ loan, categories = [], open, onClose, onSaved }) {
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [resetToDefault, setResetToDefault] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const original = useMemo(
    () => ({
      dueDate: loan ? toInputDate(new Date(loan.dueDate)) : '',
      categoryId: loan?.categoryId?._id ?? loan?.categoryId ?? '',
      priority: loan?.priority ?? 'medium',
    }),
    [loan],
  );

  useEffect(() => {
    if (!open || !loan) return;
    setDueDate(original.dueDate);
    setCategoryId(original.categoryId);
    setPriority(original.priority);
    setResetToDefault(false);
    setReason('');
    setErrors({});
  }, [open, loan, original]);

  const category = categories.find((entry) => entry._id === categoryId) ?? null;
  const followsCategory = loan?.prioritySource === 'category';

  const dueChanged = Boolean(dueDate) && dueDate !== original.dueDate;
  const categoryChanged = Boolean(categoryId) && categoryId !== original.categoryId;
  // Moving the category of an entry that tracks its default already moves the priority; a second
  // explicit PATCH would freeze it as a manual override and break that link.
  const willSetPriority =
    resetToDefault ||
    (priority !== original.priority && !(followsCategory && categoryChanged));
  const anythingChanged = dueChanged || categoryChanged || willSetPriority;

  function shiftDeadline(days) {
    const base = fromInputDate(dueDate) ?? new Date(loan.dueDate);
    setDueDate(toInputDate(new Date(base.getTime() + days * DAY_MS)));
  }

  // Changing the category of an entry that still tracks its default moves the priority too,
  // so the select is synced rather than left showing a value the server is about to replace.
  function handleCategoryChange(event) {
    const next = event.target.value;
    setCategoryId(next);
    const found = categories.find((entry) => entry._id === next);
    if (followsCategory && found) {
      setPriority(found.defaultPriority);
      setResetToDefault(false);
    }
  }

  async function handleSave() {
    if (!loan || !anythingChanged) return;

    const nextErrors = {};
    const due = fromInputDate(dueDate);
    if (!due) nextErrors.dueDate = 'Pick a deadline';
    else if (due.getTime() <= new Date(loan.lentAt).getTime()) {
      nextErrors.dueDate = 'The deadline must fall after the lending date';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    let latest = loan;

    try {
      if (categoryChanged) {
        const data = await loanService.updateCategory(loan._id, { categoryId, reason: reason.trim() });
        latest = data.loan;
        setPriority(data.loan.priority);
        toast.success(
          data.priorityChanged
            ? `Moved to ${category?.name ?? 'the new category'} — priority now ${priorityLabel(data.loan.priority)}`
            : `Moved to ${category?.name ?? 'the new category'}`,
        );
      }

      if (resetToDefault) {
        const data = await loanService.updatePriority(loan._id, {
          direction: 'reset',
          reason: reason.trim(),
        });
        latest = data.loan;
        toast.success(`Priority reset to the ${priorityLabel(data.loan.priority)} category default`);
      } else if (willSetPriority) {
        const data = await loanService.updatePriority(loan._id, {
          priority,
          reason: reason.trim(),
        });
        latest = data.loan;
        toast.success(`Priority changed to ${priorityLabel(data.loan.priority)}`);
      }

      if (dueChanged) {
        const data = await loanService.updateDeadline(loan._id, {
          dueDate: due.toISOString(),
          reason: reason.trim(),
        });
        latest = data.loan;
        toast.success(`Deadline ${data.direction} to ${formatDate(data.to)}`);
      }

      onSaved?.(latest);
      onClose?.();
    } catch (error) {
      // Earlier PATCHes may already have landed, so hand the freshest loan back either way.
      onSaved?.(latest);
      toast.error(getApiMessage(error, 'Could not save those changes'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      size="md"
      title="Edit deadline and priority"
      description={`${loan?.itemName ?? 'This entry'} · lent ${formatDate(loan?.lentAt)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!anythingChanged}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          id="deadline-date"
          label="Return deadline"
          error={errors.dueDate}
          hint={
            dueChanged
              ? 'Unsent reminders are recalculated from the new date — nothing already sent is repeated.'
              : `Currently ${formatDate(loan?.dueDate)}`
          }
        >
          <input
            id="deadline-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className={fieldClass(errors.dueDate)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {SHIFTS.map((shift) => (
              <button
                key={shift.label}
                type="button"
                onClick={() => shiftDeadline(shift.days)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-faint hover:text-ink disabled:opacity-60"
              >
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                {shift.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="deadline-priority" label="Priority">
            <select
              id="deadline-priority"
              value={priority}
              onChange={(event) => {
                setPriority(event.target.value);
                setResetToDefault(false);
              }}
              disabled={saving}
              className={fieldClass()}
            >
              {PRIORITIES.map((entry) => (
                <option key={entry} value={entry}>
                  {priorityLabel(entry)}
                </option>
              ))}
            </select>
          </Field>

          <Field id="deadline-category" label="Category">
            <select
              id="deadline-category"
              value={categoryId}
              onChange={handleCategoryChange}
              disabled={saving}
              className={fieldClass()}
            >
              {categories.map((entry) => (
                <option key={entry._id} value={entry._id}>
                  {entry.name} · {priorityLabel(entry.defaultPriority)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <button
          type="button"
          onClick={() => {
            setResetToDefault(true);
            if (category) setPriority(category.defaultPriority);
          }}
          disabled={saving || !category}
          className={cn(RESET_BASE, resetToDefault ? RESET_STATES.selected : RESET_STATES.idle)}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset to the {category ? priorityLabel(category.defaultPriority) : 'category'} default
        </button>

        {followsCategory && (
          <p className="inset-panel px-3.5 py-2.5 text-xs leading-relaxed text-muted">
            This entry still tracks its category default, so moving the category moves the priority with
            it. Picking a priority by hand stops that — the entry keeps your choice even if the category
            default changes later.
          </p>
        )}

        <Field
          id="deadline-reason"
          label="Reason"
          optional
          hint="Stored with the change so the history explains itself later."
        >
          <textarea
            id="deadline-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Exams pushed back a week"
            disabled={saving}
            className={cn(fieldClass(), 'resize-y')}
          />
        </Field>
      </div>
    </Modal>
  );
}
