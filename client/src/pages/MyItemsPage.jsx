import {
  Archive,
  ArrowRight,
  CalendarClock,
  Inbox,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import Modal from '../components/common/Modal.jsx';
import ItemCard from '../components/items/ItemCard.jsx';
import ItemForm from '../components/items/ItemForm.jsx';
import { getApiMessage } from '../services/api.js';
import { categoryService } from '../services/categoryService.js';
import { itemService } from '../services/itemService.js';
import { cn } from '../utils/cn.js';
import { dueLabel, dueTone, formatDate } from '../utils/formatDate.js';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'borrowed', label: 'On loan' },
  { id: 'archived', label: 'Archived' },
];

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'title', label: 'Title A–Z' },
  { id: 'due', label: 'Due date' },
];

const EMPTY_COUNTS = { all: 0, available: 0, borrowed: 0, archived: 0, pendingRequests: 0 };

const DUE_TONES = {
  danger: 'text-danger',
  pending: 'text-pending',
  ink: 'text-ink',
  muted: 'text-muted',
};

function readView(params) {
  const value = params.get('view');
  return ['available', 'borrowed', 'archived'].includes(value) ? value : 'all';
}

function readSort(params) {
  const value = params.get('sort');
  return SORTS.some((sort) => sort.id === value) ? value : 'newest';
}

