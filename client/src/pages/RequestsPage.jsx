import { ArrowUpRight, Inbox, RefreshCw, Search, Send, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import RequestCard from '../components/requests/RequestCard.jsx';
import { getApiMessage } from '../services/api.js';
import { requestService } from '../services/requestService.js';
import { cn } from '../utils/cn.js';

const REQUEST_STATUSES = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'returnDate', label: 'Requested return date' },
];

function counterpartyOf(request, direction) {
  return direction === 'incoming' ? request.borrowerId : request.ownerId;
}

function matchesTerm(request, direction, term) {
  const haystack = [
    request.itemId?.title,
    counterpartyOf(request, direction)?.name,
    request.itemId?.categoryId?.name,
    request.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

function timeValue(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// ItemFilters keeps its Chip private, so the pills are rebuilt here with the same visual language.
function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border border-primary bg-primary text-primary-ink hover:bg-primary-hover'
          : 'border border-line bg-raised text-muted hover:border-faint hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
        active ? 'bg-primary text-primary-ink' : 'text-muted hover:bg-raised hover:text-ink',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
      {typeof count === 'number' && (
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-xs font-bold',
            // The inactive tab hovers to the same raised fill the badge uses, so the badge
            // needs its own ring to stay delineated.
            active
              ? 'bg-primary-ink/15 text-primary-ink'
              : 'bg-raised text-muted ring-1 ring-inset ring-line',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function RequestsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const direction = searchParams.get('direction') === 'outgoing' ? 'outgoing' : 'incoming';
  const rawStatus = searchParams.get('status') ?? '';
  const status = REQUEST_STATUSES.some((entry) => entry.value === rawStatus) ? rawStatus : '';
  const itemId = searchParams.get('itemId') ?? '';
  const q = searchParams.get('q') ?? '';
  const rawSort = searchParams.get('sort') ?? '';
  const sort = SORT_OPTIONS.some((entry) => entry.value === rawSort) ? rawSort : 'newest';

  const [term, setTerm] = useState(q);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState('');

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

  // Search is applied to the loaded page of requests: both directions are already fetched
  // for the tab counts, and a personal inbox stays well inside the 250-row response cap.
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

    setLoading(true);
    setError('');

    const params = { status: status || undefined, itemId: itemId || undefined };

    // Both directions load together so each tab can carry its own count badge.
    Promise.all([requestService.incoming(params), requestService.outgoing(params)])
      .then(([incomingResult, outgoingResult]) => {
        if (ignore) return;
        setIncoming(Array.isArray(incomingResult) ? incomingResult : []);
        setOutgoing(Array.isArray(outgoingResult) ? outgoingResult : []);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your requests'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [status, itemId, reloadKey]);

  // A record patched away from the active filter has to drop off the list immediately.
  // Sorting also happens here so it applies to the already-filtered set without a refetch.
  const visible = (direction === 'incoming' ? incoming : outgoing)
    .filter((entry) => (q ? matchesTerm(entry, direction, q) : true))
    .sort((a, b) => {
      if (sort === 'oldest') return timeValue(a.createdAt) - timeValue(b.createdAt);
      if (sort === 'returnDate') {
        return timeValue(a.requestedReturnDate) - timeValue(b.requestedReturnDate);
      }
      return timeValue(b.createdAt) - timeValue(a.createdAt);
    });

  const hasFilters = Boolean(status || itemId || q);

  const itemLabel =
    [...incoming, ...outgoing].find((entry) => entry.itemId?._id === itemId)?.itemId?.title ?? '';

  function patch(entry) {
    const setter = direction === 'incoming' ? setIncoming : setOutgoing;
    setter((current) =>
      current.map((item) => (item._id === entry._id ? { ...item, ...entry } : item)),
    );
  }

  async function handleApprove(request) {
    const requestItemId = request.itemId?._id;
    setBusyId(request._id);

    try {
      const result = await requestService.approve(request._id);
      const approved = result?.request ?? { ...request, status: 'approved' };

      // Approving is transactional server-side: every other pending request on the same
      // item is auto-rejected, so mirror that locally instead of paying for a refetch.
      setIncoming((current) =>
        current.map((entry) => {
          if (entry._id === approved._id) return { ...entry, ...approved };
          if (requestItemId && entry.status === 'pending' && entry.itemId?._id === requestItemId) {
            return { ...entry, status: 'rejected' };
          }
          return entry;
        }),
      );

      toast.success('Request approved — loan created');
    } catch (actionError) {
      // Usually a race: the item was already lent or the request was already settled.
      toast.error(getApiMessage(actionError, 'Could not approve that request'));
      setReloadKey((key) => key + 1);
    } finally {
      setBusyId('');
    }
  }

  async function handleReject(request) {
    setBusyId(request._id);

    try {
      const rejected = await requestService.reject(request._id);
      patch(rejected ?? { ...request, status: 'rejected' });
      toast.success('Request rejected');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not reject that request'));
      setReloadKey((key) => key + 1);
    } finally {
      setBusyId('');
    }
  }

  async function handleCancel(request) {
    setBusyId(request._id);

    try {
      const cancelled = await requestService.cancel(request._id);
      patch(cancelled ?? { ...request, status: 'cancelled' });
      toast.success('Request cancelled');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not cancel that request'));
      setReloadKey((key) => key + 1);
    } finally {
      setBusyId('');
    }
  }

  function clearFilters() {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams();
        if (current.get('direction') === 'outgoing') next.set('direction', 'outgoing');
        return next;
      },
      { replace: true },
    );
    setTerm('');
  }

  function renderEmptyState() {
    if (hasFilters) {
      return (
        <EmptyState
          icon={Search}
          title="No requests match these filters"
          description="Try another status or search term. Clearing the filters returns to everything in this direction."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear all filters
            </Button>
          }
        />
      );
    }

    if (direction === 'incoming') {
      return (
        <EmptyState
          icon={Inbox}
          title="No requests on your items"
          description="When someone asks to borrow one of your listings, their request lands here waiting for you to approve or reject it."
          action={
            <Button variant="secondary" onClick={() => navigate('/my-items')}>
              Go to my items
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={Send}
        title="You have not requested anything yet"
        description="Requests you send to borrow other people's items collect here with their status, so you always know who is still deciding."
        action={
          <Button variant="secondary" onClick={() => navigate('/items')}>
            Find something to borrow
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Requests</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Borrowing requests
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Everything coming in on the items you lend, and everything going out on the items you want
          to borrow. Approving a request opens the loan immediately.
        </p>
      </header>

      <div className="space-y-4">
        <div className="panel flex flex-col gap-2 p-1.5 sm:flex-row">
          <TabButton
            active={direction === 'incoming'}
            onClick={() => updateParams({ direction: '' })}
            icon={Inbox}
            label="Incoming"
            count={loading ? undefined : incoming.length}
          />
          <TabButton
            active={direction === 'outgoing'}
            onClick={() => updateParams({ direction: 'outgoing' })}
            icon={Send}
            label="Outgoing"
            count={loading ? undefined : outgoing.length}
          />
        </div>

        <section className="panel space-y-3 p-3 sm:p-4" aria-label="Request filters">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">Search requests</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search item, person or message"
                className="h-10 w-full rounded-lg border border-line bg-raised pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                value={sort}
                onChange={(event) =>
                  updateParams({ sort: event.target.value === 'newest' ? '' : event.target.value })
                }
                className="h-10 rounded-lg border border-line bg-raised px-3 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {REQUEST_STATUSES.map((entry) => (
              <FilterPill
                key={entry.value || 'all'}
                active={status === entry.value}
                onClick={() => updateParams({ status: entry.value })}
              >
                {entry.label}
              </FilterPill>
            ))}

            {(itemId || q) && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>

          {itemId && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
              <span className="text-xs text-muted">Filtered to</span>
              <Link
                to={`/items/${itemId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:text-primary"
              >
                {itemLabel || 'One listing'}
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => updateParams({ itemId: '' })}
                className="text-xs font-medium text-muted hover:text-ink"
              >
                Show all items
              </button>
            </div>
          )}
        </section>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" label="Loading your requests" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load your requests</h2>
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
      ) : visible.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="space-y-4">
          <p className="px-1 text-xs text-muted">
            {visible.length} {visible.length === 1 ? 'request' : 'requests'}
            {hasFilters ? ' matching these filters' : ''}
          </p>
          {visible.map((request) => (
            <RequestCard
              key={request._id}
              request={request}
              direction={direction}
              busy={busyId === request._id}
              onApprove={direction === 'incoming' ? () => handleApprove(request) : undefined}
              onReject={direction === 'incoming' ? () => handleReject(request) : undefined}
              onCancel={direction === 'outgoing' ? () => handleCancel(request) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
