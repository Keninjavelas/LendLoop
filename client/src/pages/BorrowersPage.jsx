import {
  ArrowRight,
  CalendarClock,
  Inbox,
  RefreshCw,
  Search,
  TriangleAlert,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { getApiMessage } from '../services/api.js';
import { borrowerService } from '../services/borrowerService.js';
import { formatDate, isOverdue, timeAgo } from '../utils/formatDate.js';
import Button from '../components/common/Button.jsx';

const EMPTY_COUNTS = { linked: 0, manual: 0, activeLoans: 0, overdueLoans: 0 };

function contactLine(entry) {
  return [entry.email, entry.phone].filter(Boolean).join(' · ');
}

function LinkedBorrowerCard({ borrower }) {
  return (
    <Link
      to={`/borrowers/${borrower.borrowerId}`}
      className="panel group flex flex-col p-4 transition-colors hover:border-faint sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink group-hover:text-primary">{borrower.name}</p>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">
            {contactLine(borrower) || 'No contact details on their account'}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
        {borrower.activeLoans > 0 && (
          <span className="rounded-md bg-primary-soft px-2 py-0.5 font-semibold text-primary ring-1 ring-inset ring-primary/25">
            {borrower.activeLoans} out now
          </span>
        )}
        {borrower.overdueLoans > 0 && (
          <span className="rounded-md bg-danger-soft px-2 py-0.5 font-semibold text-danger ring-1 ring-inset ring-danger/25">
            {borrower.overdueLoans} overdue
          </span>
        )}
        {borrower.returnedLoans > 0 && (
          <span className="rounded-md bg-raised px-2 py-0.5 font-medium text-muted ring-1 ring-inset ring-line">
            {borrower.returnedLoans} returned
          </span>
        )}
        <span className="rounded-md bg-raised px-2 py-0.5 font-medium text-muted ring-1 ring-inset ring-line">
          {borrower.totalLoans} {borrower.totalLoans === 1 ? 'loan' : 'loans'}
        </span>
      </div>

      <div className="mt-4 space-y-1 text-xs text-muted">
        {borrower.nextDueAt ? (
          <p className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Next due {formatDate(borrower.nextDueAt)}
          </p>
        ) : (
          <p className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Nothing due back right now
          </p>
        )}
        <p>Last lent {borrower.lastLentAt ? timeAgo(borrower.lastLentAt) : '—'}</p>
      </div>

      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
        View history and lend again
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function ManualEntryRow({ entry }) {
  const loanState = { status: entry.status, dueDate: entry.dueDate, returnedAt: entry.returnedAt };
  const overdue = entry.status === 'active' && isOverdue(loanState);

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold text-ink">{entry.name}</span>
          <span className="text-muted">borrowed</span>
          <span className="font-medium text-ink">{entry.itemName}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {entry.email || entry.phone || 'No contact details recorded'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {formatDate(entry.lentAt)} → {formatDate(entry.dueDate)}
          {entry.status === 'returned' && ` · returned ${formatDate(entry.returnedAt)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {overdue ? (
          <StatusBadge status="overdue" label="Overdue" />
        ) : (
          <StatusBadge status={entry.status} />
        )}
        <Link
          to={`/loans/${entry.loanId}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          View loan
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

export default function BorrowersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [term, setTerm] = useState(q);

  const [linked, setLinked] = useState([]);
  const [manual, setManual] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setTerm(q);
  }, [q]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const trimmed = term.trim();
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    if (next.toString() === searchParams.toString()) return undefined;
    const handle = setTimeout(() => setSearchParams(next, { replace: true }), 250);
    return () => clearTimeout(handle);
  }, [term, searchParams, setSearchParams]);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');

    borrowerService
      .list({ q })
      .then((result) => {
        if (ignore) return;
        setLinked(Array.isArray(result?.borrowers) ? result.borrowers : []);
        setManual(Array.isArray(result?.manualEntries) ? result.manualEntries : []);
        setCounts({ ...EMPTY_COUNTS, ...(result?.counts ?? {}) });
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your borrowers'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [q, reloadKey]);

  const linkedActive = linked.reduce((total, entry) => total + entry.activeLoans, 0);
  const linkedOverdue = linked.reduce((total, entry) => total + entry.overdueLoans, 0);

  let body = null;

  if (loading) {
    body = <LoadingSpinner size="lg" label="Loading borrowers" />;
  } else if (error) {
    body = (
      <div role="alert" className="panel px-6 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-ink">Could not load your borrowers</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{error}</p>
        <Button variant="secondary" className="mt-6" onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  } else if (!linked.length && !manual.length) {
    body = q ? (
      <EmptyState
        icon={Search}
        title="No borrowers match that search"
        description={`Nothing in your lending history matches “${q}”.`}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setTerm('');
              setSearchParams(new URLSearchParams(), { replace: true });
            }}
          >
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={Users}
        title="No borrowers yet"
        description="Borrowers appear here after your first lending entry. People with a LendLoop account are grouped so you can see their full history and lend to them again."
        action={
          <Link
            to="/loans/new"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
          >
            Record a lending entry
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="space-y-8">
        {linked.length > 0 && (
          <section aria-labelledby="linked-borrowers-heading">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="linked-borrowers-heading" className="text-base font-bold text-ink">
                  Account-linked borrowers
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {linkedActive} active {linkedActive === 1 ? 'loan' : 'loans'} · {linkedOverdue}{' '}
                  overdue across these relationships
                </p>
              </div>
              <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-muted ring-1 ring-inset ring-line">
                {linked.length}
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {linked.map((borrower) => (
                <LinkedBorrowerCard key={borrower.key} borrower={borrower} />
              ))}
            </div>
          </section>
        )}

        {manual.length > 0 && (
          <section aria-labelledby="manual-borrowers-heading" className="panel p-4 sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="manual-borrowers-heading" className="text-base font-bold text-ink">
                  Manual entries
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Borrowers without a linked account. Each entry stays separate, even when names or
                  contact details look alike, because identity was never verified.
                </p>
              </div>
              <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-muted ring-1 ring-inset ring-line">
                {manual.length}
              </span>
            </div>

            <ul className="mt-2 divide-y divide-line">
              {manual.map((entry) => (
                <ManualEntryRow key={entry.key} entry={entry} />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Relationships</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Borrowers</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Everyone you have lent to, with their history. Only you can see these relationships.
          </p>
        </div>
        <Link
          to="/loans/new"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
        >
          Record a lending entry
        </Link>
      </header>

      <section className="panel p-3 sm:p-4" aria-label="Borrower search">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="relative block flex-1 sm:max-w-sm">
            <span className="sr-only">Search borrowers</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search name, email or phone"
              className="h-10 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
              {counts.linked} linked
            </span>
            <span className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              {counts.manual} manual
            </span>
            {counts.overdueLoans > 0 && (
              <span className="flex items-center gap-1.5 font-semibold text-danger">
                {counts.overdueLoans} overdue
              </span>
            )}
          </div>
        </div>
      </section>

      {body}
    </div>
  );
}
