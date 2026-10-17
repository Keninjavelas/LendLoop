import {
  ArrowLeft,
  BellOff,
  BellRing,
  CalendarClock,
  Check,
  History,
  Mail,
  MessageCircle,
  Settings2,
  TriangleAlert,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import Modal from '../components/common/Modal.jsx';
import PriorityBadge from '../components/common/PriorityBadge.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import DeadlinePriorityModal from '../components/loans/DeadlinePriorityModal.jsx';
import LoanSettingsModal from '../components/loans/LoanSettingsModal.jsx';
import SendReminderModal from '../components/loans/SendReminderModal.jsx';
import { CategoryIcon } from '../components/items/ItemCard.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { getApiMessage } from '../services/api.js';
import { categoryService } from '../services/categoryService.js';
import { loanService } from '../services/loanService.js';
import { cn } from '../utils/cn.js';
import { CHANNEL_LABELS, FREQUENCY_LABELS, TEMPLATE_MODE_LABELS, priorityLabel } from '../utils/constants.js';
import { dueLabel, formatDate, formatDateTime, isOverdue, timeAgo } from '../utils/formatDate.js';

const BACK_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink';

// Mirrors CATCH_UP_WINDOW_MS on the server: a slot missed by more than this is skipped
// rather than dumped on the borrower late, so the UI can say so instead of implying it
// is still coming.
const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000;

const LOG_STATUS_LABELS = {
  sent: 'Submitted',
  preview: 'Preview only',
  link: 'Link generated',
  failed: 'Failed',
};

const REMINDER_FIELDS = {
  enabled: 'automatic reminders',
  channels: 'channels',
  frequency: 'frequency',
  templateMode: 'message source',
  customMessage: 'custom message',
  customOffsetsDays: 'reminder days',
  overdueIntervalHours: 'overdue interval',
  maxOverdueReminders: 'overdue limit',
};

const BORROWER_FIELDS = {
  name: 'name',
  email: 'email',
  phone: 'WhatsApp number',
  consentEmail: 'email consent',
  consentWhatsApp: 'WhatsApp consent',
};

function changedKeys(from, to) {
  if (!from || !to || typeof from !== 'object' || typeof to !== 'object') return [];
  return Object.keys(to).filter(
    (key) => JSON.stringify(from[key] ?? null) !== JSON.stringify(to[key] ?? null),
  );
}

function describeHistory(entry, categoryNames) {
  const reason = entry.reason ? entry.reason : '';

  switch (entry.kind) {
    case 'created':
      return { title: 'Entry created', detail: reason };
    case 'deadline': {
      const moved = new Date(entry.to).getTime() > new Date(entry.from).getTime();
      return {
        title: `Deadline ${moved ? 'postponed' : 'brought forward'}`,
        detail: `${formatDate(entry.from)} → ${formatDate(entry.to)}`,
        reason,
      };
    }
    case 'priority':
      return {
        title: 'Priority changed',
        detail: `${priorityLabel(entry.from)} → ${priorityLabel(entry.to)}`,
        reason,
      };
    case 'category':
      return {
        title: 'Category changed',
        detail: `${categoryNames[entry.from] ?? 'another category'} → ${categoryNames[entry.to] ?? 'another category'}`,
        reason,
      };
    case 'status':
      return {
        title: entry.to === 'returned' ? 'Marked as returned' : 'Status changed',
        detail: reason || `${entry.from} → ${entry.to}`,
      };
    case 'reminders': {
      const labels = changedKeys(entry.from, entry.to)
        .map((key) => REMINDER_FIELDS[key])
        .filter(Boolean);
      return { title: 'Reminder settings changed', detail: labels.join(', '), reason };
    }
    case 'borrower': {
      const labels = changedKeys(entry.from, entry.to)
        .map((key) => BORROWER_FIELDS[key])
        .filter(Boolean);
      return { title: 'Borrower details changed', detail: labels.join(', '), reason };
    }
    case 'notes':
      return {
        title: entry.field === 'description' ? 'Description updated' : 'Notes updated',
        detail: reason,
      };
    default:
      return { title: entry.kind, detail: reason };
  }
}

function slotLabel(slot) {
  if (slot.slot === 'due-date') return 'On the deadline';
  if (slot.kind === 'overdue') {
    const nth = String(slot.slot).split('-')[1] ?? '';
    return `Overdue reminder ${nth}`;
  }
  const days = Math.abs(Number.parseInt(slot.slot, 10) || 0);
  return `${days} day${days === 1 ? '' : 's'} before the deadline`;
}

function slotState(slot) {
  if (slot.sent) return { label: 'Logged', className: 'bg-success-soft text-success ring-success/25' };
  const age = Date.now() - new Date(slot.at).getTime();
  if (age <= 0) return { label: 'Scheduled', className: 'bg-info-soft text-info ring-info/25' };
  if (age <= CATCH_UP_WINDOW_MS) {
    return { label: 'Fires on the next pass', className: 'bg-pending-soft text-pending ring-pending/25' };
  }
  // Neutral, not red: a skipped slot was never attempted, so it is not a delivery failure.
  // Stepped down to the surface fill because the chip sits on a raised inset row.
  return { label: 'Missed — outside the catch-up window', className: 'bg-surface text-faint ring-line' };
}

export default function LoanDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [loan, setLoan] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const isLender = Boolean(user?._id) && loan?.lenderId?._id === user._id;

  const loadLenderData = useCallback(async () => {
    const [scheduleData, logData] = await Promise.all([
      loanService.reminderSchedule(id),
      loanService.reminders(id),
    ]);
    setSchedule(scheduleData);
    setLogs(Array.isArray(logData) ? logData : []);
  }, [id]);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    (async () => {
      try {
        const loaded = await loanService.get(id);
        if (ignore) return;
        setLoan(loaded);

        const lender = Boolean(user?._id) && loaded.lenderId?._id === user._id;
        const [historyData] = await Promise.all([
          loanService.history(id),
          lender ? loadLenderData() : Promise.resolve(),
        ]);
        if (ignore) return;
        setHistory(Array.isArray(historyData) ? historyData : []);
      } catch (loadError) {
        if (!ignore) setError(getApiMessage(loadError, 'Could not load that entry'));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [id, user, reloadKey, loadLenderData]);

  // Categories back the reschedule modal and turn the ObjectId pairs in the history into names.
  useEffect(() => {
    let ignore = false;
    categoryService
      .list()
      .then((result) => {
        if (!ignore) setCategories(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!ignore) setCategories([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const categoryNames = Object.fromEntries(categories.map((entry) => [entry._id, entry.name]));

  async function handleConfirmReturn() {
    setBusy(true);
    try {
      const returned = await loanService.markReturned(id);
      setLoan(returned);
      setModal(null);
      toast.success('Return confirmed');
      await loadLenderData().catch(() => {});
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not confirm that return'));
      setModal(null);
      setReloadKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingSpinner size="lg" label="Loading this lending entry" />;

  if (error || !loan) {
    return (
      <div role="alert" className="panel px-6 py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-base font-semibold text-ink">Could not open this entry</h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{error || 'It may have been removed.'}</p>
        <Link to="/loans" className={cn(BACK_LINK_CLASS, 'mt-6')}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to loans
        </Link>
      </div>
    );
  }

  const overdue = isOverdue(loan);
  const reminders = loan.reminders ?? {};

  return (
    <div className="space-y-8">
      <Link to="/loans" className={BACK_LINK_CLASS}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to loans
      </Link>

      <header className="panel p-5 sm:p-6">
        <div className="flex gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-soft text-primary">
            {loan.itemId?.imageUrl ? (
              <img src={loan.itemId.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <CategoryIcon category={loan.categoryId?.name} className="h-7 w-7" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
                  {loan.itemName}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
                  <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {isLender ? 'Lent to ' : 'Borrowed from '}
                  <span className="font-medium text-ink">
                    {(isLender ? loan.borrower?.name : loan.lenderId?.name) ?? 'Unknown user'}
                  </span>
                  <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-line">
                    {loan.origin === 'manual' ? 'Recorded manually' : 'From a request'}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {isLender && <PriorityBadge priority={loan.priority} source={loan.prioritySource} />}
                {overdue ? <StatusBadge status="overdue" label="Overdue" /> : <StatusBadge status={loan.status} />}
              </div>
            </div>

            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="eyebrow">Category</dt>
                <dd className="mt-0.5 text-ink">{loan.categoryId?.name ?? 'Uncategorised'}</dd>
              </div>
              <div>
                <dt className="eyebrow">Lent</dt>
                <dd className="mt-0.5 text-ink">{formatDate(loan.lentAt)}</dd>
              </div>
              <div>
                <dt className="eyebrow">Deadline</dt>
                <dd className={cn('mt-0.5 font-semibold', overdue ? 'text-danger' : 'text-ink')}>
                  {formatDate(loan.dueDate)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Status</dt>
                <dd className={cn('mt-0.5 font-semibold', overdue ? 'text-danger' : 'text-ink')}>
                  {loan.status === 'returned' ? `Returned ${formatDate(loan.returnedAt)}` : dueLabel(loan)}
                </dd>
              </div>
            </dl>

            {loan.description && (
              <p className="mt-4 text-sm leading-relaxed text-muted">{loan.description}</p>
            )}

            {loan.itemId && (
              <Link
                to={`/items/${loan.itemId._id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                View the listing
              </Link>
            )}
          </div>
        </div>

        {isLender && loan.status === 'active' && (
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-5">
            <Button variant="ghost" size="sm" onClick={() => setModal({ mode: 'settings' })}>
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Settings
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setModal({ mode: 'reschedule' })}>
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              Deadline and priority
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setModal({ mode: 'remind' })}>
              <BellRing className="h-4 w-4" aria-hidden="true" />
              Send reminder
            </Button>
            <Button variant="success" size="sm" onClick={() => setModal({ mode: 'return' })} loading={busy}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Returned
            </Button>
          </div>
        )}
      </header>

      {isLender && loan.notes && (
        <section className="panel p-5">
          <h2 className="text-sm font-bold text-ink">Your notes</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{loan.notes}</p>
        </section>
      )}

      {isLender && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">Reminder schedule</h2>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                  schedule?.armed
                    ? 'bg-success-soft text-success ring-success/25'
                    : 'bg-raised text-muted ring-line',
                )}
              >
                {schedule?.armed ? (
                  <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {schedule?.armed ? 'Armed' : 'Not armed'}
              </span>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-muted">
              {reminders.enabled
                ? `${FREQUENCY_LABELS[reminders.frequency] ?? reminders.frequency} · template: ${TEMPLATE_MODE_LABELS[reminders.templateMode] ?? reminders.templateMode}.`
                : 'Automatic reminders are switched off for this entry.'}
              {reminders.enabled && reminders.frequency !== 'manual' && (
                <>
                  {' '}
                  Overdue nudges every {reminders.overdueIntervalHours} hours, capped at{' '}
                  {reminders.maxOverdueReminders}.
                </>
              )}
            </p>

            <p className="mt-2 text-xs text-muted">
              Reminder channels:{' '}
              <span className="font-semibold text-ink">
                {schedule?.channels?.length
                  ? schedule.channels.map((channel) => CHANNEL_LABELS[channel] ?? channel).join(' and ')
                  : 'nothing yet — no channel has both consent and contact details'}
              </span>
              {reminders.lastSentAt ? ` · last reminder logged ${timeAgo(reminders.lastSentAt)}` : ''}
            </p>

            <ul className="mt-4 space-y-2">
              {(schedule?.slots ?? []).map((slot) => {
                const state = slotState(slot);
                return (
                  <li
                    key={`${slot.slot}-${slot.at}`}
                    className="inset-panel flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{slotLabel(slot)}</span>
                      <span className="block text-xs text-muted">{formatDateTime(slot.at)}</span>
                    </span>
                    <span
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                        state.className,
                      )}
                    >
                      {state.label}
                    </span>
                  </li>
                );
              })}
            </ul>

            {schedule?.nextDueAt && (
              <p className="mt-3 text-xs text-muted">
                Next automatic reminder{' '}
                <span className="font-semibold text-ink">{formatDateTime(schedule.nextDueAt)}</span>
              </p>
            )}
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-ink">Reminder log</h2>
              <Link to="/reminders" className="text-xs font-semibold text-primary hover:underline">
                All reminders
              </Link>
            </div>

            {logs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                Nothing has been logged for this entry yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {logs.map((log) => (
                  <li key={log._id} className="inset-panel p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        {log.channel === 'email' ? (
                          <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
                        ) : (
                          <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
                        )}
                        {CHANNEL_LABELS[log.channel] ?? log.channel}
                        <span className="font-normal text-muted">
                          {log.mode === 'automatic' ? 'automatic' : 'manual'}
                        </span>
                      </span>
                      <StatusBadge
                        status={log.status}
                        label={LOG_STATUS_LABELS[log.status] ?? log.status}
                      />
                    </div>

                    <p className="mt-1.5 text-sm text-ink">{log.subject}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDateTime(log.createdAt)}
                      {log.templateName ? ` · ${log.templateName}` : ''}
                      {log.scheduleSlot ? ` · slot ${log.scheduleSlot}` : ''}
                    </p>

                    {log.status === 'sent' && (
                      <p className="mt-1.5 text-xs text-muted">
                        Accepted by the mail provider. Delivery confirmation is not tracked.
                      </p>
                    )}
                    {log.status === 'preview' && (
                      <p className="mt-1.5 text-xs text-muted">
                        No mail provider is configured, so this was rendered and logged rather than sent.
                      </p>
                    )}
                    {log.status === 'link' && (
                      <>
                        <p className="mt-1.5 text-xs text-muted">
                          WhatsApp link generated — nothing is sent until you press Send. Opening it
                          does not confirm delivery.
                        </p>
                        {log.link && (
                          <a
                            href={log.link}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open the prefilled WhatsApp chat in a new tab"
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-success/35 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/15"
                          >
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            Open the chat — you still press send
                          </a>
                        )}
                      </>
                    )}
                    {log.status === 'failed' && log.error && (
                      <p className="mt-1.5 text-xs font-medium text-danger">{log.error}</p>
                    )}

                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold text-primary">
                        Message text
                      </summary>
                      <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted">
                        {log.body}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <section className="panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <History className="h-4 w-4 text-primary" aria-hidden="true" />
          Change history
        </h2>

        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No changes recorded yet.</p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-line pl-5">
            {history.map((entry) => {
              const described = describeHistory(entry, categoryNames);
              return (
                <li key={entry._id} className="relative">
                  <span
                    className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-surface"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-ink">{described.title}</p>
                  {described.detail && (
                    <p className="mt-0.5 text-sm text-muted">{described.detail}</p>
                  )}
                  {described.reason && described.reason !== described.detail && (
                    <p className="mt-0.5 text-sm italic text-muted">“{described.reason}”</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted">
                    {entry.actorId?.name ?? 'Someone'} · {timeAgo(entry.createdAt)}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <SendReminderModal
        loan={modal?.mode === 'remind' ? loan : null}
        open={modal?.mode === 'remind'}
        onClose={() => setModal(null)}
        onSent={() => setReloadKey((key) => key + 1)}
      />

      <DeadlinePriorityModal
        loan={modal?.mode === 'reschedule' ? loan : null}
        categories={categories}
        open={modal?.mode === 'reschedule'}
        onClose={() => setModal(null)}
        onSaved={(updated) => {
          setLoan(updated);
          setReloadKey((key) => key + 1);
        }}
      />

      <LoanSettingsModal
        loan={modal?.mode === 'settings' ? loan : null}
        open={modal?.mode === 'settings'}
        onClose={() => setModal(null)}
        onSaved={(updated) => {
          setLoan(updated);
          setReloadKey((key) => key + 1);
        }}
      />

      <Modal
        open={modal?.mode === 'return'}
        onClose={() => setModal(null)}
        size="sm"
        title="Confirm return"
        description="Closing the entry stops its reminders and frees any linked listing."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="success" onClick={handleConfirmReturn} loading={busy}>
              {!busy && <Check className="h-4 w-4" aria-hidden="true" />}
              Confirm return
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          Confirm that <span className="font-semibold text-ink">{loan.borrower?.name}</span> has handed
          back <span className="font-semibold text-ink">{loan.itemName}</span>. The entry is closed
          straight away and cannot be reopened.
        </p>
      </Modal>
    </div>
  );
}
