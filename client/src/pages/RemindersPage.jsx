import {
  BellRing,
  ChevronDown,
  Clock,
  ExternalLink,
  Inbox,
  Mail,
  MessageCircle,
  Play,
  RefreshCw,
  TriangleAlert,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import PriorityBadge from '../components/common/PriorityBadge.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { getApiMessage } from '../services/api.js';
import { reminderService } from '../services/reminderService.js';
import { cn } from '../utils/cn.js';
import { CHANNEL_LABELS, REMINDER_CHANNELS } from '../utils/constants.js';
import { formatDate, formatDateTime, timeAgo } from '../utils/formatDate.js';

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
  { value: 'sent', label: 'Sent' },
  { value: 'preview', label: 'Preview' },
  { value: 'link', label: 'Link ready' },
  { value: 'failed', label: 'Failed' },
];

// "preview" means no mail provider is configured and "link" means the lender still has to
// press send in WhatsApp, so neither is ever worded as a delivery. Static class strings
// only - Tailwind scans source for literal values.
const STATUS_META = {
  sent: {
    label: 'Sent',
    badge: 'bg-success-soft text-success ring-success/25',
    dot: 'bg-success',
    note: 'Accepted by the configured mail provider.',
    noteClass: 'text-muted',
  },
  preview: {
    label: 'Preview only — no mail provider configured',
    badge: 'bg-pending-soft text-pending ring-pending/25',
    dot: 'bg-pending',
    note: 'The message was rendered and logged instead of sent. Nothing reached the borrower.',
    noteClass: 'text-pending',
  },
  link: {
    label: 'Link ready — not delivered by LendLoop',
    badge: 'bg-info-soft text-info ring-info/25',
    dot: 'bg-info',
    note: 'LendLoop does not send WhatsApp messages. Open the link and press send yourself.',
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

function LogCard({ log }) {
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

  return (
    <article className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
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

        <div className="flex flex-wrap items-center justify-end gap-2">
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
            No WhatsApp link was stored for this log, so it cannot be delivered.
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

export default function RemindersPage() {
  const [channel, setChannel] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    reminderService
      .logs({
        channel: channel || undefined,
        mode: mode || undefined,
        status: status || undefined,
      })
      .then((result) => {
        if (ignore) return;
        setLogs(Array.isArray(result) ? result : []);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your reminder history'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [channel, mode, status, reloadKey]);

  // Counted from the loaded logs only - the endpoint caps at the newest 200, so these are
  // never presented as lifetime totals.
  const counts = useMemo(() => {
    const tally = { sent: 0, preview: 0, link: 0, failed: 0 };
    for (const log of logs) {
      if (Object.hasOwn(tally, log.status)) tally[log.status] += 1;
    }
    return tally;
  }, [logs]);

  const filtersActive = Boolean(channel || mode || status);

  const stats = [
    {
      key: 'logged',
      label: 'Logged',
      value: logs.length,
      caption: 'Reminders in this view, newest first',
      icon: Inbox,
      tint: 'bg-info-soft text-info',
      valueClass: 'text-ink',
    },
    {
      key: 'sent',
      label: 'Sent',
      value: counts.sent,
      caption: 'Accepted by the mail provider',
      icon: Mail,
      tint: 'bg-success-soft text-success',
      valueClass: 'text-ink',
    },
    {
      key: 'undelivered',
      label: 'Not delivered',
      value: counts.preview + counts.link,
      caption: 'Previews and WhatsApp links still on you',
      icon: BellRing,
      tint: 'bg-pending-soft text-pending',
      valueClass: 'text-pending',
    },
    {
      key: 'failed',
      label: 'Failed',
      value: counts.failed,
      caption: 'Rejected by the provider',
      icon: TriangleAlert,
      tint: 'bg-danger-soft text-danger',
      valueClass: counts.failed ? 'text-danger' : 'text-ink',
    },
  ];

  function clearFilters() {
    setChannel('');
    setMode('');
    setStatus('');
  }

  async function handleRun() {
    setRunning(true);
    try {
      const summary = (await reminderService.run()) ?? {};
      const scanned = summary.scanned ?? 0;
      const slotsDue = summary.slotsDue ?? 0;
      const logged = summary.logs ?? 0;
      const failed = summary.failed ?? 0;
      const skipped = summary.skippedNoChannel ?? 0;

      // "Logged" rather than "sent": a pass can produce previews or WhatsApp links.
      const headline = logged
        ? `Scheduler pass: ${pluralise(scanned, 'entry')} scanned, ${pluralise(slotsDue, 'slot')} due, ${pluralise(logged, 'reminder')} logged`
        : `Scheduler pass: nothing was due yet — ${pluralise(scanned, 'entry')} scanned`;
      const options = skipped
        ? { description: `${pluralise(skipped, 'entry')} skipped with no usable channel` }
        : undefined;

      if (failed) {
        toast.error(`${headline} — ${pluralise(failed, 'reminder')} failed`, options);
      } else {
        toast.success(headline, options);
      }

      setReloadKey((key) => key + 1);
    } catch (runError) {
      toast.error(getApiMessage(runError, 'Could not run the scheduler'));
    } finally {
      setRunning(false);
    }
  }

  function renderEmptyState() {
    if (filtersActive) {
      return (
        <EmptyState
          icon={Inbox}
          title="No reminders match these filters"
          description="Nothing in your history is on that channel, mode and status combination. Clear the filters to see every logged reminder."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Clear filters
            </Button>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={BellRing}
        title="No reminders logged yet"
        description="Reminders appear here once a lending entry's schedule fires on its own, or you press send on a single entry. Every attempt is logged, including the ones that never left the building."
        action={
          <Button onClick={handleRun} loading={running} disabled={running}>
            {!running && <Play className="h-4 w-4" aria-hidden="true" />}
            Run scheduler now
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Reminders</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Reminder history
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Every reminder LendLoop has attempted for your lending entries, automatic and manual.
            Anything marked preview or link ready has not reached the borrower.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={running || loading}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
          <Button onClick={handleRun} loading={running} disabled={running}>
            {!running && <Play className="h-4 w-4" aria-hidden="true" />}
            Run scheduler now
          </Button>
        </div>
      </header>

      <div className="panel space-y-3 p-4 sm:p-5">
        <FilterRow label="Channel" options={CHANNEL_FILTERS} value={channel} onChange={setChannel} />
        <FilterRow label="Mode" options={MODE_FILTERS} value={mode} onChange={setMode} />
        <FilterRow label="Status" options={STATUS_FILTERS} value={status} onChange={setStatus} />
        {filtersActive && (
          <div className="flex justify-end border-t border-line pt-3">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {!loading && !error && logs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(({ key, label, value, caption, icon: Icon, tint, valueClass }) => (
            <div key={key} className="panel p-5">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tint)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className={cn('mt-3 font-display text-3xl font-extrabold tracking-tight', valueClass)}>
                {value}
              </p>
              <p className="eyebrow mt-1">{label}</p>
              <p className="mt-1.5 text-sm text-muted">{caption}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <LoadingSpinner size="lg" label="Loading your reminder history" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">
            Could not load your reminder history
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{error}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={running}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : logs.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="space-y-4">
          {logs.map((log) => (
            <LogCard key={log._id} log={log} />
          ))}
        </div>
      )}
    </div>
  );
}
