import { Inbox, Package, Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { timeAgo } from '../utils/formatDate.js';

export default function MyItemsPage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // One modal at a time: { mode: 'create' | 'edit' | 'delete', item }
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    itemService
      .mine()
      .then((result) => {
        if (ignore) return;
        setItems(Array.isArray(result) ? result : []);
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
  }, [reloadKey]);

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

  function closeModal() {
    if (submitting) return;
    setModal(null);
  }

  async function handleCreate(values) {
    setSubmitting(true);
    try {
      const created = await itemService.create(values);
      setItems((current) => [created, ...current]);
      setModal(null);
      toast.success('Item listed');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not list that item'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(values) {
    if (!modal?.item) return;
    const id = modal.item._id;

    setSubmitting(true);
    try {
      const updated = await itemService.update(id, values);
      setItems((current) =>
        current.map((entry) => (entry._id === id ? { ...entry, ...updated } : entry)),
      );
      setModal(null);
      toast.success('Changes saved');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not save those changes'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!modal?.item) return;
    const item = modal.item;

    setSubmitting(true);
    try {
      const result = await itemService.remove(item._id);
      setItems((current) => current.filter((entry) => entry._id !== item._id));
      setModal(null);

      // Archived means the listing had loan history, so it was retired rather than removed.
      if (result?.archived) {
        toast.success('Item archived — loan history preserved');
      } else {
        toast.success('Item deleted');
      }
    } catch (actionError) {
      // The item is still listed, so keep it on screen and surface the real reason.
      setModal(null);
      toast.error(getApiMessage(actionError, 'Could not delete that item'));
    } finally {
      setSubmitting(false);
    }
  }

  function renderFooter(item) {
    const pending = item.pendingRequestCount ?? 0;

    if (pending > 0) {
      return (
        <Link
          to="/requests"
          className="inline-flex items-center gap-1.5 rounded-md bg-pending-soft px-2.5 py-1 text-xs font-semibold text-pending ring-1 ring-inset ring-pending/25 transition-colors hover:bg-pending/15"
        >
          <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
          {pending} {pending === 1 ? 'pending request' : 'pending requests'}
        </Link>
      );
    }

    return <p className="text-xs text-muted">Listed {timeAgo(item.createdAt)}</p>;
  }

  function renderActions(item) {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setModal({ mode: 'edit', item })}
          disabled={submitting}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setModal({ mode: 'delete', item })}
          disabled={submitting}
        >
          {/* cn() cannot beat the ghost variant's own text-muted, so the tint sits on a child. */}
          <span className="inline-flex items-center gap-1.5 text-danger">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </span>
        </Button>
      </>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Your listings</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">My Items</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Everything you have put on the shared shelf. Edit a listing any time, or retire it once
            you are done lending it out.
          </p>
        </div>

        <Button onClick={() => setModal({ mode: 'create', item: null })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add item
        </Button>
      </header>

      {loading ? (
        <LoadingSpinner size="lg" label="Loading your items" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load your items</h2>
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
      ) : items.length === 0 ? (
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
      ) : (
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
      )}

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
