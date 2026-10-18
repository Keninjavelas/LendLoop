import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarClock,
  Clock,
  History,
  Inbox,
  Info,
  Lock,
  Package,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  TriangleAlert,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { FIELD_CLASS, LABEL_CLASS, fieldClass } from '../components/common/Field.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import { CategoryIcon } from '../components/items/ItemCard.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { getApiMessage } from '../services/api.js';
import { itemService } from '../services/itemService.js';
import { requestService } from '../services/requestService.js';
import { cn } from '../utils/cn.js';
import { dueLabel, dueTone, formatDate, timeAgo, tomorrowInputDate } from '../utils/formatDate.js';

const BACK_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink';

const PILL_CLASS =
  'inline-flex items-center rounded-md bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-line';

const DUE_TONES = {
  danger: 'text-danger',
  pending: 'text-pending',
  ink: 'text-ink',
  muted: 'text-muted',
};

export default function ItemDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, initializing } = useAuth();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);

  // The viewer's own pending request on this listing, if there is one.
  const [pendingRequest, setPendingRequest] = useState(null);
  const [requestsLoaded, setRequestsLoaded] = useState(false);

  const [returnDate, setReturnDate] = useState('');
  const [message, setMessage] = useState('');
  const [dateError, setDateError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [ownerBusy, setOwnerBusy] = useState(false);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');
    setNotFound(false);
    setImageFailed(false);
    setReturnDate('');
    setMessage('');
    setDateError('');

    itemService
      .get(id)
      .then((result) => {
        if (ignore) return;
        setItem(result ?? null);
      })
      .catch((fetchError) => {
        if (ignore) return;
        if (fetchError?.response?.status === 404) {
          setNotFound(true);
        } else {
          setError(getApiMessage(fetchError, 'Could not load that listing'));
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [id, reloadKey]);

  // Public route: only signed-in visitors can have a pending request, so the call is skipped otherwise.
  useEffect(() => {
    if (!isAuthenticated) {
      setPendingRequest(null);
      setRequestsLoaded(true);
      return undefined;
    }

    let ignore = false;
    setRequestsLoaded(false);

    requestService
      .outgoing('pending')
      .then((requests) => {
        if (ignore) return;
        const list = Array.isArray(requests) ? requests : [];
        setPendingRequest(list.find((entry) => entry.itemId?._id === id) ?? null);
      })
      .catch(() => {
        // A failed lookup must not block browsing, the borrow form still works.
        if (!ignore) setPendingRequest(null);
      })
      .finally(() => {
        if (!ignore) setRequestsLoaded(true);
      });

    return () => {
      ignore = true;
    };
  }, [id, isAuthenticated, initializing]);

  const isOwner = Boolean(user?._id) && item?.ownerId?._id === user._id;

  async function handleSubmit(event) {
    event.preventDefault();

    if (!returnDate) {
      setDateError('Choose the date you can return it');
      return;
    }

    // `YYYY-MM-DD` + a local midday keeps the timezone from shifting the date a day back.
    const parsed = new Date(`${returnDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      setDateError('Choose a valid return date');
      return;
    }
    if (parsed.getTime() <= Date.now()) {
      setDateError('The return date must be in the future');
      return;
    }

    setDateError('');
    setSubmitting(true);

    try {
      const created = await requestService.create({
        itemId: id,
        requestedReturnDate: parsed.toISOString(),
        message: message.trim(),
      });
      setPendingRequest(created);
      setReturnDate('');
      setMessage('');
      toast.success('Request sent');
    } catch (submitError) {
      // Surfaces the real business rule, e.g. "You already have a pending request for this item".
      toast.error(getApiMessage(submitError, 'Could not send that request'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelRequest() {
    if (!pendingRequest) return;

    setCancelling(true);
    try {
      await requestService.cancel(pendingRequest._id);
      setPendingRequest(null);
      toast.success('Request cancelled');
    } catch (cancelError) {
      toast.error(getApiMessage(cancelError, 'Could not cancel that request'));
    } finally {
      setCancelling(false);
    }
  }

  async function handleArchiveItem() {
    if (!item) return;
    setOwnerBusy(true);
    try {
      await itemService.archive(item._id);
      toast.success('Item archived — it is hidden from the shelf');
      navigate('/my-items?view=archived');
    } catch (archiveError) {
      toast.error(getApiMessage(archiveError, 'Could not archive that item'));
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleRestoreItem() {
    if (!item) return;
    setOwnerBusy(true);
    try {
      await itemService.restore(item._id);
      toast.success('Item is back on the shelf');
      setReloadKey((key) => key + 1);
    } catch (restoreError) {
      toast.error(getApiMessage(restoreError, 'Could not restore that item'));
    } finally {
      setOwnerBusy(false);
    }
  }

  function renderActionPanel() {
    if (initializing || !requestsLoaded) {
      return (
        <div className="panel px-5">
          <LoadingSpinner size="sm" label="Checking your session" />
        </div>
      );
    }

    if (!isAuthenticated) {
      return (
        <div className="panel p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-bold text-ink">Want to borrow this?</h2>
          <p className="mt-1.5 text-sm text-muted">
            Borrowing needs a free LendLoop account so the owner knows who has their item and when it
            comes back.
          </p>
          <Button
            className="mt-5 w-full"
            onClick={() => navigate('/login', { state: { from: { pathname: `/items/${id}` } } })}
          >
            Log in to borrow
          </Button>
          <p className="mt-3 text-center text-xs text-muted">
            No account yet?{' '}
            <Link
              to="/register"
              state={{ from: { pathname: `/items/${id}` } }}
              className="font-semibold text-primary transition-colors hover:text-primary-hover"
            >
              Create one
            </Link>
          </p>
        </div>
      );
    }

    if (isOwner) {
      const context = item.ownerContext ?? {};
      const activeLoan = context.activeLoan;
      const pending = context.pendingRequests?.length ?? 0;

      return (
        <div className="panel p-5">
          <div className="flex items-start gap-3 rounded-lg bg-primary-soft px-3.5 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-ink">This is your listing</p>
              <p className="mt-0.5 text-sm text-muted">
                {activeLoan
                  ? `Currently with ${activeLoan.borrowerName}.`
                  : pending > 0
                    ? `${pending} ${pending === 1 ? 'person is' : 'people are'} waiting for your answer.`
                    : 'It is on your shelf and can be borrowed.'}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            {item.status !== 'archived' ? (
              <Link
                to={`/my-items?edit=${item._id}`}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-raised px-5 text-sm font-semibold text-ink transition-colors hover:border-faint hover:bg-line-soft"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit listing
              </Link>
            ) : (
              <Button variant="success" onClick={handleRestoreItem} loading={ownerBusy}>
                {!ownerBusy && <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                Restore listing
              </Button>
            )}

            {pending > 0 && (
              <Button variant="secondary" onClick={() => navigate(`/requests?status=pending&itemId=${item._id}`)}>
                <Inbox className="h-4 w-4" aria-hidden="true" />
                Review {pending} {pending === 1 ? 'request' : 'requests'}
              </Button>
            )}

            {item.status !== 'archived' && (
              <Button variant="ghost" onClick={handleArchiveItem} loading={ownerBusy}>
                {!ownerBusy && <Archive className="h-4 w-4" aria-hidden="true" />}
                Archive listing
              </Button>
            )}

            <Link
              to="/my-items"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              All my items
            </Link>
          </div>
        </div>
      );
    }

    if (item.status !== 'available') {
      return (
        <div className="panel p-5">
          <Button className="w-full" disabled>
            Currently borrowed
          </Button>
          <p className="mt-3 flex items-start gap-2 text-sm text-muted">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Someone has this right now. It goes back on the shelf as soon as the current loan is
            marked as returned — check back soon or browse something similar.
          </p>
          <Button variant="secondary" className="mt-5 w-full" onClick={() => navigate('/items')}>
            Keep browsing
          </Button>
        </div>
      );
    }

    if (pendingRequest) {
      return (
        <div className="panel p-5">
          <div className="flex items-start gap-3 rounded-lg bg-pending-soft px-3.5 py-3">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-pending" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-ink">Request pending</p>
              <p className="mt-0.5 text-sm text-muted">
                You asked to borrow this by{' '}
                <span className="font-semibold text-ink">
                  {formatDate(pendingRequest.requestedReturnDate)}
                </span>
                . The owner has not answered yet.
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted">
            You can withdraw it any time before the owner decides. Track it under Requests.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" className="flex-1" onClick={handleCancelRequest} loading={cancelling}>
              Cancel request
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => navigate('/requests')}>
              View requests
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="panel p-5">
        <h2 className="text-base font-bold text-ink">Request to borrow</h2>
        <p className="mt-1.5 text-sm text-muted">
          Pick a return date and add a note. The owner approves it before anything changes hands.
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label className={LABEL_CLASS} htmlFor="return-date">
              When can you return it?
            </label>
            <input
              id="return-date"
              type="date"
              value={returnDate}
              min={tomorrowInputDate()}
              required
              onChange={(event) => {
                setReturnDate(event.target.value);
                setDateError('');
              }}
              className={fieldClass(dateError)}
            />
            {dateError && (
              <p className="mt-1.5 text-xs font-medium text-danger">{dateError}</p>
            )}
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="borrow-message">
              Message to the owner <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id="borrow-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder="Hi! I need this for my exam next week and can bring it straight back."
              className={cn(FIELD_CLASS, 'resize-y')}
            />
            <p className="mt-1.5 text-xs text-muted">{message.length}/500</p>
          </div>

          <Button type="submit" className="w-full" loading={submitting}>
            {!submitting && <Send className="h-4 w-4" aria-hidden="true" />}
            Request to borrow
          </Button>
        </form>
      </div>
    );
  }

  if (loading) {
    return <LoadingSpinner size="lg" label="Loading listing" className="py-24" />;
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <Link to="/items" className={BACK_LINK_CLASS}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to explore
        </Link>
        <EmptyState
          icon={Package}
          title="This listing is no longer available"
          description="It has either been removed by its owner or retired from the shared shelf. There is plenty else to browse."
          action={
            <Button variant="secondary" onClick={() => navigate('/items')}>
              Back to explore
            </Button>
          }
        />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-6">
        <Link to="/items" className={BACK_LINK_CLASS}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to explore
        </Link>
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load this listing</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
            {error || 'That listing could not be found.'}
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const showImage = Boolean(item.imageUrl) && !imageFailed;

  return (
    <div className="space-y-6">
      <Link to="/items" className={BACK_LINK_CLASS}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to explore
      </Link>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div>
          <div className="panel overflow-hidden">
            {showImage ? (
              <img
                src={item.imageUrl}
                alt={item.title}
                onError={() => setImageFailed(true)}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <span className="flex aspect-[4/3] w-full items-center justify-center bg-primary-soft text-primary">
                <CategoryIcon category={item.categoryId?.name} className="h-20 w-20" />
              </span>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel p-5 sm:p-6">
            <StatusBadge status={item.status} />

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {item.title}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={PILL_CLASS}>{item.categoryId?.name}</span>
              <span className={PILL_CLASS}>{item.condition} condition</span>
            </div>

            <dl className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <User className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="eyebrow">Lender</dt>
                  <dd className="truncate text-sm font-semibold text-ink">
                    {item.ownerId?.name ?? 'Unknown user'}
                  </dd>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <dt className="eyebrow">Listed</dt>
                  <dd className="truncate text-sm font-semibold text-ink">
                    {timeAgo(item.createdAt)} · {formatDate(item.createdAt)}
                  </dd>
                </div>
              </div>
            </dl>

            <div className="mt-6 border-t border-line pt-5">
              <h2 className="eyebrow">About this item</h2>
              <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink">
                {item.description}
              </p>
            </div>
          </div>

          <div className="lg:sticky lg:top-24">{renderActionPanel()}</div>
        </div>
      </div>

      {isOwner && item.ownerContext && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="panel p-5 sm:p-6" aria-labelledby="active-lending-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="active-lending-heading" className="text-base font-bold text-ink">
                Active lending
              </h2>
              <StatusBadge status={item.ownerContext.activeLoan ? 'active' : 'available'} />
            </div>

            {item.ownerContext.activeLoan ? (
              <div className="mt-4 space-y-3">
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <User className="h-4 w-4 shrink-0" aria-hidden="true" />
                  On loan to
                  {item.ownerContext.activeLoan.borrowerId ? (
                    <Link
                      to={`/borrowers/${item.ownerContext.activeLoan.borrowerId}`}
                      className="font-semibold text-ink hover:text-primary"
                    >
                      {item.ownerContext.activeLoan.borrowerName}
                    </Link>
                  ) : (
                    <span className="font-semibold text-ink">
                      {item.ownerContext.activeLoan.borrowerName}
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-semibold',
                    DUE_TONES[
                      dueTone({
                        status: 'active',
                        dueDate: item.ownerContext.activeLoan.dueDate,
                      })
                    ],
                  )}
                >
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {dueLabel({
                    status: 'active',
                    dueDate: item.ownerContext.activeLoan.dueDate,
                  })}{' '}
                  · due {formatDate(item.ownerContext.activeLoan.dueDate)}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <BellRing className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {item.ownerContext.activeLoan.nextReminderAt
                    ? `Next reminder ${formatDate(item.ownerContext.activeLoan.nextReminderAt)}`
                    : item.ownerContext.activeLoan.remindersEnabled
                      ? 'No further reminders scheduled'
                      : 'Automatic reminders are off'}
                </p>
                <Link
                  to={`/loans/${item.ownerContext.activeLoan._id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Open loan details
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <div className="mt-4">
                <p className="text-sm leading-relaxed text-muted">
                  This item is on your shelf. Archive it when you no longer want to lend it, or leave
                  it available for requests.
                </p>
                <Link
                  to="/loans/new"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Record a new lending entry
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>

          <section className="panel p-5 sm:p-6" aria-labelledby="pending-requests-heading">
            <div className="flex items-center justify-between gap-3">
              <h2 id="pending-requests-heading" className="text-base font-bold text-ink">
                Pending requests
              </h2>
              <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-muted ring-1 ring-inset ring-line">
                {item.ownerContext.pendingRequests.length}
              </span>
            </div>

            {item.ownerContext.pendingRequests.length ? (
              <div className="mt-4 space-y-3">
                {item.ownerContext.pendingRequests.slice(0, 4).map((request) => (
                  <div key={request._id} className="rounded-lg bg-raised px-3.5 py-3">
                    <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                      <span className="font-semibold text-ink">{request.borrowerName}</span>
                      <span className="text-muted">asked to return it by</span>
                      <span className="font-semibold text-ink">
                        {formatDate(request.requestedReturnDate)}
                      </span>
                    </p>
                    {request.message && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                        “{request.message}”
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">Requested {timeAgo(request.createdAt)}</p>
                  </div>
                ))}
                <Link
                  to={`/requests?status=pending&itemId=${item._id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  Review requests
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted">
                <Inbox className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Nobody has asked to borrow this item yet. New requests appear here and under
                Requests.
              </p>
            )}
          </section>

          <section className="panel p-5 sm:p-6 lg:col-span-2" aria-labelledby="item-history-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="item-history-heading" className="text-base font-bold text-ink">
                  Lending history
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {item.ownerContext.totalLoans} total{' '}
                  {item.ownerContext.totalLoans === 1 ? 'loan' : 'loans'} ·{' '}
                  {item.ownerContext.completedLoans} returned
                </p>
              </div>
              <History className="h-5 w-5 text-muted" aria-hidden="true" />
            </div>

            {item.ownerContext.recentLoans.length ? (
              <ul className="mt-4 divide-y divide-line">
                {item.ownerContext.recentLoans.map((loan) => (
                  <li key={loan._id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{loan.borrowerName}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDate(loan.lentAt)} → {formatDate(loan.returnedAt)}
                      </p>
                      {loan.returnNote && (
                        <p className="mt-1 line-clamp-2 text-xs italic leading-relaxed text-muted">
                          “{loan.returnNote}”
                        </p>
                      )}
                    </div>
                    <Link
                      to={`/loans/${loan._id}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      View loan
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                No completed loans yet. When this item comes back, the return details appear here.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
