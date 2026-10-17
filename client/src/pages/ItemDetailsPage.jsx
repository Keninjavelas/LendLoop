import {
  ArrowLeft,
  CalendarClock,
  Clock,
  Info,
  Lock,
  Package,
  RefreshCw,
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
import { formatDate, timeAgo, tomorrowInputDate } from '../utils/formatDate.js';

const BACK_LINK_CLASS =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink';

const PILL_CLASS =
  'inline-flex items-center rounded-md bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-line';

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
      return (
        <div className="panel p-5">
          <div className="flex items-start gap-3 rounded-lg bg-primary-soft px-3.5 py-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-ink">This is your listing</p>
              <p className="mt-0.5 text-sm text-muted">
                You cannot borrow your own item. Manage its details, or check who has asked for it,
                from your listings.
              </p>
            </div>
          </div>
          <Link
            to="/my-items"
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg border border-line bg-raised px-5 text-sm font-semibold text-ink transition-colors hover:border-faint hover:bg-line-soft"
          >
            Manage my items
          </Link>
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
    </div>
  );
}
