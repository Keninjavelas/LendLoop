import {
  ArrowUpRight,
  ChevronRight,
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
import { requestService } from '../services/requestService.js';
import { cn } from '../utils/cn.js';
import { isOverdue } from '../utils/formatDate.js';

const DAY_MS = 86400000;
const CREATE_ENTRY_TO = '/loans/new';

// Literal class strings only - Tailwind's scanner cannot see values assembled at runtime.
const VIEW_ALL_LINK =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-hover';

const RAIL_LINK = 'text-xs font-semibold text-primary transition-colors hover:text-primary-hover';

const METRIC_TONES = { ink: 'text-ink', pending: 'text-pending', danger: 'text-danger' };

const SHELF_LABELS = { available: 'On the shelf', borrowed: 'Out on loan', archived: 'Archived' };

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

function Metric({ value, label, tone = 'ink', caption }) {
  return (
    <div className="px-5 py-6 sm:px-7">
      <p
        className={cn(
          'font-display text-4xl font-bold tabular-nums sm:text-5xl',
          METRIC_TONES[tone],
        )}
      >
        {pad2(value)}
      </p>
      <p className="eyebrow mt-2.5">{label}</p>
      {caption && <p className="mt-1.5 text-sm text-muted">{caption}</p>}
    </div>
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
  const [incoming, setIncoming] = useState([]);

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
      itemService.mine(),
      loanService.list({ status: 'active' }),
      requestService.incoming('pending'),
    ])
      .then(([myItems, activeLoans, incomingRequests]) => {
        if (ignore) return;
        setItems(Array.isArray(myItems) ? myItems : []);
        setLoans(Array.isArray(activeLoans) ? activeLoans : []);
        setIncoming(Array.isArray(incomingRequests) ? incomingRequests : []);
      })
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

  const lentLoans = useMemo(
    () => loans.filter((loan) => loan.lenderId?._id === userId),
    [loans, userId],
  );
  const borrowedLoans = useMemo(
    () => loans.filter((loan) => loan.lenderId?._id !== userId),
    [loans, userId],
  );

  const recentLent = useMemo(() => lentLoans.slice(0, 4), [lentLoans]);
  const recentBorrowed = useMemo(() => borrowedLoans.slice(0, 3), [borrowedLoans]);
  const attentionRequests = useMemo(() => incoming.slice(0, 3), [incoming]);
  const shelfItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 4),
    [items],
  );

  const overdueCount = useMemo(() => loans.filter(isOverdue).length, [loans]);
  // "Due this week" is the next seven days and deliberately excludes anything already
  // past its deadline, so the overdue strip below never double-counts a loan.
  const dueThisWeek = useMemo(
    () =>
      loans.filter(
        (loan) =>
          !isOverdue(loan) && new Date(loan.dueDate).getTime() - Date.now() <= 7 * DAY_MS,
      ).length,
    [loans],
  );

  // Mirrors the same usability test LoanCard makes per row, rolled up: a schedule only
  // counts as running when it is on, not manual, and has at least one consented channel.
  const reminderSummary = useMemo(() => {
    const scheduled = lentLoans.filter(
      (loan) =>
        loan.reminders?.enabled &&
        loan.reminders?.frequency !== 'manual' &&
        loan.deliveryChannels?.length > 0,
    ).length;
    const blocked = lentLoans.filter(
      (loan) =>
        loan.reminders?.enabled &&
        loan.reminders?.frequency !== 'manual' &&
        !(loan.deliveryChannels?.length > 0),
    ).length;
    const manual = lentLoans.filter(
      (loan) => loan.reminders?.enabled && loan.reminders?.frequency === 'manual',
    ).length;
    const off = lentLoans.filter((loan) => !loan.reminders?.enabled).length;
    return { scheduled, blocked, manual, off };
  }, [lentLoans]);

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

  function handleReturned(returned) {
    const loan = pendingReturn;
    if (!returned || !loan) return;
    const itemId = returned.itemId?._id ?? returned.itemId ?? loan.itemId?._id;

    setLoans((current) => current.filter((entry) => entry._id !== returned._id));
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
            Everything you've lent. Every return. All in one place.
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
          <section>
            <div className="panel grid grid-cols-1 divide-y divide-line-soft sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <Metric
                value={loans.length}
                label="Active loans"
                caption="Out on loan, both directions"
              />
              <Metric
                value={dueThisWeek}
                label="Due this week"
                tone={dueThisWeek > 0 ? 'pending' : 'ink'}
                caption="Deadlines in the next seven days"
              />
            </div>

            {overdueCount > 0 && (
              <Link
                to="/loans"
                className="mt-3 flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm text-danger transition-colors hover:border-danger/50"
              >
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-semibold">
                  {overdueCount === 1 ? '1 loan is past its deadline' : `${overdueCount} loans are past their deadline`}
                </span>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
            )}
          </section>

          {/* The rail only earns its column on wide screens; below lg it stacks under the
              feed so a phone never scrolls past two panels to reach the loans. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
            <div className="min-w-0 space-y-10">
              <section className="space-y-4">
                <SectionHeader
                  title="Needs your attention"
                  hint={
                    incoming.length === 0
                      ? 'Nothing is waiting on a decision from you.'
                      : `${incoming.length} pending ${incoming.length === 1 ? 'request' : 'requests'} to borrow your items.`
                  }
                  to="/requests"
                />

                {attentionRequests.length > 0 ? (
                  <div className="space-y-3">
                    {attentionRequests.map((request) => (
                      <RequestCard
                        key={request._id}
                        request={request}
                        direction="incoming"
                        busy={busyId === request._id}
                        onApprove={() => handleApprove(request)}
                        onReject={() => handleReject(request)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="inset-panel flex items-center gap-2.5 px-4 py-3 text-sm text-muted">
                    <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    All caught up — new requests to borrow your items land here.
                  </p>
                )}
              </section>

              <section className="space-y-4">
                <SectionHeader
                  title="Currently lent"
                  hint="Items out with other people, and the deadline each one carries."
                  to="/loans"
                />

                {recentLent.length > 0 ? (
                  <div className="space-y-3">
                    {recentLent.map((loan) => (
                      <LoanCard
                        key={loan._id}
                        loan={loan}
                        role="lent"
                        busy={busyId === loan._id}
                        onReturn={() => setPendingReturn(loan)}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Inbox}
                    title="Nothing lent out"
                    description="Record something you have handed over and LendLoop tracks the deadline and chases the return for you."
                    action={
                      <Button onClick={() => navigate(CREATE_ENTRY_TO)}>
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Create lending entry
                      </Button>
                    }
                  />
                )}
              </section>

              {recentBorrowed.length > 0 && (
                <section className="space-y-4">
                  <SectionHeader
                    title="You're borrowing"
                    hint="Things you have out from other people."
                    to="/loans"
                  />
                  <div className="space-y-3">
                    {recentBorrowed.map((loan) => (
                      <LoanCard key={loan._id} loan={loan} role="borrowed" />
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
              </section>

              <section className="panel p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-ink">Automatic reminders</h2>
                  <Link to="/reminders" className={RAIL_LINK}>
                    Manage
                  </Link>
                </div>

                {lentLoans.length === 0 ? (
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Nothing is out on loan, so no reminders are scheduled.
                  </p>
                ) : (
                  <>
                    <dl className="mt-3 space-y-2">
                      <RailStat label="Running" value={reminderSummary.scheduled} />
                      <RailStat label="Manual only" value={reminderSummary.manual} />
                      <RailStat label="Switched off" value={reminderSummary.off} />
                    </dl>

                    {reminderSummary.blocked > 0 && (
                      <p className="mt-3 rounded-lg border border-pending/30 bg-pending-soft px-3 py-2 text-xs leading-relaxed text-pending">
                        {reminderSummary.blocked === 1
                          ? '1 loan has no usable channel — the borrower has not consented, or a contact detail is missing. Nothing will be sent.'
                          : `${reminderSummary.blocked} loans have no usable channel — the borrower has not consented, or a contact detail is missing. Nothing will be sent.`}
                      </p>
                    )}
                  </>
                )}
              </section>
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
