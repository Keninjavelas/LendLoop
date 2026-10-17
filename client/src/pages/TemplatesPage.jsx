import {
  Copy,
  Lock,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import Modal from '../components/common/Modal.jsx';
import PriorityBadge from '../components/common/PriorityBadge.jsx';
import TemplateForm, { SCOPE_LABELS } from '../components/templates/TemplateForm.jsx';
import { getApiMessage } from '../services/api.js';
import { categoryService } from '../services/categoryService.js';
import { templateService } from '../services/templateService.js';
import { cn } from '../utils/cn.js';
import { PRIORITIES, priorityLabel } from '../utils/constants.js';

// Only used when the list response omits placeholders — the server's list is authoritative.
const FALLBACK_PLACEHOLDERS = [
  'borrowerName',
  'itemName',
  'dueDate',
  'dueDateTime',
  'category',
  'priority',
  'lenderName',
  'daysUntilDue',
  'duePhrase',
];

const SCOPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'general', label: SCOPE_LABELS.general },
  { value: 'priority', label: SCOPE_LABELS.priority },
  { value: 'category', label: SCOPE_LABELS.category },
];

const BUILT_IN_TITLE = 'Built-in templates cannot be edited or deleted — duplicate one instead';

function FilterChip({ active, onClick, children }) {
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

// Scope is taxonomy rather than a status, so the chip stays neutral: the priority badge beside it
// is the only thing on the card allowed to carry colour.
function ScopeBadge({ scope }) {
  return (
    <span className="inline-flex items-center rounded-md bg-raised px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-inset ring-line">
      {SCOPE_LABELS[scope] ?? scope}
    </span>
  );
}

function TemplateCard({ template, submitting, onDuplicate, onEdit, onDelete }) {
  const builtIn = template.isSystem === true;
  const categoryName = template.categoryId?.name ?? '';

  return (
    <article className="panel flex flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 text-base font-semibold text-ink">{template.name}</h3>
        {builtIn ? (
          <span
            title={BUILT_IN_TITLE}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-raised px-2.5 py-1 text-xs font-semibold text-muted ring-1 ring-inset ring-line"
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            Built-in
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-md bg-success-soft px-2.5 py-1 text-xs font-semibold text-success ring-1 ring-inset ring-success/25">
            Yours
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <ScopeBadge scope={template.scope} />
        {template.scope === 'priority' && template.priority && (
          <PriorityBadge priority={template.priority} />
        )}
        {template.scope === 'category' && categoryName && (
          <span className="inline-flex items-center rounded-md bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-line">
            {categoryName}
          </span>
        )}
      </div>

      <p className="mt-4 text-sm font-medium text-ink">{template.subject}</p>
      <p className="mt-1.5 mb-5 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-muted">
        {template.body}
      </p>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="secondary" size="sm" onClick={onDuplicate} disabled={submitting}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Duplicate
        </Button>

        <span className="inline-flex" title={builtIn ? BUILT_IN_TITLE : undefined}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={builtIn || submitting}
            title={builtIn ? BUILT_IN_TITLE : undefined}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit
          </Button>
        </span>

        <span className="inline-flex" title={builtIn ? BUILT_IN_TITLE : undefined}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={builtIn || submitting}
            title={builtIn ? BUILT_IN_TITLE : undefined}
          >
            {/* cn() cannot beat the ghost variant's own text-muted, so the tint sits on a child. */}
            <span className={cn('inline-flex items-center gap-1.5', !builtIn && 'text-danger')}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </span>
          </Button>
        </span>
      </div>
    </article>
  );
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [placeholders, setPlaceholders] = useState(FALLBACK_PLACEHOLDERS);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // One modal at a time: { mode: 'create' | 'edit' | 'delete', template }
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    templateService
      .list()
      .then((result) => {
        if (ignore) return;
        setTemplates(Array.isArray(result?.templates) ? result.templates : []);
        setPlaceholders(
          Array.isArray(result?.placeholders) && result.placeholders.length > 0
            ? result.placeholders
            : FALLBACK_PLACEHOLDERS,
        );
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your templates'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // Categories back the form's category dropdown; load them once. A failure only limits that
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

  const visibleTemplates = useMemo(
    () =>
      templates.filter((template) => {
        if (scopeFilter !== 'all' && template.scope !== scopeFilter) return false;
        if (scopeFilter === 'priority' && priorityFilter !== 'all') {
          return template.priority === priorityFilter;
        }
        return true;
      }),
    [templates, scopeFilter, priorityFilter],
  );

  const isFormOpen = modal?.mode === 'create' || modal?.mode === 'edit';
  const isEditing = modal?.mode === 'edit';
  const isDuplicating = modal?.mode === 'create' && Boolean(modal?.template);
  const isDeleteOpen = modal?.mode === 'delete';

  function closeModal() {
    if (submitting) return;
    setModal(null);
  }

  // Duplicating is the sanctioned way to customise a built-in: the copy keeps the scope and
  // target, and a lender's own template wins over a system one with the same scope.
  function openDuplicate(template) {
    setModal({
      mode: 'create',
      template: {
        _id: template._id,
        name: `${template.name} (copy)`,
        scope: template.scope,
        priority: template.priority ?? '',
        categoryId: template.categoryId,
        subject: template.subject,
        body: template.body,
      },
    });
  }

  function openCreate() {
    setModal({ mode: 'create', template: null });
  }

  async function handleCreate(values) {
    setSubmitting(true);
    try {
      const created = await templateService.create(values);
      setTemplates((current) => [created, ...current]);
      setModal(null);
      toast.success('Template created');
    } catch (actionError) {
      // The modal stays open so nothing typed is lost.
      toast.error(getApiMessage(actionError, 'Could not create that template'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(values) {
    if (!modal?.template) return;
    const id = modal.template._id;

    setSubmitting(true);
    try {
      const updated = await templateService.update(id, values);
      setTemplates((current) =>
        current.map((entry) => (entry._id === id ? { ...entry, ...updated } : entry)),
      );
      setModal(null);
      toast.success('Template saved');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not save those changes'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!modal?.template) return;
    const template = modal.template;

    setSubmitting(true);
    try {
      await templateService.remove(template._id);
      setTemplates((current) => current.filter((entry) => entry._id !== template._id));
      setModal(null);
      toast.success('Template deleted');
    } catch (actionError) {
      setModal(null);
      toast.error(getApiMessage(actionError, 'Could not delete that template'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Reminder messages</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Templates</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            The wording LendLoop sends as a deadline approaches. Built-in templates ship with the
            app and are read-only; duplicate one to make it yours, and your copy takes precedence
            over the built-in for the same loans.
          </p>
        </div>

        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New template
        </Button>
      </header>

      {!loading && !error && templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {SCOPE_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              active={scopeFilter === filter.value}
              onClick={() => {
                setScopeFilter(filter.value);
                setPriorityFilter('all');
              }}
            >
              {filter.label}
            </FilterChip>
          ))}

          {scopeFilter === 'priority' && (
            <>
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
              <FilterChip
                active={priorityFilter === 'all'}
                onClick={() => setPriorityFilter('all')}
              >
                Any priority
              </FilterChip>
              {PRIORITIES.map((priority) => (
                <FilterChip
                  key={priority}
                  active={priorityFilter === priority}
                  onClick={() => setPriorityFilter(priority)}
                >
                  {priorityLabel(priority)}
                </FilterChip>
              ))}
            </>
          )}

          <span className="ml-auto text-sm text-muted">
            Showing {visibleTemplates.length} of {templates.length}
          </span>
        </div>
      )}

      {loading ? (
        <LoadingSpinner size="lg" label="Loading your templates" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load your templates</h2>
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
      ) : templates.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No reminder templates yet"
          description="Templates hold the wording behind every deadline reminder. Built-in ones arrive with LendLoop, and you can add your own on top of them."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Write your first template
            </Button>
          }
        />
      ) : visibleTemplates.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No templates match this filter"
          description="Nothing is bound to that combination yet. Widen the filter, or write a template for it."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setScopeFilter('all');
                setPriorityFilter('all');
              }}
            >
              Show all templates
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {visibleTemplates.map((template) => (
            <TemplateCard
              key={template._id}
              template={template}
              submitting={submitting}
              onDuplicate={() => openDuplicate(template)}
              onEdit={() => setModal({ mode: 'edit', template })}
              onDelete={() => setModal({ mode: 'delete', template })}
            />
          ))}
        </div>
      )}

      <Modal
        open={isFormOpen}
        onClose={closeModal}
        size="lg"
        title={
          isEditing ? 'Edit template' : isDuplicating ? 'Duplicate template' : 'New template'
        }
        description={
          isEditing
            ? 'Changes apply to the next reminder this template sends.'
            : isDuplicating
              ? 'This becomes your own copy — the built-in original stays untouched.'
              : 'Write the reminder you want to send, then choose which loans it speaks for.'
        }
      >
        <TemplateForm
          key={
            isEditing
              ? modal?.template?._id
              : isDuplicating
                ? `duplicate-${modal?.template?._id}`
                : 'create'
          }
          initialValues={modal?.template ?? undefined}
          categories={categories}
          placeholders={placeholders}
          onSubmit={isEditing ? handleEdit : handleCreate}
          onCancel={closeModal}
          submitting={submitting}
          submitLabel={isEditing ? 'Save changes' : 'Create template'}
        />
      </Modal>

      <Modal
        open={isDeleteOpen}
        onClose={closeModal}
        size="sm"
        title="Delete this template?"
        description="Reminders already sent keep their own record of the wording."
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
          You are about to delete{' '}
          <span className="font-semibold text-ink">{modal?.template?.name ?? 'this template'}</span>.
          Loans that would have used it fall back to a built-in template with the same scope, or to
          LendLoop's default wording if there is none. Built-in templates cannot be deleted — only
          your own can. Reminder logs keep a snapshot of the template name, so the history of what
          was already sent survives this.
        </p>
      </Modal>
    </div>
  );
}
