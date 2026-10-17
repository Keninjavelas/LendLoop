import { ArrowRight, Handshake, Package, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import ItemCard from '../components/items/ItemCard.jsx';
import ItemFilters from '../components/items/ItemFilters.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { getApiMessage } from '../services/api.js';
import { itemService } from '../services/itemService.js';
import { timeAgo } from '../utils/formatDate.js';

const EMPTY_DATA = { items: [], total: 0, categories: [] };

export default function ExplorePage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // The request waits for the debounced value, never for the raw keystrokes.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    itemService
      .list({
        q: debouncedSearch || undefined,
        categoryId: category || undefined,
        status: onlyAvailable ? 'available' : undefined,
      })
      .then((result) => {
        if (ignore) return;
        setData({
          items: Array.isArray(result?.items) ? result.items : [],
          total: result?.total ?? 0,
          categories: Array.isArray(result?.categories) ? result.categories : [],
        });
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load the shared shelf'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [debouncedSearch, category, onlyAvailable, reloadKey]);

  const hasFilters = Boolean(debouncedSearch) || Boolean(category) || onlyAvailable;

  function clearFilters() {
    setSearch('');
    setDebouncedSearch('');
    setCategory('');
    setOnlyAvailable(false);
  }

  function renderActions(item) {
    const isOwner = Boolean(user?._id) && item.ownerId?._id === user._id;
    const canBorrow = isAuthenticated && item.status === 'available' && !isOwner;

    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/items/${item._id}`)}>
          View details
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>

        {canBorrow && (
          <Button size="sm" onClick={() => navigate(`/items/${item._id}`)}>
            <Handshake className="h-4 w-4" aria-hidden="true" />
            Borrow
          </Button>
        )}

        {isOwner && (
          <span className="inline-flex items-center rounded-md bg-raised px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted ring-1 ring-inset ring-line">
            Your item
          </span>
        )}
      </>
    );
  }

  function renderFooter(item) {
    return <p className="text-xs text-muted">Listed {timeAgo(item.createdAt)}</p>;
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Explore</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Find something to borrow
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Browse everything your community has put on the shared shelf. Borrowing is free — you just
          send a request, agree a return date and hand it back on time.
        </p>
      </header>

      {error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load the shelf</h2>
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
          <ItemFilters
            search={search}
            onSearchChange={setSearch}
            category={category}
            onCategoryChange={setCategory}
            categories={data.categories}
            onlyAvailable={onlyAvailable}
            onOnlyAvailableChange={setOnlyAvailable}
            resultCount={loading ? undefined : data.total}
          />

          {loading ? (
            <LoadingSpinner size="lg" label="Loading listings" />
          ) : data.items.length === 0 ? (
            hasFilters ? (
              <EmptyState
                icon={Search}
                title="Nothing matched those filters"
                description="Try a different search term, widen the category, or switch off the availability filter to see the rest of the shelf."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Package}
                title="The shelf is empty"
                description="No one has listed anything yet. Be the first to put something up for your community to borrow."
                action={
                  isAuthenticated ? (
                    <Button onClick={() => navigate('/my-items')}>List an item</Button>
                  ) : (
                    <Button onClick={() => navigate('/register')}>Create a free account</Button>
                  )
                }
              />
            )
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => (
                <ItemCard
                  key={item._id}
                  item={item}
                  footer={renderFooter(item)}
                  actions={renderActions(item)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
