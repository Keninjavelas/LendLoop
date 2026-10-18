import { Field, FormSection, fieldAria, fieldClass } from '../../common/Field.jsx';
import {
  PRIORITIES,
  priorityLabel,
  priorityScheduleSummary,
} from '../../../utils/constants.js';
import { fromInputDate } from '../../../utils/formatDate.js';
import { resolvePriority } from '../../../utils/lendingEntry.js';

const DAY_MS = 86400000;

export default function TermsStep({ values, errors, update, onPriorityChange, category }) {
  const lent = fromInputDate(values.lentAt);
  const due = fromInputDate(values.dueDate);
  const resolvedPriority = resolvePriority(values.priority, category);
  const summary = priorityScheduleSummary(resolvedPriority);
  const inherited = values.priority === 'category-default';

  return (
    <FormSection title="When it goes back" description="Set the deadline and how urgently this entry should be chased.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="entry-lent" label="Lending date" error={errors.lentAt}>
          <input
            id="entry-lent"
            type="date"
            value={values.lentAt}
            onChange={update('lentAt')}
            className={fieldClass(errors.lentAt)}
            {...fieldAria('entry-lent', { error: errors.lentAt })}
          />
        </Field>

        <Field id="entry-due" label="Return deadline" error={errors.dueDate}>
          <input
            id="entry-due"
            type="date"
            value={values.dueDate}
            onChange={update('dueDate')}
            className={fieldClass(errors.dueDate)}
            {...fieldAria('entry-due', { error: errors.dueDate })}
          />
        </Field>
      </div>

      {lent && due && (
        <p className="text-xs leading-relaxed text-muted">
          Out for{' '}
          <span className="font-semibold text-ink">
            {Math.max(0, Math.round((due.getTime() - lent.getTime()) / DAY_MS))} days
          </span>
          . A backdated entry is fine — it simply starts life overdue, and stale reminders are never
          dumped on the borrower.
        </p>
      )}

      <Field
        id="entry-priority"
        label="Priority"
        hint={summary ? `Reminds ${summary.toLowerCase()}.` : undefined}
        error={errors.priority}
      >
        <select
          id="entry-priority"
          value={values.priority}
          onChange={(event) => onPriorityChange(event.target.value)}
          className={fieldClass(errors.priority)}
          {...fieldAria('entry-priority', {
            error: errors.priority,
            hint: summary ? `Reminds ${summary.toLowerCase()}.` : undefined,
          })}
        >
          <option value="category-default">
            Category default{category ? ` (${priorityLabel(category.defaultPriority)})` : ''}
          </option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {priorityLabel(priority)}
            </option>
          ))}
        </select>
      </Field>

      <p className="text-xs leading-relaxed text-muted">
        {inherited && category
          ? `${priorityLabel(category.defaultPriority)} is inherited from ${category.name}. Editing that category default later will not change this entry.`
          : inherited
            ? 'The category default is inherited at creation. Editing that category later will not change this entry.'
            : `This overrides the category default${category ? ` of ${priorityLabel(category.defaultPriority)}` : ''}. The entry keeps this priority even if the category default changes.`}
      </p>

      <Field
        id="entry-notes"
        label="Notes"
        optional
        hint="Only visible to you — where it was handed over, what condition it left in."
      >
        <textarea
          id="entry-notes"
          value={values.notes}
          onChange={update('notes')}
          rows={3}
          maxLength={1000}
          placeholder="Only visible to you — where it was handed over, what condition it left in"
          className={`${fieldClass()} resize-y`}
        />
      </Field>
    </FormSection>
  );
}
