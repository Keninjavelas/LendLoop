import { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn.js';
import { PRIORITIES, TEMPLATE_SCOPES, priorityLabel } from '../../utils/constants.js';
import Button from '../common/Button.jsx';
import { FIELD_CLASS, Field, FormSection, fieldClass } from '../common/Field.jsx';

export const SCOPE_LABELS = {
  general: 'General',
  priority: 'By priority',
  category: 'By category',
};

const SCOPE_HINTS = {
  general: 'The fallback wording, used when no priority or category template matches.',
  priority: 'Used for every loan on this priority, whatever the item is.',
  category: 'Used for loans whose item sits in this category.',
};

const PLACEHOLDER_LEGEND = [
  ['borrowerName', "the borrower's name"],
  ['itemName', 'what you lent'],
  ['dueDate', 'the return date, e.g. 4 Mar 2026'],
  ['duePhrase', 'human timing, e.g. due tomorrow, 2 days overdue'],
  ['category', 'the category the item belongs to'],
  ['priority', 'the priority the loan runs on'],
  ['lenderName', 'your name'],
];

// When editing, categoryId arrives populated; on a fresh form it is absent. The select and the
// API both want the bare ObjectId string.
function initialCategoryId(initialValues) {
  const raw = initialValues?.categoryId;
  if (!raw) return '';
  return typeof raw === 'object' ? raw._id ?? '' : raw;
}

export default function TemplateForm({
  initialValues,
  categories = [],
  placeholders = [],
  onSubmit,
  onCancel,
  submitting = false,
  submitLabel = 'Save template',
}) {
  const [values, setValues] = useState(() => ({
    name: initialValues?.name ?? '',
    scope: TEMPLATE_SCOPES.includes(initialValues?.scope) ? initialValues.scope : 'general',
    priority: initialValues?.priority ?? '',
    categoryId: initialCategoryId(initialValues),
    subject: initialValues?.subject ?? '',
    body: initialValues?.body ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [caret, setCaret] = useState(null);
  const bodyRef = useRef(null);

  // The caret can only be restored once React has written the new body into the DOM.
  useEffect(() => {
    if (caret === null) return;
    const textarea = bodyRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    }
    setCaret(null);
  }, [caret]);

  function update(field) {
    return (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));
  }

  function handleScopeChange(event) {
    setValues((prev) => ({ ...prev, scope: event.target.value }));
    setErrors((prev) => ({ ...prev, priority: '', categoryId: '' }));
  }

  function insertPlaceholder(placeholder) {
    const token = `{${placeholder}}`;
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? values.body.length;
    const end = textarea?.selectionEnd ?? values.body.length;

    setValues((prev) => ({
      ...prev,
      body: `${prev.body.slice(0, start)}${token}${prev.body.slice(end)}`,
    }));
    setErrors((prev) => (prev.body ? { ...prev, body: '' } : prev));
    setCaret(start + token.length);
  }

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = {};
    if (values.name.trim().length < 3) nextErrors.name = 'Name must be at least 3 characters';
    if (values.subject.trim().length < 3) nextErrors.subject = 'Subject must be at least 3 characters';
    if (values.body.trim().length < 10) nextErrors.body = 'Body must be at least 10 characters';
    if (values.scope === 'priority' && !PRIORITIES.includes(values.priority)) {
      nextErrors.priority = 'Choose the priority this template speaks for';
    }
    if (values.scope === 'category' && !values.categoryId) {
      nextErrors.categoryId = 'Choose the category this template speaks for';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Only the target the chosen scope actually uses is sent: the server rejects a mismatched pair.
    const payload = {
      name: values.name.trim(),
      scope: values.scope,
      subject: values.subject.trim(),
      body: values.body.trim(),
    };
    if (values.scope === 'priority') payload.priority = values.priority;
    if (values.scope === 'category') payload.categoryId = values.categoryId;

    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field
        id="template-name"
        label="Template name"
        error={errors.name}
        hint="Only you see this. It names the template in your list."
      >
        <input
          id="template-name"
          value={values.name}
          onChange={update('name')}
          maxLength={80}
          placeholder="High priority — urgent return"
          className={fieldClass(errors.name)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="template-scope" label="Applies to" hint={SCOPE_HINTS[values.scope]}>
          <select
            id="template-scope"
            value={values.scope}
            onChange={handleScopeChange}
            className={FIELD_CLASS}
          >
            {TEMPLATE_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {SCOPE_LABELS[scope] ?? scope}
              </option>
            ))}
          </select>
        </Field>

        {values.scope === 'priority' && (
          <Field id="template-priority" label="Priority" error={errors.priority}>
            <select
              id="template-priority"
              value={values.priority}
              onChange={update('priority')}
              className={fieldClass(errors.priority)}
            >
              <option value="" disabled>
                Select a priority
              </option>
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {priorityLabel(priority)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {values.scope === 'category' && (
          <Field
            id="template-category"
            label="Category"
            error={errors.categoryId}
            hint={
              categories.length === 0
                ? 'Could not load your categories. Close and retry to fill this in.'
                : undefined
            }
          >
            <select
              id="template-category"
              value={values.categoryId}
              onChange={update('categoryId')}
              className={fieldClass(errors.categoryId)}
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <Field
        id="template-subject"
        label="Subject line"
        error={errors.subject}
        hint="Placeholders are substituted here too."
      >
        <input
          id="template-subject"
          value={values.subject}
          onChange={update('subject')}
          maxLength={160}
          placeholder="Urgent: {itemName} was due {dueDate}"
          className={fieldClass(errors.subject)}
        />
      </Field>

      <Field id="template-body" label="Message" error={errors.body}>
        <textarea
          id="template-body"
          ref={bodyRef}
          value={values.body}
          onChange={update('body')}
          rows={6}
          maxLength={2000}
          placeholder={'Hi {borrowerName},\n\nJust a nudge that {itemName} is {duePhrase}.'}
          className={cn(fieldClass(errors.body), 'resize-y')}
        />
      </Field>

      <FormSection
        title="Insert a placeholder"
        description="Click a chip to drop it at the cursor in the message. Anything the renderer does not recognise is left in the sent message rather than blanked, so a typo stays visible."
      >
        <div className="flex flex-wrap gap-2">
          {placeholders.map((placeholder) => (
            <button
              key={placeholder}
              type="button"
              onClick={() => insertPlaceholder(placeholder)}
              disabled={submitting}
              title={`Insert {${placeholder}}`}
              className="rounded-lg border border-line bg-raised px-2.5 py-1 font-mono text-xs font-medium text-ink transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {`{${placeholder}}`}
            </button>
          ))}
        </div>

        <dl className="grid gap-x-5 gap-y-1 border-t border-line pt-3 sm:grid-cols-2">
          {PLACEHOLDER_LEGEND.map(([key, meaning]) => (
            <div key={key} className="flex gap-1.5 text-xs">
              <dt className="shrink-0 font-mono font-semibold text-ink">{`{${key}}`}</dt>
              <dd className="text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </FormSection>

      <div className="flex flex-wrap justify-end gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
