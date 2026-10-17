import { ArrowUpRight, Inbox, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

  const [direction, setDirection] = useState('incoming');
  const [status, setStatus] = useState('');

  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    const filter = status || undefined;

    // Both directions load together so each tab can carry its own count badge.
    Promise.all([requestService.incoming(filter), requestService.outgoing(filter)])
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
  }, [direction, status, reloadKey]);

  // A record patched away from the active filter has to drop off the list immediately.
  const visible = useMemo(() => {
    const source = direction === 'incoming' ? incoming : outgoing;
    return status ? source.filter((entry) => entry.status === status) : source;
  }, [direction, status, incoming, outgoing]);

  function patch(entry) {
    const setter = direction === 'incoming' ? setIncoming : setOutgoing;
    setter((current) =>
      current.map((item) => (item._id === entry._id ? { ...item, ...entry } : item)),
    );
  }

  async function handleApprove(request) {
    const itemId = request.itemId?._id;
    setBusyId(request._id);

    try {
      const result = await requestService.approve(request._id);
      const approved = result?.request ?? { ...request, status: 'approved' };

      // Approving is transactional server-side: every other pending request on the same
      // item is auto-rejected, so mirror that locally instead of paying for a refetch.
      setIncoming((current) =>
        current.map((entry) => {
          if (entry._id === approved._id) return { ...entry, ...approved };
          if (itemId && entry.status === 'pending' && entry.itemId?._id === itemId) {
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

  function renderEmptyState() {
    if (status) {
      return (
        <EmptyState
          icon={Inbox}
          title={`No ${status} requests here`}
          description={
            direction === 'incoming'
              ? 'Nothing on your listings is in this state right now. Switch the filter to see the rest.'
              : 'None of the requests you sent are in this state right now. Switch the filter to see the rest.'
          }
          action={
            <Button variant="secondary" onClick={() => setStatus('')}>
              Show all requests
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
            onClick={() => setDirection('incoming')}
            icon={Inbox}
            label="Incoming"
            count={loading ? undefined : incoming.length}
          />
          <TabButton
            active={direction === 'outgoing'}
            onClick={() => setDirection('outgoing')}
            icon={Send}
            label="Outgoing"
            count={loading ? undefined : outgoing.length}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {REQUEST_STATUSES.map((entry) => (
            <FilterPill
              key={entry.value || 'all'}
              active={status === entry.value}
              onClick={() => setStatus(entry.value)}
            >
              {entry.label}
            </FilterPill>
          ))}
        </div>
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
