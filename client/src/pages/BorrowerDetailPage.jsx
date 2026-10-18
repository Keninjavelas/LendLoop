import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Clock,
  Mail,
  Phone,
  RefreshCw,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { getApiMessage } from '../services/api.js';
import { borrowerService } from '../services/borrowerService.js';
import { dueLabel, dueTone, formatDate, isOverdue } from '../utils/formatDate.js';

const BACK_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink';

const DUE_TONES = {
  danger: 'text-danger',
  pending: 'text-pending',
  ink: 'text-ink',
  muted: 'text-muted',
};

function reliabilityCopy(borrower) {
  if (!borrower.completedLoans) {
    return 'No completed loans yet, so there is no return pattern to describe.';
  }

  const known = borrower.onTimeReturns + borrower.lateReturns;
  if (!known) {
    return `${borrower.completedLoans} completed ${
      borrower.completedLoans === 1 ? 'loan has' : 'loans have'
    } no recorded return date, so on-time behaviour cannot be described.`;
  }

  const parts = [
    `${known} completed ${known === 1 ? 'loan has' : 'loans have'} a recorded return date.`,
    `${borrower.onTimeReturns} came back by the deadline and ${borrower.lateReturns} came back late.`,
  ];
  if (borrower.unknownReturnTiming > 0) {
    parts.push(
      `${borrower.unknownReturnTiming} older ${
        borrower.unknownReturnTiming === 1 ? 'return has' : 'returns have'
      } no timestamp and are excluded rather than guessed.`,
    );
  }
  return parts.join(' ');
}