export default function MyItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readView(searchParams);
  const sort = readSort(searchParams);
  const q = searchParams.get('q') ?? '';
  const editParam = searchParams.get('edit') ?? '';

  const [term, setTerm] = useState(q);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState('');
  // Item detail deep links here with ?edit=<id>; the form opens once per target.
  const handledEdit = useRef('');

  // One modal at a time: { mode: 'create' | 'edit' | 'delete', item }
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // The URL is the source of truth for filters so dashboard shortcuts can deep link to a
  // view. Typing is debounced into the URL rather than firing a request per keystroke.
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

    itemService
      .mine({ view, sort, q })
      .then((result) => {
        if (ignore) return;
        const nextItems = Array.isArray(result?.items) ? result.items : [];
        setItems(nextItems);
        setCounts({ ...EMPTY_COUNTS, ...(result?.counts ?? {}) });

        if (editParam && handledEdit.current !== editParam) {
          const target = nextItems.find((entry) => entry._id === editParam);
          if (target) {
            handledEdit.current = editParam;
            setModal({ mode: 'edit', item: target });
          }
        }
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your items'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [view, sort, q, editParam, reloadKey]);

  // Categories back the listing form's dropdown; load them once. A failure only limits the
  // dropdown, so it is swallowed rather than blocking the page.
  useEffect(() => {
    let ignore = false;
    categoryService
      .list()
      .then((result) => {
        if (!ignore) setCategories(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!ignore) setCategories([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const isFormOpen = modal?.mode === 'create' || modal?.mode === 'edit';
  const isEditing = modal?.mode === 'edit';
  const isDeleteOpen = modal?.mode === 'delete';
  const filtered = Boolean(q) || view !== 'all';

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
  }

  function refresh() {
    setReloadKey((key) => key + 1);
  }

  async function handleCreate(values) {
    setSubmitting(true);
    try {
      await itemService.create(values);
      setModal(null);
      toast.success('Item listed');
      refresh();
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not list that item'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(values) {
    if (!modal?.item) return;
    setSubmitting(true);
    try {
      await itemService.update(modal.item._id, values);
      setModal(null);
      toast.success('Changes saved');
      refresh();
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not save those changes'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!modal?.item) return;
    setSubmitting(true);
    try {
      const result = await itemService.remove(modal.item._id);
      setModal(null);
      toast.success(
        result?.archived ? 'Item archived — loan history preserved' : 'Item deleted',
      );
      refresh();
    } catch (actionError) {
      setModal(null);
      toast.error(getApiMessage(actionError, 'Could not delete that item'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(item) {
    setBusyId(item._id);
    try {
      await itemService.archive(item._id);
      toast.success('Item archived');
      refresh();
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not archive that item'));
    } finally {
      setBusyId('');
    }
  }

  async function handleRestore(item) {
    setBusyId(item._id);
    try {
      await itemService.restore(item._id);
      toast.success('Item is back on the shelf');
      refresh();
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not restore that item'));
    } finally {
      setBusyId('');
    }
  }

  function renderFooter(item) {
    const loan = item.activeLoan;
    const pending = item.pendingRequestCount ?? 0;

    return (
      <div className="space-y-2">
        {loan && (
          <div className="rounded-lg bg-raised px-3 py-2 ring-1 ring-inset ring-line">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              On loan to
              <span className="font-semibold text-ink">{loan.borrowerName}</span>
            </p>
            <p
              className={cn(
                'mt-1 flex items-center gap-1.5 text-xs font-semibold',
                DUE_TONES[dueTone({ status: 'active', dueDate: loan.dueDate })],
              )}
            >
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {dueLabel({ status: 'active', dueDate: loan.dueDate })} · due {formatDate(loan.dueDate)}
            </p>
            <Link
              to={`/loans/${loan._id}`}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open loan
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}

        {pending > 0 && (
          <Link
            to={`/requests?status=pending&itemId=${item._id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-pending-soft px-2.5 py-1 text-xs font-semibold text-pending ring-1 ring-inset ring-pending/25 transition-colors hover:bg-pending/15"
          >
            <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
            {pending} {pending === 1 ? 'pending request' : 'pending requests'}
          </Link>
        )}

        {!loan && pending === 0 && item.status === 'available' && (
          <p className="text-xs text-muted">On the shelf, ready to lend</p>
        )}
        {item.status === 'archived' && <p className="text-xs text-muted">Hidden from the shelf</p>}
      </div>
    );
  }

  function renderActions(item) {
    const busy = busyId === item._id;
    const archived = item.status === 'archived';

    return (
      <>
        <Link
          to={`/items/${item._id}`}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          Manage
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>

        {!archived && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setModal({ mode: 'edit', item })}
            disabled={busy}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit
          </Button>
        )}

        {archived ? (
          <Button variant="success" size="sm" onClick={() => handleRestore(item)} loading={busy}>
            {!busy && <RotateCcw className="h-4 w-4" aria-hidden="true" />}
            Restore
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => handleArchive(item)} disabled={busy}>
            <Archive className="h-4 w-4" aria-hidden="true" />
            Archive
          </Button>
        )}

        {!archived && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModal({ mode: 'delete', item })}
            disabled={busy}
          >
            {/* cn() cannot beat the ghost variant's own text-muted, so the tint sits on a child. */}
            <span className="inline-flex items-center gap-1.5 text-danger">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </span>
          </Button>
        )}
      </>
    );
  }

  let body = null;

  if (loading) {
    body = <LoadingSpinner size="lg" label="Loading your items" />;
  } else if (error) {
    body = (
      <div role="alert" className="panel px-6 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-ink">Could not load your items</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{error}</p>
        <Button variant="secondary" className="mt-6" onClick={refresh}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  } else if (!items.length) {
    if (filtered) {
      body = (
        <EmptyState
          icon={Search}
          title="No items match these filters"
          description={
            q
              ? `Nothing in ${view === 'all' ? 'your inventory' : 'this view'} matches “${q}”.`
              : 'Nothing is in this view right now. Try another tab or clear the filters.'
          }
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setTerm('');
                setSearchParams(new URLSearchParams(), { replace: true });
              }}
            >
              Clear filters
            </Button>
          }
        />
      );
    } else {
      body = (
        <EmptyState
          icon={Package}
          title="You have not listed anything yet"
          description="Add the things you are happy to lend and they will show up here and on the shared shelf for everyone to browse."
          action={
            <Button onClick={() => setModal({ mode: 'create', item: null })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add your first item
            </Button>
          }
        />
      );
    }
  } else {
    body = (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <ItemCard
            key={item._id}
            item={item}
            footer={renderFooter(item)}
            actions={renderActions(item)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Your inventory</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">My Items</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Track what is on your shelf, what is out on loan, and what you have retired.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {counts.pendingRequests > 0 && (
            <Link
              to="/requests?status=pending"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-pending-soft px-3 text-sm font-semibold text-pending ring-1 ring-inset ring-pending/25 transition-colors hover:bg-pending/15"
            >
              <Inbox className="h-4 w-4" aria-hidden="true" />
              {counts.pendingRequests} pending
            </Link>
          )}
          <Button onClick={() => setModal({ mode: 'create', item: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add item
          </Button>
        </div>
      </header>

      <section className="panel p-3 sm:p-4" aria-label="Inventory filters">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Inventory view">
            {TABS.map((tab) => {
              const active = view === tab.id;
              const count = counts[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateParams({ view: tab.id === 'all' ? '' : tab.id })}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
                    active
                      ? 'bg-primary text-primary-ink'
                      : 'text-muted hover:bg-raised hover:text-ink',
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      'rounded px-1.5 text-xs tabular-nums',
                      active ? 'bg-primary-ink/15' : 'bg-raised text-muted',
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            <label className="relative block">
              <span className="sr-only">Search your items</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search title or description"
                className="h-9 w-56 rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none"
              />
            </label>

            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="sr-only">Sort items</span>
              <select
                value={sort}
                onChange={(event) => updateParams({ sort: event.target.value })}
                className="h-9 rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink focus:border-primary focus:outline-none"
              >
                {SORTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {body}

      <Modal
        open={isFormOpen}
        onClose={closeModal}
        size="lg"
        title={isEditing ? 'Edit item' : 'Add an item'}
        description={
          isEditing
            ? 'Update the details people see when they browse the shelf.'
            : 'List something you are happy to lend to the people around you.'
        }
      >
        <ItemForm
          key={isEditing ? modal?.item?._id : 'create'}
          initialValues={isEditing ? modal?.item : undefined}
          categories={categories}
          onSubmit={isEditing ? handleEdit : handleCreate}
          onCancel={closeModal}
          submitting={submitting}
          submitLabel={isEditing ? 'Save changes' : 'Add item'}
        />
      </Modal>

      <Modal
        open={isDeleteOpen}
        onClose={closeModal}
        size="sm"
        title="Delete this item?"
        description="Listings with loan history are archived instead of removed."
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={submitting}>
              {!submitting && <Trash2 className="h-4 w-4" aria-hidden="true" />}
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          You are about to remove{' '}
          <span className="font-semibold text-ink">{modal?.item?.title ?? 'this item'}</span> from
          your listings. If it has ever been borrowed, LendLoop archives it instead of deleting it
          so the loan and return history stays intact. Either way it disappears from the shared
          shelf.
        </p>
      </Modal>
    </div>
  );
}
