import { Pencil } from 'lucide-react';
import Button from '../../common/Button.jsx';
import {
  CHANNEL_LABELS,
  FREQUENCY_LABELS,
  TEMPLATE_MODE_LABELS,
  priorityLabel,
} from '../../../utils/constants.js';
import { formatDate, fromInputDate } from '../../../utils/formatDate.js';
import {
  channelReadiness,
  entryWarnings,
  reminderPlan,
} from '../../../utils/lendingEntry.js';

const DAY_MS = 86400000;

function ReviewSection({ title, onEdit, children }) {
  return (
    <section className="rounded-xl border border-line-soft bg-canvas/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Edit
        </Button>
      </div>
      <dl className="mt-2 divide-y divide-line-soft">{children}</dl>
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function ReadyBadge({ ready, reason }) {
  return (
    <span
      className={
        ready
          ? 'ml-2 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold text-success ring-1 ring-inset ring-success/25'
          : 'ml-2 inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold text-pending ring-1 ring-inset ring-pending/25'
      }
    >
      {ready ? 'ready' : reason}
    </span>
  );
}

export default function ReviewStep({
  values,
  categories,
  items,
  onEdit,
}) {
  const category = categories.find((entry) => entry._id === values.categoryId) ?? null;
  const linkedItem = items.find((item) => item._id === values.itemId) ?? null;
  const plan = reminderPlan(values, category);
  const readiness = channelReadiness(values);
  const selectedChannels = readiness.filter((entry) => entry.selected);
  const warnings = entryWarnings(values, category, linkedItem);
  const lent = fromInputDate(values.lentAt);
  const due = fromInputDate(values.dueDate);
  const duration = lent && due ? Math.max(0, Math.round((due.getTime() - lent.getTime()) / DAY_MS)) : null;
  const consent = [
    values.consentEmail ? 'email' : null,
    values.consentWhatsApp ? 'WhatsApp' : null,
  ].filter(Boolean);

  let prioritySource = 'Manual override';
  if (values.priority === 'category-default') {
    prioritySource = category
      ? `Inherited from ${category.name} at creation`
      : 'Inherited from the selected category at creation';
  } else if (category) {
    prioritySource = `Manual override — category default is ${priorityLabel(category.defaultPriority)}`;
  }

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <section className="rounded-xl border border-pending/30 bg-pending-soft p-4">
          <h3 className="text-sm font-bold text-pending">Before you save</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-pending">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <ReviewSection title="Item" onEdit={() => onEdit('item')}>
        <Row label="Name">{values.itemName.trim() || '—'}</Row>
        <Row label="Category">{category?.name ?? '—'}</Row>
        <Row label="Listing">
          {linkedItem ? linkedItem.title : 'Standalone entry — not linked to a listing'}
        </Row>
        {values.description.trim() && <Row label="Description">{values.description.trim()}</Row>}
      </ReviewSection>

      <ReviewSection title="Borrower" onEdit={() => onEdit('borrower')}>
        <Row label="Name">{values.borrowerName.trim() || '—'}</Row>
        <Row label="Email">{values.borrowerEmail.trim() || 'Not provided'}</Row>
        <Row label="WhatsApp">{values.borrowerPhone.trim() || 'Not provided'}</Row>
        <Row label="Consent">{consent.length ? `Agreed to ${consent.join(' and ')}` : 'Not recorded'}</Row>
        {values.consentNote.trim() && <Row label="Consent note">{values.consentNote.trim()}</Row>}
      </ReviewSection>

      <ReviewSection title="Terms" onEdit={() => onEdit('terms')}>
        <Row label="Lent">{formatDate(lent)}</Row>
        <Row label="Due">{formatDate(due)}</Row>
        <Row label="Duration">{duration === null ? '—' : `${duration} ${duration === 1 ? 'day' : 'days'}`}</Row>
        <Row label="Priority">
          {priorityLabel(plan.priority)}
          <span className="ml-2 text-muted">· {prioritySource}</span>
        </Row>
        {values.notes.trim() && <Row label="Notes">{values.notes.trim()}</Row>}
      </ReviewSection>

      <ReviewSection title="Reminders" onEdit={() => onEdit('reminders')}>
        <Row label="Automatic">
          {plan.mode === 'off'
            ? 'Off'
            : plan.mode === 'manual'
              ? 'Manual only'
              : `On — ${FREQUENCY_LABELS[values.frequency]?.toLowerCase() ?? values.frequency}`}
        </Row>
        <Row label="Channels">
          {selectedChannels.length ? (
            <ul className="space-y-1">
              {selectedChannels.map((entry) => (
                <li key={entry.channel}>
                  {CHANNEL_LABELS[entry.channel]}
                  <ReadyBadge ready={entry.ready} reason={entry.reason} />
                </li>
              ))}
            </ul>
          ) : (
            'None selected'
          )}
        </Row>
        <Row label="Schedule">
          {plan.mode === 'automatic'
            ? plan.labels.length
              ? plan.labels.join(' · ')
              : 'No reminder days configured yet'
            : plan.mode === 'manual'
              ? 'Manual sends only'
              : 'Automatic reminders are off'}
        </Row>
        <Row label="Overdue">
          {plan.mode === 'automatic'
            ? Number(values.maxOverdueReminders) === 0
              ? 'No overdue reminders'
              : `Every ${values.overdueIntervalHours} hours, up to ${values.maxOverdueReminders}`
            : 'Not scheduled automatically'}
        </Row>
        <Row label="Message">{TEMPLATE_MODE_LABELS[values.templateMode]}</Row>
        {values.templateMode === 'custom' && values.customMessage.trim() && (
          <Row label="Custom text">
            <span className="whitespace-pre-wrap">{values.customMessage.trim()}</span>
          </Row>
        )}
      </ReviewSection>

      <p className="px-1 text-xs leading-relaxed text-muted">
        Saving creates the entry only. No reminder is sent now; message text and links are generated
        when a reminder is actually queued.
      </p>
    </div>
  );
}
