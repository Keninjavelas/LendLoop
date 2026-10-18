import {
  BellRing,
  CalendarClock,
  ChevronDown,
  Clock,
  ExternalLink,
  History,
  Inbox,
  Mail,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import PriorityBadge from '../components/common/PriorityBadge.jsx';
import StatStrip from '../components/common/StatStrip.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { getApiMessage } from '../services/api.js';
import { reminderService } from '../services/reminderService.js';
import { cn } from '../utils/cn.js';
import {
  CHANNEL_LABELS,
  FREQUENCY_LABELS,
  REMINDER_CHANNELS,
} from '../utils/constants.js';
import { formatDate, formatDateTime, timeAgo, untilLabel } from '../utils/formatDate.js';

const VIEWS = [
  { value: 'upcoming', label: 'Upcoming', icon: CalendarClock },
  { value: 'blocked', label: 'Blocked', icon: ShieldAlert },
  { value: 'failed', label: 'Failed', icon: TriangleAlert },
  { value: 'history', label: 'History', icon: Inbox },
];

const CHANNEL_FILTERS = [
  { value: '', label: 'All' },
  ...REMINDER_CHANNELS.map((channel) => ({
    value: channel,
    label: CHANNEL_LABELS[channel] ?? channel,
  })),
];

const MODE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'sent', label: 'Submitted' },
  { value: 'preview', label: 'Preview' },
  { value: 'link', label: 'Link only' },
  { value: 'failed', label: 'Failed' },
];

// "sent" means the mail provider accepted the message, not that it reached the inbox.
// "preview" never leaves the server, and "link" is only a generated WhatsApp chat. No
// provider delivery callbacks exist, so the UI never claims a message was delivered.
// Static class strings only - Tailwind scans source for literal values.
const STATUS_META = {
  sent: {
    label: 'Submitted to provider',
    badge: 'bg-success-soft text-success ring-success/25',
    dot: 'bg-success',
    note: 'Accepted by the configured mail provider. Delivery confirmation is not tracked.',
    noteClass: 'text-muted',
  },
  preview: {
    label: 'Preview only — no mail provider configured',
    badge: 'bg-pending-soft text-pending ring-pending/25',
    dot: 'bg-pending',
    note: 'The message was rendered and logged, not sent. Nothing reached the borrower.',
    noteClass: 'text-pending',
  },
  link: {
    label: 'Link generated — nothing sent',
    badge: 'bg-info-soft text-info ring-info/25',
    dot: 'bg-info',
    note: 'LendLoop does not send WhatsApp messages and does not track whether you open the link. Press send in WhatsApp yourself.',
    noteClass: 'text-info',
  },
  failed: {
    label: 'Failed',
    badge: 'bg-danger-soft text-danger ring-danger/25',
    dot: 'bg-danger',
    note: 'The provider rejected this reminder. Nothing reached the borrower.',
    noteClass: 'text-danger',
  },
};

const MODE_META = {
  manual: { label: 'Manual', className: 'bg-raised text-muted ring-line' },
  automatic: { label: 'Automatic', className: 'bg-primary-soft text-primary ring-primary/25' },
};

const FALLBACK_STATUS = {
  label: 'Unknown status',
  badge: 'bg-raised text-muted ring-line',
  dot: 'bg-faint',
};

const DAY_MS = 86_400_000;

function pluralise(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function ordinal(count) {
  const remainder = count % 10;
  if (count > 10 && count < 14) return `${count}th`;
  if (remainder === 1) return `${count}st`;
  if (remainder === 2) return `${count}nd`;
  if (remainder === 3) return `${count}rd`;
  return `${count}th`;
}

// The server stores slots as "-2d" / "due-date" / "overdue-2"; the dedupe key spells the
// same thing "pre:-2" / "overdue:2". Both shapes read the same way here.
function slotLabel(slot) {
  const raw = String(slot ?? '').trim();
  if (!raw) return '';
  if (raw === 'due-date' || raw === 'pre:0' || raw === 'pre:0d') return 'On the deadline';

  const overdue = raw.match(/^overdue[:-](\d+)d?$/);
  if (overdue) return `${ordinal(Number(overdue[1]))} overdue reminder`;

  const offset = raw.match(/^(?:pre[:-])?(-?\d+)d?$/);
  if (offset) {
    const days = Number(offset[1]);
    if (days === 0) return 'On the deadline';
    if (days < 0) return `${pluralise(Math.abs(days), 'day')} before the deadline`;
    return `${pluralise(days, 'day')} after the deadline`;
  }

  return raw;
}

// timeAgo reads past timestamps; a scheduled slot points at the future.
function isDueSoon(value) {
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time <= Date.now() + 2 * DAY_MS;
}

// `cn` joins without merging, so each state is one complete literal string rather than an
// override appended to a base — the active pill carries a ring where the idle one carries
// a border. The active fill is a soft tint, not solid green: the page spends its one solid
// accent on the primary Button.
function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary-soft text-primary ring-1 ring-inset ring-primary/25'
          : 'border border-line bg-raised text-muted hover:border-faint hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function FilterRow({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="eyebrow w-20 shrink-0">{label}</span>
      {options.map((option) => (
        <FilterPill
          key={option.value || 'all'}
          active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </FilterPill>
      ))}
    </div>
  );
}

