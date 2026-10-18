import {
  ArrowUpRight,
  BellRing,
  CircleCheck,
  Inbox,
  Plus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import { CategoryIcon } from '../components/items/ItemCard.jsx';
import LoanCard from '../components/loans/LoanCard.jsx';
import ReturnLoanDialog from '../components/loans/ReturnLoanDialog.jsx';
import RequestCard from '../components/requests/RequestCard.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { getApiMessage } from '../services/api.js';
import { itemService } from '../services/itemService.js';
import { loanService } from '../services/loanService.js';
import { reminderService } from '../services/reminderService.js';
import { requestService } from '../services/requestService.js';
import { cn } from '../utils/cn.js';
import { CHANNEL_LABELS } from '../utils/constants.js';
import { formatDate, formatDateTime, isOverdue, timeAgo, untilLabel } from '../utils/formatDate.js';

const DAY_MS = 86400000;
const CREATE_ENTRY_TO = '/loans/new';

const LENT_ACTIVE_TO = '/loans?role=lent&status=active';
const BORROWED_ACTIVE_TO = '/loans?role=borrowed&status=active';
const LENT_OVERDUE_TO = '/loans?role=lent&status=active&overdue=true';
const BORROWED_OVERDUE_TO = '/loans?role=borrowed&status=active&overdue=true';

// Literal class strings only - Tailwind's scanner cannot see values assembled at runtime.
const VIEW_ALL_LINK =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-hover';

const RAIL_LINK = 'text-xs font-semibold text-primary transition-colors hover:text-primary-hover';

const METRIC_TONES = { ink: 'text-ink', pending: 'text-pending', danger: 'text-danger' };

const SHELF_LABELS = { available: 'On the shelf', borrowed: 'Out on loan', archived: 'Archived' };

// Honest, compact labels for the rail's recent reminder attempts.
const REMINDER_STATUS = {
  sent: { label: 'Submitted', className: 'text-success' },
  preview: { label: 'Preview', className: 'text-pending' },
  link: { label: 'WhatsApp link', className: 'text-info' },
  failed: { label: 'Failed', className: 'text-danger' },
};

const byDueDate = (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
const byReturnedAt = (a, b) =>
  new Date(b.returnedAt ?? b.updatedAt ?? b.createdAt).getTime() -
  new Date(a.returnedAt ?? a.updatedAt ?? a.createdAt).getTime();

// The metrics are shown as fixed-width pairs, so 4 reads as 04. padStart leaves anything
// already two digits or longer alone rather than truncating a real three-figure count.
function pad2(value) {
  return String(value).padStart(2, '0');
}

function SectionHeader({ title, hint, to, linkLabel = 'View all' }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {to && (
        <Link to={to} className={VIEW_ALL_LINK}>
          {linkLabel}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function Metric({ value, label, tone = 'ink', caption, to }) {
  const content = (
    <>
      <p
        className={cn(
          'font-display text-4xl font-bold tabular-nums sm:text-5xl',
          METRIC_TONES[tone],
        )}
      >
        {pad2(value)}
      </p>
      <p className="eyebrow mt-2.5 flex items-center gap-1.5">
        {label}
        {to && <ArrowUpRight className="h-3.5 w-3.5 text-faint" aria-hidden="true" />}
      </p>
      {caption && <p className="mt-1.5 text-sm text-muted">{caption}</p>}
    </>
  );

  if (!to) return <div className="bg-surface px-5 py-6 sm:px-7">{content}</div>;

  return (
    <Link
      to={to}
      className="group block bg-surface px-5 py-6 transition-colors hover:bg-raised sm:px-7"
    >
      {content}
    </Link>
  );
}

function RailStat({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function ShelfRow({ item }) {
  return (
    <Link
      to={`/items/${item._id}`}
      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-raised"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-raised text-primary">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <CategoryIcon category={item.categoryId?.name} className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
        <span className="block text-xs text-faint">
          {SHELF_LABELS[item.status] ?? 'Listed'}
        </span>
      </span>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?._id;

  const [items, setItems] = useState([]);
  const [loans, setLoans] = useState([]);
  const [returnedLoans, setReturnedLoans] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [reminderOverview, setReminderOverview] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [busyId, setBusyId] = useState('');
  const [pendingReturn, setPendingReturn] = useState(null);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    Promise.all([
      itemService.mine().then((result) => result?.items ?? []),
      loanService.list({ status: 'active', sort: 'due' }),
      loanService.list({ status: 'returned', sort: 'newest' }),
      requestService.incoming({ status: 'pending' }),
      requestService.outgoing({ status: 'pending' }),
      // Reminder context is supplementary: a failure here must not hide the loan list.
      reminderService.overview().catch(() => null),
    ])
      .then(
        ([
          myItems,
          activeLoans,
          returned,
          incomingRequests,
          outgoingRequests,
          reminderResult,
        ]) => {
          if (ignore) return;
          setItems(Array.isArray(myItems) ? myItems : []);
          setLoans(Array.isArray(activeLoans) ? activeLoans : []);
          setReturnedLoans(Array.isArray(returned) ? returned : []);
          setIncoming(Array.isArray(incomingRequests) ? incomingRequests : []);
          setOutgoing(Array.isArray(outgoingRequests) ? outgoingRequests : []);
          setReminderOverview(reminderResult ?? null);
        },
      )
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your dashboard'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const roleFor = (loan) => (loan.lenderId?._id === userId ? 'lent' : 'borrowed');

  const lentLoans = useMemo(
    () => loans.filter((loan) => loan.lenderId?._id === userId),
    [loans, userId],
  );
  const borrowedLoans = useMemo(
    () => loans.filter((loan) => loan.lenderId?._id !== userId),
    [loans, userId],
  );

  const overdueLent = useMemo(() => lentLoans.filter(isOverdue).sort(byDueDate), [lentLoans]);
  const overdueBorrowed = useMemo(
    () => borrowedLoans.filter(isOverdue).sort(byDueDate),
    [borrowedLoans],
  );
  const overdueLoans = useMemo(
    () => [...overdueLent, ...overdueBorrowed].sort(byDueDate),
    [overdueLent, overdueBorrowed],
  );
  const upcomingLoans = useMemo(
    () => loans.filter((loan) => !isOverdue(loan)).sort(byDueDate).slice(0, 4),
    [loans],
  );

  const dueSoonCount = useMemo(
    () =>
      loans.filter(
        (loan) =>
          !isOverdue(loan) && new Date(loan.dueDate).getTime() - Date.now() <= 7 * DAY_MS,
      ).length,
    [loans],
  );

  // Returned loans are sorted by when they actually came back, not by creation date, so
  // older records without returnedAt fall back to their last update.
  const recentReturns = useMemo(
    () => [...returnedLoans].sort(byReturnedAt).slice(0, 4),
    [returnedLoans],
  );

  const attentionRequests = useMemo(() => incoming.slice(0, 3), [incoming]);
  const pendingOutgoing = useMemo(() => outgoing.slice(0, 3), [outgoing]);

  const shelfItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [items],
  );

  // Reminder context comes from the same overview endpoint the control centre uses, so
  // the rail and that page can never disagree about what is armed or blocked.
  const reminderSummary = reminderOverview?.summary ?? null;
  const upcomingReminders = reminderOverview?.upcoming ?? [];
  const recentReminders = reminderOverview?.recent ?? [];

  // Approving is transactional on the server: the item goes to borrowed, a loan opens and every
  // other pending request on that item is auto-rejected. Mirror all of that locally so the
  // dashboard stays truthful without a full refetch.
  async function handleApprove(request) {
    const itemId = request.itemId?._id;
    setBusyId(request._id);

    try {
      const result = await requestService.approve(request._id);

      setIncoming((current) =>
        current.filter((entry) => {
          if (entry._id === request._id) return false;
          if (!itemId) return true;
          return entry.itemId?._id !== itemId;
        }),
      );

      if (itemId) {
        setItems((current) =>
          current.map((entry) =>
            entry._id === itemId ? { ...entry, status: 'borrowed', pendingRequestCount: 0 } : entry,
          ),
        );
      }

      if (result?.loan) {
        setLoans((current) => [result.loan, ...current]);
      }

      toast.success('Request approved — loan created');
    } catch (actionError) {
      // A 409 here usually means someone else got the item first.
      toast.error(getApiMessage(actionError, 'Could not approve that request'));
    } finally {
      setBusyId('');
    }
  }

  async function handleReject(request) {
    const itemId = request.itemId?._id;
    setBusyId(request._id);

    try {
      await requestService.reject(request._id);

      setIncoming((current) => current.filter((entry) => entry._id !== request._id));

      if (itemId) {
        setItems((current) =>
          current.map((entry) =>
            entry._id === itemId
              ? { ...entry, pendingRequestCount: Math.max(0, (entry.pendingRequestCount ?? 1) - 1) }
              : entry,
          ),
        );
      }

      toast.success('Request rejected');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not reject that request'));
    } finally {
      setBusyId('');
    }
  }

  async function handleCancel(request) {
    setBusyId(request._id);

    try {
      await requestService.cancel(request._id);
      setOutgoing((current) => current.filter((entry) => entry._id !== request._id));
      toast.success('Request cancelled');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not cancel that request'));
    } finally {
      setBusyId('');
    }
  }

  function handleReturned(returned) {
    const loan = pendingReturn;
    if (!returned || !loan) return;
    const itemId = returned.itemId?._id ?? returned.itemId ?? loan.itemId?._id;

    setLoans((current) => current.filter((entry) => entry._id !== returned._id));
    setReturnedLoans((current) => [
      returned,
      ...current.filter((entry) => entry._id !== returned._id),
    ]);
    if (itemId) {
      setItems((current) =>
        current.map((entry) => (entry._id === itemId ? { ...entry, status: 'available' } : entry)),
      );
    }
    setPendingReturn(null);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Overview</p>
          <h1 className="mt-2.5 text-3xl font-bold text-ink sm:text-4xl">
            Keep track of what matters.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Deadlines, requests, and returns across everything you lend and borrow.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => navigate(CREATE_ENTRY_TO)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create lending entry
        </Button>
      </header>

      {loading ? (
        <LoadingSpinner size="lg" label="Loading your dashboard" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load your dashboard</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{error}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              value={lentLoans.length}
              label="Lent out"
              caption="Items currently with other people"
              to={LENT_ACTIVE_TO}
            />
            <Metric
              value={borrowedLoans.length}
              label="Borrowed"
              caption="Items you currently have from others"
              to={BORROWED_ACTIVE_TO}
            />
            <Metric
              value={overdueLent.length}
              label="Lent overdue"
              tone={overdueLent.length > 0 ? 'danger' : 'ink'}
              caption={
                overdueLent.length > 0 ? 'Past the agreed return date' : 'Nothing lent is late'
              }
              to={LENT_OVERDUE_TO}
            />
            <Metric
              value={overdueBorrowed.length}
              label="Borrowed overdue"
              tone={overdueBorrowed.length > 0 ? 'danger' : 'ink'}
              caption={
                overdueBorrowed.length > 0 ? 'Return these to their owners' : 'Nothing borrowed is late'
              }
              to={BORROWED_OVERDUE_TO}
            />
          </section>

          {/* The rail only earns its column on wide screens; below lg it stacks under the
              feed so a phone never scrolls past two panels to reach the loans. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
            <div className="min-w-0 space-y-10">
              {overdueLoans.length > 0 && (
                <section className="space-y-4">
                  <SectionHeader
                    title="Overdue"
                    hint={`${overdueLent.length} lent · ${overdueBorrowed.length} borrowed — past the agreed return date.`}
                    to="/loans?status=active&overdue=true"
                    linkLabel="All overdue"
                  />
                  <div className="space-y-3">
                    {overdueLoans.slice(0, 4).map((loan) => {
                      const role = roleFor(loan);
                      return (
                        <LoanCard
                          key={loan._id}
                          loan={loan}
                          role={role}
                          onReturn={role === 'lent' ? () => setPendingReturn(loan) : undefined}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="space-y-4">
                <SectionHeader
                  title="Requests"
                  hint={
                    incoming.length === 0 && outgoing.length === 0
                      ? 'No pending requests in either direction.'
                      : `${incoming.length} waiting on you · ${outgoing.length} waiting on others.`
                  }
                  to="/requests"
                  linkLabel="Manage requests"
                />

                <div className="space-y-5">
                  <div className="space-y-3">
                    <h3 className="eyebrow">Waiting on you</h3>
                    {attentionRequests.length > 0 ? (
                      attentionRequests.map((request) => (
                        <RequestCard
                          key={request._id}
                          request={request}
                          direction="incoming"
                          busy={busyId === request._id}
                          onApprove={() => handleApprove(request)}
                          onReject={() => handleReject(request)}
                        />
                      ))
                    ) : (
                      <p className="inset-panel flex items-center gap-2.5 px-4 py-3 text-sm text-muted">
                        <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        All caught up — new requests to borrow your items land here.
                      </p>
                    )}
                  </div>

                  {pendingOutgoing.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="eyebrow">Waiting on others</h3>
                      {pendingOutgoing.map((request) => (
                        <RequestCard
                          key={request._id}
                          request={request}
                          direction="outgoing"
                          busy={busyId === request._id}
                          onCancel={() => handleCancel(request)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {upcomingLoans.length > 0 ? (
                <section className="space-y-4">
                  <SectionHeader
                    title="Upcoming deadlines"
                    hint={
                      dueSoonCount > 0
                        ? `Nearest first — ${dueSoonCount} due within seven days, in both directions.`
                        : 'Nearest first across everything you have lent or borrowed.'
                    }
                    to="/loans?status=active"
                    linkLabel="All active loans"
                  />
                  <div className="space-y-3">
                    {upcomingLoans.map((loan) => {
                      const role = roleFor(loan);
                      return (
                        <LoanCard
                          key={loan._id}
                          loan={loan}
                          role={role}
                          onReturn={role === 'lent' ? () => setPendingReturn(loan) : undefined}
                        />
                      );
                    })}
                  </div>
                </section>
              ) : (
                <EmptyState
                  icon={Inbox}
                  title="Nothing is out right now"
                  description="When you lend something or borrow an item, its deadline and return controls appear here."
                  action={
                    <Button onClick={() => navigate(CREATE_ENTRY_TO)}>
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Create lending entry
                    </Button>
                  }
                />
              )}

              {upcomingReminders.length > 0 && (
                <section className="space-y-4">
                  <SectionHeader
                    title="Reminder slots ahead"
                    hint="Scheduled attempts, nearest first. A slot can still fail if the provider rejects it."
                    to="/reminders"
                    linkLabel="Control centre"
                  />
                  <div className="panel divide-y divide-line">
                    {upcomingReminders.slice(0, 3).map((entry) => (
                      <Link
                        key={entry._id}
                        to={`/loans/${entry._id}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-raised"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                            <BellRing className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {entry.itemName}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {entry.borrowerName} · due {formatDate(entry.dueDate)}
                            </span>
                          </span>
                        </span>
                        <span className="text-right text-xs">
                          <span className="block font-semibold text-ink">
                            {formatDateTime(entry.nextDueAt)}
                          </span>
                          <span className="block text-muted">{untilLabel(entry.nextDueAt)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {recentReturns.length > 0 && (
                <section className="space-y-4">
                  <SectionHeader
                    title="Recently returned"
                    hint="The latest entries closed in both directions, newest first."
                    to="/loans?status=returned"
                    linkLabel="All returned"
                  />
                  <div className="space-y-3">
                    {recentReturns.map((loan) => (
                      <LoanCard key={loan._id} loan={loan} role={roleFor(loan)} />
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24">
              <section className="panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-ink">Your shelf</h2>
                  <Link to="/my-items" className={RAIL_LINK}>
                    View all
                  </Link>
                </div>

                {shelfItems.length > 0 ? (
                  <div className="mt-2 flex flex-col">
                    {shelfItems.map((item) => (
                      <ShelfRow key={item._id} item={item} />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Nothing listed yet.{' '}
                    <Link
                      to="/my-items"
                      className="font-semibold text-primary transition-colors hover:text-primary-hover"
                    >
                      List an item
                    </Link>{' '}
                    and it becomes requestable.
                  </p>
                )}

                {shelfItems.length > 0 && (
                  <Link
                    to="/my-items"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary-hover"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    List or manage items
                  </Link>
                )}
              </section>

              <section className="panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-ink">Automatic reminders</h2>
                  <Link to="/reminders" className={RAIL_LINK}>
                    Manage
                  </Link>
                </div>

                {!reminderSummary ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Reminder status could not be loaded.{' '}
                    <Link
                      to="/reminders"
                      className="font-semibold text-primary transition-colors hover:text-primary-hover"
                    >
                      Open the control centre
                    </Link>{' '}
                    to check scheduled and failed attempts.
                  </p>
                ) : reminderSummary.activeLoans === 0 ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Nothing is out on loan, so no reminders are scheduled.
                  </p>
                ) : (
                  <>
                    <dl className="mt-3 space-y-2">
                      <RailStat label="Scheduled" value={reminderSummary.scheduled} />
                      <RailStat label="Due this week" value={reminderSummary.dueSoon} />
                      <RailStat label="Blocked" value={reminderSummary.blocked} />
                      <RailStat label="Failed attempts" value={reminderSummary.failed} />
                    </dl>

                    {reminderSummary.blocked > 0 && (
                      <Link
                        to="/reminders?view=blocked"
                        className="mt-3 block rounded-lg border border-pending/30 bg-pending-soft px-3 py-2 text-xs leading-relaxed text-pending transition-colors hover:border-pending/50"
                      >
                        {reminderSummary.blocked === 1
                          ? '1 armed loan has no usable channel — consent or a contact detail is missing. Nothing will be sent.'
                          : `${reminderSummary.blocked} armed loans have no usable channel — consent or a contact detail is missing. Nothing will be sent.`}{' '}
                        Review blocked entries
                      </Link>
                    )}

                    {reminderSummary.failed > 0 && (
                      <Link
                        to="/reminders?view=failed"
                        className="mt-2 block rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs leading-relaxed text-danger transition-colors hover:border-danger/40"
                      >
                        {reminderSummary.failed}{' '}
                        {reminderSummary.failed === 1 ? 'failed attempt is' : 'failed attempts are'}{' '}
                        recorded. Only failed sends and generated links can be retried. Review
                        failures
                      </Link>
                    )}
                  </>
                )}
              </section>

              {recentReminders.length > 0 && (
                <section className="panel p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold text-ink">Latest reminder activity</h2>
                    <Link to="/reminders?view=history" className={RAIL_LINK}>
                      History
                    </Link>
                  </div>

                  <ul className="mt-2 divide-y divide-line-soft">
                    {recentReminders.slice(0, 3).map((log) => {
                      const meta =
                        REMINDER_STATUS[log.status] ?? {
                          label: log.status ?? 'Unknown',
                          className: 'text-muted',
                        };
                      return (
                        <li key={log._id}>
                          <Link
                            to={
                              log.loanId?._id
                                ? `/loans/${log.loanId._id}`
                                : '/reminders?view=history'
                            }
                            className="block py-2.5"
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-semibold text-ink">
                                {log.loanId?.itemName ?? 'Lending entry'}
                              </span>
                              <span
                                className={cn(
                                  'shrink-0 text-[11px] font-semibold',
                                  meta.className,
                                )}
                              >
                                {meta.label}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
                              <span className="truncate">
                                {CHANNEL_LABELS[log.channel] ?? log.channel}
                              </span>
                              <span className="shrink-0">{timeAgo(log.createdAt)}</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </aside>
          </div>
        </>
      )}

      <ReturnLoanDialog
        loan={pendingReturn}
        open={Boolean(pendingReturn)}
        onClose={() => setPendingReturn(null)}
        onReturned={handleReturned}
      />
    </div>
  );
}