export default function BorrowerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    setNotFound(false);

    borrowerService
      .get(id)
      .then((result) => {
        if (!ignore) setData(result ?? null);
      })
      .catch((fetchError) => {
        if (ignore) return;
        if (fetchError?.response?.status === 404) setNotFound(true);
        else setError(getApiMessage(fetchError, 'Could not load this borrower'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id, reloadKey]);

  if (loading) {
    return <LoadingSpinner size="lg" label="Loading borrower" className="py-24" />;
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <Link to="/borrowers" className={BACK_LINK_CLASS}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to borrowers
        </Link>
        <EmptyState
          icon={UserRound}
          title="No lending history with this borrower"
          description="This account exists, but you have never lent to them, so there is no relationship to show."
          action={
            <Button variant="secondary" onClick={() => navigate('/borrowers')}>
              Back to borrowers
            </Button>
          }
        />
      </div>
    );
  }

  if (error || !data?.borrower) {
    return (
      <div className="space-y-6">
        <Link to="/borrowers" className={BACK_LINK_CLASS}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to borrowers
        </Link>
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load this borrower</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            {error || 'That borrower could not be found.'}
          </p>
          <Button variant="secondary" className="mt-6" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { borrower, loans, truncated } = data;
  const activeLoans = loans.filter((loan) => loan.status === 'active');
  const completedLoans = loans.filter((loan) => loan.status === 'returned');
  const knownReturns = borrower.onTimeReturns + borrower.lateReturns;

  return (
    <div className="space-y-6">
      <Link to="/borrowers" className={BACK_LINK_CLASS}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to borrowers
      </Link>

      <header className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <UserRound className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="eyebrow">Account-linked borrower</p>
              <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                {borrower.name}
              </h1>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {borrower.email && (
                  <a
                    href={`mailto:${borrower.email}`}
                    className="inline-flex items-center gap-1.5 hover:text-ink"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    {borrower.email}
                  </a>
                )}
                {borrower.phone && (
                  <a
                    href={`tel:${borrower.phone}`}
                    className="inline-flex items-center gap-1.5 hover:text-ink"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {borrower.phone}
                  </a>
                )}
                {!borrower.email && !borrower.phone && (
                  <span>No contact details on their account</span>
                )}
              </div>
            </div>
          </div>

          <Link
            to={`/loans/new?borrowerId=${borrower.borrowerId}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-ink transition-colors hover:bg-primary-hover"
          >
            Lend to {borrower.name.split(' ')[0]} again
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-4">
          <div className="rounded-lg bg-raised px-3 py-3">
            <dt className="eyebrow">Total loans</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-ink">{borrower.totalLoans}</dd>
          </div>
          <div className="rounded-lg bg-raised px-3 py-3">
            <dt className="eyebrow">Out now</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-ink">{borrower.activeLoans}</dd>
          </div>
          <div className="rounded-lg bg-raised px-3 py-3">
            <dt className="eyebrow">Completed</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-ink">
              {borrower.completedLoans}
            </dd>
          </div>
          <div className="rounded-lg bg-raised px-3 py-3">
            <dt className="eyebrow">Overdue now</dt>
            <dd
              className={
                borrower.overdueLoans > 0
                  ? 'mt-1 text-xl font-bold tabular-nums text-danger'
                  : 'mt-1 text-xl font-bold tabular-nums text-ink'
              }
            >
              {borrower.overdueLoans}
            </dd>
          </div>
        </dl>

        <div className="mt-4 rounded-lg border border-line bg-canvas px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Return pattern</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{reliabilityCopy(borrower)}</p>
          {borrower.overdueLoans > 0 && (
            <p className="mt-1.5 text-xs leading-relaxed text-danger">
              {borrower.overdueLoans} {borrower.overdueLoans === 1 ? 'loan is' : 'loans are'} past
              the deadline right now. That is counted separately from returns that came back late.
            </p>
          )}
          {knownReturns > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              Based on {knownReturns} completed {knownReturns === 1 ? 'return' : 'returns'} with a
              recorded timestamp.
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5 sm:p-6" aria-labelledby="borrower-active-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="borrower-active-heading" className="text-base font-bold text-ink">
              Out on loan
            </h2>
            <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-muted ring-1 ring-inset ring-line">
              {activeLoans.length}
            </span>
          </div>

          {activeLoans.length ? (
            <ul className="mt-3 divide-y divide-line">
              {activeLoans.map((loan) => {
                const overdue = isOverdue(loan);
                return (
                  <li key={loan._id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/loans/${loan._id}`}
                          className="line-clamp-1 font-semibold text-ink hover:text-primary"
                        >
                          {loan.itemName}
                        </Link>
                        <p
                          className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${
                            DUE_TONES[dueTone(loan)]
                          }`}
                        >
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {dueLabel(loan)} · due {formatDate(loan.dueDate)}
                        </p>
                      </div>
                      <StatusBadge status={overdue ? 'overdue' : 'active'} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Nothing is out with {borrower.name.split(' ')[0]} right now.
            </p>
          )}
        </section>

        <section className="panel p-5 sm:p-6" aria-labelledby="borrower-reported-heading">
          <h2 id="borrower-reported-heading" className="text-base font-bold text-ink">
            At a glance
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">First lent</span>
              <span className="font-semibold text-ink">{formatDate(borrower.firstLentAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Last lent</span>
              <span className="font-semibold text-ink">{formatDate(borrower.lastLentAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Next due back</span>
              <span className="font-semibold text-ink">{formatDate(borrower.nextDueAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Returned on time</span>
              <span className="font-semibold text-ink">{borrower.onTimeReturns}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Returned late</span>
              <span className="font-semibold text-ink">{borrower.lateReturns}</span>
            </div>
            {borrower.unknownReturnTiming > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">No return timestamp</span>
                <span className="font-semibold text-ink">{borrower.unknownReturnTiming}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel p-5 sm:p-6" aria-labelledby="borrower-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="borrower-history-heading" className="text-base font-bold text-ink">
            Lending history
          </h2>
          <p className="text-xs text-muted">
            {completedLoans.length} returned · newest first
          </p>
        </div>

        {loans.length ? (
          <ul className="mt-3 divide-y divide-line">
            {loans.map((loan) => (
              <li key={loan._id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      to={`/loans/${loan._id}`}
                      className="font-semibold text-ink hover:text-primary"
                    >
                      {loan.itemName}
                    </Link>
                    {loan.returnedLate && (
                      <span className="rounded bg-pending-soft px-1.5 py-0.5 text-xs font-semibold text-pending">
                        Returned late
                      </span>
                    )}
                    {loan.status === 'active' && isOverdue(loan) && (
                      <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger">
                        Overdue now
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {formatDate(loan.lentAt)} → {formatDate(loan.dueDate)}
                    {loan.returnedAt && ` · returned ${formatDate(loan.returnedAt)}`}
                    {loan.categoryId?.name && ` · ${loan.categoryId.name}`}
                  </p>
                  {loan.returnNote && (
                    <p className="mt-1 line-clamp-2 text-xs italic leading-relaxed text-muted">
                      “{loan.returnNote}”
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge
                    status={loan.status === 'active' && isOverdue(loan) ? 'overdue' : loan.status}
                  />
                  <Link
                    to={`/loans/${loan._id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    View loan
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">No lending history to show.</p>
        )}

        {truncated && (
          <p className="mt-4 text-xs text-muted">
            Showing the most recent 250 entries for this borrower.
          </p>
        )}
      </section>
    </div>
  );
}