function ViewTab({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors sm:flex-1',
        active
          ? 'bg-primary-soft text-primary ring-1 ring-inset ring-primary/25'
          : 'text-muted hover:bg-raised hover:text-ink',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
      {typeof count === 'number' && (
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
            active
              ? 'bg-primary/15 text-primary'
              : 'bg-raised text-muted ring-1 ring-inset ring-line',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function LogStatusBadge({ status }) {
  const meta = STATUS_META[status] ?? FALLBACK_STATUS;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        meta.badge,
      )}
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function LogCard({ log, onRetry, retrying = false }) {
  const loan = log.loanId ?? null;
  const meta = STATUS_META[log.status] ?? FALLBACK_STATUS;
  const mode = MODE_META[log.mode] ?? {
    label: log.mode ?? 'Unknown',
    className: MODE_META.manual.className,
  };
  const isWhatsapp = log.channel === 'whatsapp';
  const ChannelIcon = isWhatsapp ? MessageCircle : Mail;
  const slot = log.mode === 'automatic' ? slotLabel(log.scheduleSlot) : '';
  const stamp = log.sentAt || log.createdAt;
  const borrowerName = loan?.borrower?.name ?? 'Unknown borrower';
  const retryable = Boolean(onRetry) && ['failed', 'link'].includes(log.status);

  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <ChannelIcon className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            {loan?._id ? (
              <Link
                to={`/loans/${loan._id}`}
                className="line-clamp-1 font-semibold text-ink hover:text-primary"
              >
                {loan.itemName || 'Lending entry'}
              </Link>
            ) : (
              <p className="font-semibold text-ink">Lending entry no longer available</p>
            )}

            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                <span className="font-medium text-ink">{borrowerName}</span>
                {' · '}
                {CHANNEL_LABELS[log.channel] ?? log.channel} to{' '}
                <span className="font-medium text-ink">{log.recipient}</span>
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {loan?.priority && <PriorityBadge priority={loan.priority} />}
          {loan?.status === 'returned' && <StatusBadge status="returned" label="Item returned" />}
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
              mode.className,
            )}
          >
            {mode.label}
          </span>
          <LogStatusBadge status={log.status} />
        </div>
      </div>

      {log.subject && (
        <p className="mt-4 border-t border-line pt-3 text-sm font-semibold text-ink">{log.subject}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {stamp ? (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {formatDateTime(stamp)} · {timeAgo(stamp)}
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            No timestamp recorded
          </span>
        )}
        {loan?.dueDate && <span>Due {formatDate(loan.dueDate)}</span>}
        {slot && <span className="font-medium text-ink">{slot}</span>}
        {log.templateName && <span>Template: {log.templateName}</span>}
      </div>

      {meta.note && (
        <p className={cn('mt-2 text-xs leading-relaxed', meta.noteClass ?? 'text-muted')}>
          {meta.note}
        </p>
      )}

      {log.status === 'failed' && log.error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger"
        >
          {log.error}
        </p>
      )}

      {log.status === 'link' &&
        (log.link ? (
          <a
            href={log.link}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open the prefilled WhatsApp message for ${borrowerName} in a new tab — you still have to press send in WhatsApp`}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-success/35 bg-success-soft px-4 py-2.5 text-sm font-semibold text-success transition-colors hover:bg-success/15"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Open in WhatsApp — you press send
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <p className="mt-3 text-xs font-medium text-danger">
            No WhatsApp link was stored for this log. Generate a new reminder to create one.
          </p>
        ))}

      {(log.provider || log.providerMessageId) && (
        <p className="mt-3 text-xs text-muted">
          {log.provider && (
            <>
              Provider: <span className="font-medium text-ink">{log.provider}</span>
            </>
          )}
          {log.provider && log.providerMessageId && ' · '}
          {log.providerMessageId && (
            <>
              Message ID: <span className="font-medium text-ink">{log.providerMessageId}</span>
            </>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {retryable && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRetry(log)}
            loading={retrying}
            disabled={retrying}
          >
            {!retrying && <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
            {log.status === 'failed' ? 'Retry reminder' : 'Regenerate WhatsApp link'}
          </Button>
        )}
        {loan?._id && (
          <Link
            to={`/reminders?view=history&loanId=${loan._id}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            This entry&apos;s history
          </Link>
        )}
      </div>

      <details className="inset-panel mt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-ink marker:content-none">
          Message body
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </summary>
        <p className="whitespace-pre-line border-t border-line-soft px-3 py-3 text-sm leading-relaxed text-muted">
          {log.body}
        </p>
      </details>
    </article>
  );
}

function UpcomingCard({ entry }) {
  const soon = isDueSoon(entry.nextDueAt);

  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
              soon ? 'bg-pending-soft text-pending' : 'bg-primary-soft text-primary',
            )}
          >
            <BellRing className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <Link
              to={`/loans/${entry._id}`}
              className="line-clamp-1 font-semibold text-ink hover:text-primary"
            >
              {entry.itemName}
            </Link>
            <p className="mt-0.5 truncate text-sm text-muted">
              <span className="font-medium text-ink">{entry.borrowerName}</span> · due{' '}
              {formatDate(entry.dueDate)}
            </p>

            <p
              className={cn(
                'mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs',
                soon ? 'font-semibold text-pending' : 'text-muted',
              )}
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Next slot {formatDateTime(entry.nextDueAt)}
              <span className="font-normal text-muted">({untilLabel(entry.nextDueAt)})</span>
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <PriorityBadge priority={entry.priority} />
              {entry.channels.map((channel) => (
                <span
                  key={channel}
                  className="rounded-md bg-raised px-2 py-0.5 font-medium text-muted ring-1 ring-inset ring-line"
                >
                  {CHANNEL_LABELS[channel] ?? channel}
                </span>
              ))}
              <span className="rounded-md bg-raised px-2 py-0.5 font-medium text-muted ring-1 ring-inset ring-line">
                {FREQUENCY_LABELS[entry.frequency] ?? entry.frequency}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <Link
            to={`/loans/${entry._id}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View entry
          </Link>
          <Link
            to={`/reminders?view=history&loanId=${entry._id}`}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            Reminder history
          </Link>
        </div>
      </div>
    </article>
  );
}

function BlockedCard({ entry }) {
  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pending-soft text-pending">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <Link
              to={`/loans/${entry._id}`}
              className="line-clamp-1 font-semibold text-ink hover:text-primary"
            >
              {entry.itemName}
            </Link>
            <p className="mt-0.5 truncate text-sm text-muted">
              <span className="font-medium text-ink">{entry.borrowerName}</span> · due{' '}
              {formatDate(entry.dueDate)}
            </p>

            <p className="mt-2 text-xs font-semibold text-pending">
              Armed, but nothing can be sent until these are fixed:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
              {entry.missing.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
          <Link
            to={`/loans/${entry._id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Open entry settings
          </Link>
          <Link
            to={`/reminders?view=history&loanId=${entry._id}`}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            Reminder history
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function RemindersPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawView = searchParams.get('view') ?? '';
  const view = VIEWS.some((entry) => entry.value === rawView) ? rawView : 'upcoming';
  const rawChannel = searchParams.get('channel') ?? '';
  const channel = REMINDER_CHANNELS.includes(rawChannel) ? rawChannel : '';
  const rawMode = searchParams.get('mode') ?? '';
  const mode = ['manual', 'automatic'].includes(rawMode) ? rawMode : '';
  const rawStatus = searchParams.get('status') ?? '';
  const status = STATUS_FILTERS.some((entry) => entry.value === rawStatus) ? rawStatus : '';
  const loanId = searchParams.get('loanId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const q = searchParams.get('q') ?? '';

  const [term, setTerm] = useState(q);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState('');
  const [overviewKey, setOverviewKey] = useState(0);

  const [logs, setLogs] = useState([]);
  const [logLimit, setLogLimit] = useState(100);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyKey, setHistoryKey] = useState(0);

  const [retryingId, setRetryingId] = useState('');

  const rangeInvalid = Boolean(from && to && from > to);
  const historyFiltersActive = Boolean(channel || mode || status || loanId || from || to || q);

  function updateParams(changes) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value === null || value === undefined) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    setTerm(q);
  }, [q]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const trimmed = term.trim();
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    if (next.toString() === searchParams.toString()) return undefined;
    const handle = setTimeout(() => setSearchParams(next, { replace: true }), 300);
    return () => clearTimeout(handle);
  }, [term, searchParams, setSearchParams]);

  useEffect(() => {
    let ignore = false;

    setOverviewLoading(true);
    setOverviewError('');

    reminderService
      .overview()
      .then((result) => {
        if (ignore) return;
        setOverview(result ?? null);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setOverviewError(getApiMessage(fetchError, 'Could not load your reminder overview'));
      })
      .finally(() => {
        if (!ignore) setOverviewLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [overviewKey]);

  useEffect(() => {
    if (view !== 'history') return undefined;

    let ignore = false;

    setHistoryLoading(true);
    setHistoryError('');

    reminderService
      .logs({
        channel: channel || undefined,
        mode: mode || undefined,
        status: status || undefined,
        loanId: loanId || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 100,
      })
      .then((result) => {
        if (ignore) return;
        setLogs(Array.isArray(result?.reminders) ? result.reminders : []);
        setLogLimit(Number(result?.limit) || 100);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setHistoryError(getApiMessage(fetchError, 'Could not load your reminder history'));
      })
      .finally(() => {
        if (!ignore) setHistoryLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [view, channel, mode, status, loanId, from, to, historyKey]);

  function clearHistoryFilters() {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams();
        if (current.get('view') === 'history') next.set('view', 'history');
        return next;
      },
      { replace: true },
    );
    setTerm('');
  }

  function refreshAll() {
    setOverviewKey((key) => key + 1);
    if (view === 'history') setHistoryKey((key) => key + 1);
  }

  async function handleRetry(log) {
    setRetryingId(log._id);
    try {
      const result = await reminderService.retry(log._id);
      const newLog = result?.logs?.[0];
      const warning = result?.warnings?.[0];

      if (newLog?.status === 'sent') {
        toast.success('Retry submitted — the provider accepted the message', {
          description: warning || 'Delivery confirmation is not tracked.',
        });
      } else if (newLog?.status === 'link') {
        toast.info('A fresh WhatsApp link was generated — open it and press send', {
          description: warning || 'Nothing was sent from LendLoop.',
        });
      } else if (newLog?.status === 'preview') {
        toast.info('Preview logged — no mail provider is configured, so nothing was sent', {
          description: warning || 'Configure email delivery before relying on automatic reminders.',
        });
      } else {
        toast.error('The retry did not produce a sent reminder', {
          description: warning || 'Check the new history entry for the provider response.',
        });
      }

      setOverviewKey((key) => key + 1);
      setHistoryKey((key) => key + 1);
    } catch (error) {
      toast.error(getApiMessage(error, 'Could not retry that reminder'));
    } finally {
      setRetryingId('');
    }
  }

  const summary = overview?.summary ?? null;
  const upcoming = overview?.upcoming ?? [];
  const blocked = overview?.blocked ?? [];
  const failed = overview?.failed ?? [];
  const statusCounts = summary?.statusCounts ?? { sent: 0, preview: 0, link: 0, failed: 0 };

  const stats = summary
    ? [
        {
          key: 'scheduled',
          label: 'Scheduled',
          value: summary.scheduled,
          caption: `${summary.armed} armed of ${summary.activeLoans} active entries`,
          icon: CalendarClock,
          tint: 'bg-info-soft text-info',
          valueClass: 'text-ink',
        },
        {
          key: 'soon',
          label: 'Due in 7 days',
          value: summary.dueSoon,
          caption: 'Next reminder slots inside the week',
          icon: BellRing,
          tint: 'bg-primary-soft text-primary',
          valueClass: summary.dueSoon ? 'text-primary' : 'text-ink',
        },
        {
          key: 'blocked',
          label: 'Blocked',
          value: summary.blocked,
          caption: 'Armed without consent or contact details',
          icon: ShieldAlert,
          tint: 'bg-pending-soft text-pending',
          valueClass: summary.blocked ? 'text-pending' : 'text-ink',
        },
        {
          key: 'failed',
          label: 'Failed',
          value: summary.failed,
          caption: 'Provider rejections, all time',
          icon: TriangleAlert,
          tint: 'bg-danger-soft text-danger',
          valueClass: summary.failed ? 'text-danger' : 'text-ink',
        },
      ]
    : [];

  const filteredLogs = q
    ? logs.filter((log) => {
        const haystack = [
          log.loanId?.itemName,
          log.loanId?.borrower?.name,
          log.recipient,
          log.subject,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q.toLowerCase());
      })
    : logs;

  const loanLabel =
    [...upcoming, ...blocked].find((entry) => entry._id === loanId)?.itemName ??
    failed.find((log) => (log.loanId?._id ?? log.loanId) === loanId)?.loanId?.itemName ??
    logs.find((log) => (log.loanId?._id ?? log.loanId) === loanId)?.loanId?.itemName ??
    '';

  function renderUpcoming() {
    if (!summary?.scheduled) {
      return (
        <EmptyState
          icon={CalendarClock}
          title="Nothing is scheduled"
          description="Automatic reminders appear here once an active lending entry has a usable channel and its next slot is set. Entries set to manual only never appear."
          action={
            <Link
              to="/loans?role=lent&status=active"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
            >
              Review active loans
            </Link>
          }
        />
      );
    }

    return (
      <div className="space-y-4">
        {upcoming.length < summary.scheduled && (
          <p className="px-1 text-xs text-muted">
            Showing the next {upcoming.length} of {summary.scheduled} scheduled entries.
          </p>
        )}
        {upcoming.map((entry) => (
          <UpcomingCard key={entry._id} entry={entry} />
        ))}
      </div>
    );
  }

  function renderBlocked() {
    if (!summary?.blocked) {
      return (
        <EmptyState
          icon={ShieldAlert}
          title="Nothing is blocked"
          description="Every entry with automatic reminders is armed with a channel that has both consent and contact details."
        />
      );
    }

    return (
      <div className="space-y-4">
        <p className="px-1 text-xs leading-relaxed text-muted">
          These entries are armed, but no selected channel has everything it needs. LendLoop will
          not send until consent and contact details are recorded — it never guesses.
        </p>
        {blocked.map((entry) => (
          <BlockedCard key={entry._id} entry={entry} />
        ))}
      </div>
    );
  }

  function renderFailed() {
    if (!summary?.failed) {
      return (
        <EmptyState
          icon={TriangleAlert}
          title="No failed reminders"
          description="Provider rejections are recorded here with the error, and only those attempts can be retried. Submitted messages are never re-sent automatically."
        />
      );
    }

    return (
      <div className="space-y-4">
        {failed.length < summary.failed && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-xs text-muted">
              Showing the {failed.length} most recent of {summary.failed} failed attempts.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateParams({ view: 'history', status: 'failed' })}
            >
              Open full history
            </Button>
          </div>
        )}
        {failed.map((log) => (
          <LogCard
            key={log._id}
            log={log}
            onRetry={handleRetry}
            retrying={retryingId === log._id}
          />
        ))}
      </div>
    );
  }

  function renderHistory() {
    if (historyLoading) {
      return <LoadingSpinner size="lg" label="Loading your reminder history" />;
    }

    if (historyError) {
      return (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">
            Could not load your reminder history
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{historyError}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setHistoryKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      );
    }

    if (!filteredLogs.length) {
      return (
        <EmptyState
          icon={Inbox}
          title={historyFiltersActive ? 'No reminders match these filters' : 'No reminders logged yet'}
          description={
            historyFiltersActive
              ? 'Nothing in your history matches that channel, status, entry and date combination.'
              : 'Every attempt is logged here, including automatic passes and manual sends that produced a preview or link instead of a submitted message.'
          }
          action={
            historyFiltersActive ? (
              <Button variant="secondary" onClick={clearHistoryFilters}>
                Clear filters
              </Button>
            ) : (
              <Link
                to="/loans?role=lent&status=active"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
              >
                Review active loans
              </Link>
            )
          }
        />
      );
    }

    return (
      <div className="space-y-4">
        {filteredLogs.length >= logLimit && (
          <p className="px-1 text-xs text-muted">
            Showing the newest {logLimit} attempts. Narrow the filters to reach older ones.
          </p>
        )}
        {filteredLogs.map((log) => (
          <LogCard
            key={log._id}
            log={log}
            onRetry={handleRetry}
            retrying={retryingId === log._id}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Reminders</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Reminder control centre
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            What is scheduled, what cannot be sent, and every attempt already made. A slot is an
            attempt, not a guarantee — only a submitted email is reported as accepted by the
            provider, and a WhatsApp link is never claimed as delivered.
          </p>
        </div>

        <Button
          variant="secondary"
          className="sm:ml-auto"
          onClick={refreshAll}
          disabled={overviewLoading || historyLoading}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </header>

      {overviewError && !overview ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">
            Could not load your reminder overview
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{overviewError}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setOverviewKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : overviewLoading && !overview ? (
        <LoadingSpinner size="lg" label="Loading your reminder overview" />
      ) : (
        <>
          {overviewError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm font-medium text-danger">
                Refresh failed — showing the last loaded overview. {overviewError}
              </p>
            </div>
          )}
          {summary && <StatStrip stats={stats} columns={4} />}

          {summary && summary.logged > 0 && (
            <p className="px-1 text-xs leading-relaxed text-muted">
              {pluralise(summary.logged, 'logged attempt')} all time: {statusCounts.sent} submitted,{' '}
              {pluralise(statusCounts.preview, 'preview')},{' '}
              {pluralise(statusCounts.link, 'WhatsApp link')}, and {statusCounts.failed} failed.
              Submitted means the provider accepted it; delivery is not tracked.
            </p>
          )}

          <div className="panel flex flex-col gap-1.5 p-1.5 sm:flex-row">
            {VIEWS.map((entry) => (
              <ViewTab
                key={entry.value}
                active={view === entry.value}
                onClick={() => updateParams({ view: entry.value === 'upcoming' ? '' : entry.value })}
                icon={entry.icon}
                label={entry.label}
                count={
                  summary
                    ? entry.value === 'upcoming'
                      ? summary.scheduled
                      : entry.value === 'blocked'
                        ? summary.blocked
                        : entry.value === 'failed'
                          ? summary.failed
                          : summary.logged
                    : undefined
                }
              />
            ))}
          </div>

          {view === 'history' && (
            <section className="panel space-y-3 p-4 sm:p-5" aria-label="Reminder history filters">
              <label className="relative block">
                <span className="sr-only">Search reminder history</span>
                <input
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="Search item, borrower, recipient or subject"
                  className="h-10 w-full rounded-lg border border-line bg-raised px-3 text-sm text-ink placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </label>

              <FilterRow
                label="Channel"
                options={CHANNEL_FILTERS}
                value={channel}
                onChange={(value) => updateParams({ channel: value })}
              />
              <FilterRow
                label="Mode"
                options={MODE_FILTERS}
                value={mode}
                onChange={(value) => updateParams({ mode: value })}
              />
              <FilterRow
                label="Status"
                options={STATUS_FILTERS}
                value={status}
                onChange={(value) => updateParams({ status: value })}
              />

              <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                <label className="flex items-center gap-2 text-xs font-medium text-muted">
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => updateParams({ from: event.target.value })}
                    className="h-10 rounded-lg border border-line bg-raised px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-muted">
                  to
                  <input
                    type="date"
                    value={to}
                    onChange={(event) => updateParams({ to: event.target.value })}
                    className="h-10 rounded-lg border border-line bg-raised px-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                {loanId && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-line">
                    Entry: {loanLabel || 'selected entry'}
                    <button
                      type="button"
                      onClick={() => updateParams({ loanId: '' })}
                      aria-label="Clear entry filter"
                      className="rounded text-faint transition-colors hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </span>
                )}
                {historyFiltersActive && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={clearHistoryFilters}>
                    Clear filters
                  </Button>
                )}
              </div>

              {rangeInvalid && (
                <p role="alert" className="text-xs font-medium text-danger">
                  The start date falls after the end date, so no attempts can match.
                </p>
              )}
            </section>
          )}

          {view === 'upcoming' && renderUpcoming()}
          {view === 'blocked' && renderBlocked()}
          {view === 'failed' && renderFailed()}
          {view === 'history' && renderHistory()}

          <p className="px-1 text-xs leading-relaxed text-faint">
            Automatic slots are evaluated by the server&apos;s scheduled job. This page reports and
            retries attempts; it does not dispatch scheduled reminders itself.
          </p>
        </>
      )}
    </div>
  );
}
