import {
  Boxes,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import { Field, fieldClass } from '../components/common/Field.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import Modal from '../components/common/Modal.jsx';
import PriorityBadge from '../components/common/PriorityBadge.jsx';
import { getApiMessage } from '../services/api.js';
import { categoryService } from '../services/categoryService.js';
import { cn } from '../utils/cn.js';
import { PRIORITIES, priorityLabel, priorityScheduleSummary } from '../utils/constants.js';

// The submit button lives in the Modal footer, so it reaches the form through this id.
const FORM_ID = 'category-form';

const NAME_MIN = 2;
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;

const SHARED_HINT = 'Shared categories are read-only — create your own to set a different default';

// The server only returns shared categories plus the caller's own, so no owner means shared.
function isSharedCategory(category) {
  return Boolean(category?.isSystem) || !category?.ownerId;
}

function usageParts(category) {
  const usage = category?.usage ?? {};
  return [
    { key: 'items', singular: 'item', plural: 'items', count: Number(usage.items) || 0 },
    {
      key: 'loans',
      singular: 'lending entry',
      plural: 'lending entries',
      count: Number(usage.loans) || 0,
    },
    {
      key: 'templates',
      singular: 'template',
      plural: 'templates',
      count: Number(usage.templates) || 0,
    },
  ];
}

function usageText(category) {
  return usageParts(category)
    .map((part) => `${part.count} ${part.count === 1 ? part.singular : part.plural}`)
    .join(' · ');
}

function CategoryRow({ category, shared, submitting, onEdit, onDelete }) {
  const summary = priorityScheduleSummary(category.defaultPriority);

  return (
    <li className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
            <h3 className="truncate text-sm font-bold text-ink">{category.name}</h3>
            {shared && (
              <span
                title={SHARED_HINT}
                className="inline-flex items-center gap-1.5 rounded-md bg-raised px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-inset ring-line"
              >
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Shared
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted">
            {category.description || 'No description yet'}
          </p>
        </div>

        {/* The wrapper carries the tooltip too: disabled buttons swallow mouse events. */}
        <div
          className="flex shrink-0 flex-wrap items-center gap-2"
          title={shared ? SHARED_HINT : undefined}
        >
          {shared ? (
            <>
              <Button variant="secondary" size="sm" disabled title={SHARED_HINT}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              {/* Read-only, so Delete stays muted rather than tinting an action it can never take. */}
              <Button variant="ghost" size="sm" disabled title={SHARED_HINT}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={onEdit} disabled={submitting}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} disabled={submitting}>
                {/* cn() cannot beat the ghost variant's own text-muted, so the tint sits on a child. */}
                <span className="inline-flex items-center gap-1.5 text-danger">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </span>
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <p className="eyebrow">Default priority</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <PriorityBadge priority={category.defaultPriority} source="category" />
            {summary && <span className="text-xs text-muted">Reminded {summary}</span>}
          </div>
        </div>
        <div className="sm:text-right">
          <p className="eyebrow">Used by</p>
          <p className="mt-2 text-xs text-muted">{usageText(category)}</p>
        </div>
      </div>
    </li>
  );
}

function CategoryForm({ initialValues, onSubmit }) {
  const isEditing = Boolean(initialValues?._id);
  const [values, setValues] = useState(() => ({
    name: initialValues?.name ?? '',
    description: initialValues?.description ?? '',
    defaultPriority: PRIORITIES.includes(initialValues?.defaultPriority)
      ? initialValues.defaultPriority
      : 'medium',
  }));
  const [errors, setErrors] = useState({});

  function update(field) {
    return (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const name = values.name.trim();
    const description = values.description.trim();
    const nextErrors = {};
    if (name.length < NAME_MIN) nextErrors.name = `Name must be at least ${NAME_MIN} characters`;
    else if (name.length > NAME_MAX) nextErrors.name = `Name must be at most ${NAME_MAX} characters`;
    if (description.length > DESCRIPTION_MAX) {
      nextErrors.description = `Description must be at most ${DESCRIPTION_MAX} characters`;
    }
    if (!PRIORITIES.includes(values.defaultPriority)) {
      nextErrors.defaultPriority = 'Choose a priority';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({ name, description, defaultPriority: values.defaultPriority });
  }

  const summary = priorityScheduleSummary(values.defaultPriority);

  return (
    <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field
        id="category-name"
        label="Name"
        error={errors.name}
        hint="Pick something a shared category does not already use."
      >
        <input
          id="category-name"
          name="name"
          type="text"
          value={values.name}
          onChange={update('name')}
          maxLength={NAME_MAX}
          placeholder="Study Gear"
          aria-invalid={errors.name ? 'true' : undefined}
          className={fieldClass(errors.name)}
        />
      </Field>

      <Field
        id="category-description"
        label="Description"
        optional
        error={errors.description}
        hint="A short note so the right category is obvious when you list something."
      >
        <textarea
          id="category-description"
          name="description"
          rows={3}
          value={values.description}
          onChange={update('description')}
          maxLength={DESCRIPTION_MAX}
          placeholder="What belongs in this category?"
          aria-invalid={errors.description ? 'true' : undefined}
          className={cn(fieldClass(errors.description), 'resize-y')}
        />
      </Field>

      <Field
        id="category-priority"
        label="Default priority"
        error={errors.defaultPriority}
        hint={summary ? `New entries in this category will be reminded ${summary}.` : undefined}
      >
        <select
          id="category-priority"
          name="defaultPriority"
          value={values.defaultPriority}
          onChange={update('defaultPriority')}
          aria-invalid={errors.defaultPriority ? 'true' : undefined}
          className={fieldClass(errors.defaultPriority)}
        >
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priorityLabel(priority)}
            </option>
          ))}
        </select>
      </Field>

      <div className="inset-panel px-3.5 py-3">
        <p className="flex gap-2 text-xs leading-relaxed text-muted">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <span>
            {isEditing ? (
              <>
                Changing the default priority applies to <span className="font-semibold text-ink">new</span>{' '}
                lending entries in this category only. Priorities already set on existing loans are
                never rewritten.
              </>
            ) : (
              <>
                Lending entries created in this category start on this priority, and you can still
                override it on an individual entry.
              </>
            )}
          </span>
        </p>
      </div>
    </form>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // One modal at a time: { mode: 'create' | 'edit' | 'delete', category }
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    categoryService
      .list()
      .then((result) => {
        if (ignore) return;
        setCategories(Array.isArray(result) ? result : []);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your categories'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const sharedCategories = categories.filter(isSharedCategory);
  const ownCategories = categories.filter((category) => !isSharedCategory(category));

  const isFormOpen = modal?.mode === 'create' || modal?.mode === 'edit';
  const isEditing = modal?.mode === 'edit';
  const isDeleteOpen = modal?.mode === 'delete';
  const deleteTarget = isDeleteOpen ? modal.category : null;
  const deleteParts = usageParts(deleteTarget);
  const deleteBlocked = deleteParts.some((part) => part.count > 0);

  function openCreate() {
    setModal({ mode: 'create', category: null });
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
  }

  async function handleCreate(values) {
    setSubmitting(true);
    try {
      const created = await categoryService.create(values);
      setCategories((current) => [...current, created]);
      setModal(null);
      toast.success('Category added');
    } catch (actionError) {
      // Usually a name clash with a shared category, so the form stays open to be fixed.
      toast.error(getApiMessage(actionError, 'Could not create that category'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(values) {
    if (!modal?.category) return;
    const id = modal.category._id;

    setSubmitting(true);
    try {
      const updated = await categoryService.update(id, values);
      setCategories((current) =>
        current.map((entry) => (entry._id === id ? { ...entry, ...updated } : entry)),
      );
      setModal(null);
      toast.success('Category updated');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not save those changes'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!modal?.category) return;
    const category = modal.category;

    setSubmitting(true);
    try {
      await categoryService.remove(category._id);
      setCategories((current) => current.filter((entry) => entry._id !== category._id));
      setModal(null);
      toast.success('Category deleted');
    } catch (actionError) {
      // A 409 means something still references it, so the category stays on screen.
      setModal(null);
      toast.error(getApiMessage(actionError, 'Could not delete that category'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Lending setup</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Categories</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Every lending entry starts on its category's default priority. Changing a default only
            affects new entries — loans that already carry a priority keep it.
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add category
        </Button>
      </header>

      {loading ? (
        <LoadingSpinner size="lg" label="Loading categories" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load your categories</h2>
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
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No categories yet"
          description="Categories decide the reminder priority a new lending entry starts on. Add your own to match the way you lend."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add your first category
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {sharedCategories.length > 0 && (
            <section aria-labelledby="shared-categories-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="shared-categories-heading" className="eyebrow">
                  Shared categories
                </h2>
                <span className="text-xs font-medium text-muted">
                  {sharedCategories.length} available
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm text-muted">
                These ship with LendLoop, so they are read-only. Create your own category if you
                want a different default priority for the same kind of thing.
              </p>
              <ul className="mt-4 space-y-3">
                {sharedCategories.map((category) => (
                  <CategoryRow
                    key={category._id}
                    category={category}
                    shared
                    submitting={submitting}
                  />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="your-categories-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="your-categories-heading" className="eyebrow">
                Your categories
              </h2>
              <span className="text-xs font-medium text-muted">{ownCategories.length} created</span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-muted">
              Rename, re-prioritise or delete these any time. A new default priority changes what
              new lending entries get, never what existing loans already have.
            </p>

            {ownCategories.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-line bg-surface/40 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-ink">You have not added a category yet</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
                  Your own categories are the only ones you can edit, so add one whenever a shared
                  default does not fit how you lend something.
                </p>
                <Button variant="secondary" className="mt-5" onClick={openCreate}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add category
                </Button>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {ownCategories.map((category) => (
                  <CategoryRow
                    key={category._id}
                    category={category}
                    submitting={submitting}
                    onEdit={() => setModal({ mode: 'edit', category })}
                    onDelete={() => setModal({ mode: 'delete', category })}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Modal
        open={isFormOpen}
        onClose={closeModal}
        size="md"
        title={isEditing ? 'Edit category' : 'Add a category'}
        description={
          isEditing
            ? 'Rename it, or change the default priority new lending entries start on.'
            : 'Your own category, with the default priority that suits how you lend it.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} loading={submitting}>
              {!submitting &&
                (isEditing ? (
                  <Save className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                ))}
              {isEditing ? 'Save changes' : 'Add category'}
            </Button>
          </>
        }
      >
        <CategoryForm
          key={isEditing ? modal?.category?._id : 'create'}
          initialValues={isEditing ? modal?.category : undefined}
          onSubmit={isEditing ? handleEdit : handleCreate}
        />
      </Modal>

      <Modal
        open={isDeleteOpen}
        onClose={closeModal}
        size="sm"
        title="Delete this category?"
        description="Only your own categories can be deleted."
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} loading={submitting}>
              {!submitting && <Trash2 className="h-4 w-4" aria-hidden="true" />}
              Delete category
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            You are about to delete{' '}
            <span className="font-semibold text-ink">{deleteTarget?.name ?? 'this category'}</span>.
            LendLoop refuses to delete a category that anything still points at, so these counts have
            to reach zero first.
          </p>

          <ul className="inset-panel divide-y divide-line overflow-hidden">
            {deleteParts.map((part) => (
              <li key={part.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <span className="text-sm capitalize text-muted">
                  {part.count === 1 ? part.singular : part.plural}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold',
                    part.count > 0 ? 'text-danger' : 'text-ink',
                  )}
                >
                  {part.count}
                </span>
              </li>
            ))}
          </ul>

          <p
            className={cn(
              'flex gap-2 text-xs leading-relaxed',
              deleteBlocked ? 'text-danger' : 'text-muted',
            )}
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {deleteBlocked
                ? 'This delete will be rejected while anything above still uses the category. Move those items, lending entries and templates to another category first.'
                : 'Nothing is using this category, so the delete will go through.'}
            </span>
          </p>
        </div>
      </Modal>
    </div>
  );
}
