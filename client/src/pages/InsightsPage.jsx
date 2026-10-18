import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import { getApiMessage } from '../services/api.js';
import { insightService } from '../services/insightService.js';
import { cn } from '../utils/cn.js';

const DAY_MS = 86_400_000;

const PRESETS = [
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last 12 months', days: 365 },
];

const STATUS_LABELS = {
  sent: 'Sent',
  preview: 'Previewed',
  link: 'Link generated',
  failed: 'Failed',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

function defaultRange() {
  return { from: daysAgoIso(89), to: todayIso() };
}

function monthBounds(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return { start: month, end: month };
  const start = `${month}-01`;
  // Day zero of the following month is the last day of this one, so February links never
  // point at an impossible 31st that the API would reject.
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function StatCard({ label, value, hint, to, tone = 'ink' }) {
  const content = (
    <>
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-2xl font-bold tabular-nums',
          tone === 'danger' ? 'text-danger' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );

  if (!to) {
    return <div className="rounded-xl border border-line bg-raised px-4 py-4">{content}</div>;
  }

  return (
    <Link
      to={to}
      className="group rounded-xl border border-line bg-raised px-4 py-4 transition-colors hover:border-faint"
    >
      {content}
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
        Open list
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function BarRow({ label, count, max, to }) {
  const width = max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
  const body = (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs font-medium text-ink" title={label}>
        {label}
      </span>
      <span className="flex-1">
        <span className="block h-2.5 w-full overflow-hidden rounded-full bg-line-soft">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
        </span>
      </span>
      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
        {count}
      </span>
    </div>
  );

  if (!to) return <li className="py-1.5">{body}</li>;

  return (
    <li className="py-1.5">
      <Link to={to} className="block rounded-md transition-colors hover:bg-raised">
        {body}
      </Link>
    </li>
  );
}

export default function InsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fallback = useMemo(defaultRange, []);
  const from = searchParams.get('from') || fallback.from;
  const to = searchParams.get('to') || fallback.to;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');

    insightService
      .get({ from, to })
      .then((result) => {
        if (!ignore) setData(result ?? null);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your insights'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [from, to, reloadKey]);

  function applyRange(nextFrom, nextTo) {
    const next = new URLSearchParams(searchParams);
    next.set('from', nextFrom);
    next.set('to', nextTo);
    setSearchParams(next, { replace: true });
  }

  function applyPreset(days) {
    applyRange(daysAgoIso(days - 1), todayIso());
  }

  const activePreset = PRESETS.find(
    (preset) => daysAgoIso(preset.days - 1) === from && todayIso() === to,
  );

  async function handleExport() {
    setExporting(true);
    try {
      const response = await insightService.exportCsv({ from, to });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lendloop-insights-${from}-to-${to}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch (exportError) {
      toast.error(getApiMessage(exportError, 'Could not export that range'));
    } finally {
      setExporting(false);
    }
  }

  const hasData =
    data &&
    (data.lent.total > 0 ||
      data.returns.total > 0 ||
      data.snapshot.activeLent > 0 ||
      data.snapshot.activeBorrowed > 0 ||
      data.reminders.total > 0);

  const maxMonth = data?.volume?.reduce((max, entry) => Math.max(max, entry.count), 0) ?? 0;
  const categoryMax =
    data?.categories?.reduce((max, entry) => Math.max(max, entry.count), 0) ?? 0;
  const reminderTotalByStatus = (data?.reminders?.byChannelStatus ?? []).reduce(
    (totals, entry) => ({ ...totals, [entry.status]: (totals[entry.status] ?? 0) + entry.count }),
    {},
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Patterns</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Insights</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            How your lending is going. Range totals cover when loans started and when they came
            back; the four snapshot cards show what is true right now.
          </p>
        </div>
        <Button variant="secondary" onClick={handleExport} loading={exporting} disabled={!data}>
          {!exporting && <Download className="h-4 w-4" aria-hidden="true" />}
          Export CSV
        </Button>
      </header>

      <section className="panel p-3 sm:p-4" aria-label="Insight date range">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Range presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={activePreset?.id === preset.id}
                onClick={() => applyPreset(preset.days)}
                className={cn(
                  'inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-colors',
                  activePreset?.id === preset.id
                    ? 'bg-primary text-primary-ink'
                    : 'text-muted hover:bg-raised hover:text-ink',
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="ms-auto flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-muted">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(event) => applyRange(event.target.value, to)}
                className="mt-1 block h-9 rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              To
              <input
                type="date"
                value={to}
                min={from}
                max={todayIso()}
                onChange={(event) => applyRange(from, event.target.value)}
                className="mt-1 block h-9 rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-primary focus:outline-none"
              />
            </label>
          </div>
        </div>
        {data?.range && (
          <p className="mt-3 text-xs text-muted">
            Showing {data.range.from} to {data.range.to} (UTC calendar days).
          </p>
        )}
      </section>

      {loading ? (
        <LoadingSpinner size="lg" label="Loading insights" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load your insights</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{error}</p>
          <Button variant="secondary" className="mt-6" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : !hasData ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing to measure in this range"
          description="Record a lending entry or choose a wider date range. Insights fill in as loans start and come back."
          action={
            <Link
              to="/loans/new"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
            >
              Record a lending entry
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="snapshot-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="snapshot-heading" className="text-base font-bold text-ink">
                Right now
              </h2>
              <p className="text-xs text-muted">Live totals, not limited to the selected range</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Active lent out"
                value={data.snapshot.activeLent}
                hint="Loans you have made that are still out"
                to="/loans?role=lent&status=active"
              />
              <StatCard
                label="Active borrowed"
                value={data.snapshot.activeBorrowed}
                hint="Items you have borrowed that are still out"
                to="/loans?role=borrowed&status=active"
              />
              <StatCard
                label="Overdue lent"
                value={data.snapshot.overdueLent}
                tone={data.snapshot.overdueLent > 0 ? 'danger' : 'ink'}
                hint="Your active loans past the deadline"
                to="/loans?role=lent&status=active&overdue=true"
              />
              <StatCard
                label="Overdue borrowed"
                value={data.snapshot.overdueBorrowed}
                tone={data.snapshot.overdueBorrowed > 0 ? 'danger' : 'ink'}
                hint="Active borrows past the deadline"
                to="/loans?role=borrowed&status=active&overdue=true"
              />
            </div>
          </section>

          <section aria-labelledby="range-summary-heading" className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="range-summary-heading" className="text-base font-bold text-ink">
                In this range
              </h2>
              <Link
                to={`/loans?role=lent&from=${from}&to=${to}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Open these loans
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg bg-raised px-3 py-3">
                <dt className="eyebrow">Loans started</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-ink">{data.lent.total}</dd>
              </div>
              <div className="rounded-lg bg-raised px-3 py-3">
                <dt className="eyebrow">Still active</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-ink">{data.lent.active}</dd>
              </div>
              <div className="rounded-lg bg-raised px-3 py-3">
                <dt className="eyebrow">Returned</dt>
                <dd className="mt-1 text-xl font-bold tabular-nums text-ink">
                  {data.returns.total}
                </dd>
              </div>
              <div className="rounded-lg bg-raised px-3 py-3">
                <dt className="eyebrow">Overdue now</dt>
                <dd
                  className={cn(
                    'mt-1 text-xl font-bold tabular-nums',
                    data.lent.overdueNow > 0 ? 'text-danger' : 'text-ink',
                  )}
                >
                  {data.lent.overdueNow}
                </dd>
              </div>
            </dl>

            <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  Return timing
                </p>
                {data.returns.total === 0 ? (
                  <p className="mt-1.5 text-sm text-muted">
                    No loans came back in this range, so there is no return timing to show.
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-1 text-sm text-muted">
                    <p>
                      <span className="font-semibold text-ink">{data.returns.onTime}</span> on time ·{' '}
                      <span className="font-semibold text-ink">{data.returns.late}</span> late
                    </p>
                    {data.rates.onTime !== null ? (
                      <p>
                        <span className="font-semibold text-ink">{data.rates.onTime}%</span> came
                        back by the deadline.
                      </p>
                    ) : data.rates.smallSample ? (
                      <p>
                        Not enough completed returns to show a rate ({data.rates.sampleSize} of 5
                        needed). Counts are shown instead.
                      </p>
                    ) : null}
                    {data.returns.averageDays !== null && (
                      <p>Average completed duration: {data.returns.averageDays} days.</p>
                    )}
                  </div>
                )}
                {data.returns.missingTimestampClosed > 0 && (
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {data.returns.missingTimestampClosed} older closed{' '}
                    {data.returns.missingTimestampClosed === 1 ? 'loan has' : 'loans have'} no
                    recorded return date. They are excluded from timing and never counted as on
                    time.
                  </p>
                )}
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
                  Reminder activity
                </p>
                {data.reminders.total === 0 ? (
                  <p className="mt-1.5 text-sm text-muted">
                    No reminder activity in this range.
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {['sent', 'link', 'preview', 'failed'].map((status) =>
                      reminderTotalByStatus[status] ? (
                        <Link
                          key={status}
                          to={`/reminders?status=${status}`}
                          className={cn(
                            'rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors',
                            status === 'failed'
                              ? 'bg-danger-soft text-danger ring-danger/25 hover:bg-danger/15'
                              : 'bg-raised text-muted ring-line hover:text-ink',
                          )}
                        >
                          {STATUS_LABELS[status]} {reminderTotalByStatus[status]}
                        </Link>
                      ) : null,
                    )}
                    <Link
                      to="/reminders"
                      className="rounded-md px-2.5 py-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Reminder centre
                    </Link>
                  </div>
                )}
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  “Sent” means a provider accepted the email; delivery is not tracked. Link-generated
                  WhatsApp messages are not counted as sent.
                </p>
              </div>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="volume-heading" className="panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 id="volume-heading" className="text-base font-bold text-ink">
                  Lending volume
                </h2>
                <CalendarDays className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>
              <p className="mt-1 text-xs text-muted">Loans started per month (UTC).</p>
              {data.volume.length ? (
                <ul className="mt-4 space-y-2">
                  {data.volume.map((entry) => {
                    const bounds = monthBounds(entry.month);
                    return (
                      <li key={entry.month}>
                        <BarRow
                          label={entry.month}
                          count={entry.count}
                          max={maxMonth}
                          to={`/loans?role=lent&from=${bounds.start}&to=${bounds.end}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-4 flex items-start gap-2 text-sm text-muted">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  No loans started in this range.
                </p>
              )}
            </section>

            <section aria-labelledby="categories-heading" className="panel p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 id="categories-heading" className="text-base font-bold text-ink">
                  Top categories
                </h2>
                <BarChart3 className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>
              <p className="mt-1 text-xs text-muted">Loans started in this range, by category.</p>
              {data.categories.length ? (
                <ul className="mt-4 space-y-2">
                  {data.categories.map((entry) => (
                    <li key={entry.categoryId ?? entry.name}>
                      <BarRow
                        label={entry.name}
                        count={entry.count}
                        max={categoryMax}
                        to={
                          entry.categoryId
                            ? `/loans?role=lent&categoryId=${entry.categoryId}&from=${from}&to=${to}`
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted">No category activity in this range.</p>
              )}
            </section>
          </div>

          <p className="px-1 text-xs leading-relaxed text-muted">
            Counts cover your own lending only. A loan is “late” when it came back after the deadline
            day; an active loan past its deadline is counted as overdue now, not as a late return.
            Percentages are hidden for samples smaller than five.
          </p>
        </div>
      )}
    </div>
  );
}
