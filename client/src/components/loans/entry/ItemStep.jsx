import { Field, FormSection, fieldAria, fieldClass } from '../../common/Field.jsx';
import { priorityLabel } from '../../../utils/constants.js';

export default function ItemStep({
  values,
  errors,
  update,
  onItemLink,
  onCategoryChange,
  categories,
  items,
}) {
  const linkedItem = items.find((item) => item._id === values.itemId) ?? null;

  return (
    <FormSection
      title="What went out"
      description="Link one of your listings to keep its availability in sync, or record something you never listed."
    >
      {items.length > 0 ? (
        <Field
          id="entry-item-link"
          label="From your listings"
          optional
          hint={
            linkedItem
              ? 'Saving marks this listing as borrowed until the entry is returned.'
              : 'Linking keeps the listing availability in sync and fills in what it already knows.'
          }
        >
          <select
            id="entry-item-link"
            value={values.itemId}
            onChange={(event) => onItemLink(event.target.value)}
            className={fieldClass()}
          >
            <option value="">Not linked — a standalone entry</option>
            {items.map((item) => (
              <option key={item._id} value={item._id}>
                {item.title}
                {item.categoryId?.name ? ` · ${item.categoryId.name}` : ''}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="rounded-lg border border-line-soft bg-surface px-3.5 py-3 text-xs leading-relaxed text-muted">
          No available listings were loaded, so this will be a standalone entry. You can still record
          something you have lent.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="entry-item-name" label="Item name" error={errors.itemName}>
          <input
            id="entry-item-name"
            value={values.itemName}
            onChange={update('itemName')}
            placeholder="Scientific calculator"
            maxLength={120}
            className={fieldClass(errors.itemName)}
            {...fieldAria('entry-item-name', { error: errors.itemName })}
          />
        </Field>

        <Field id="entry-category" label="Category" error={errors.categoryId}>
          <select
            id="entry-category"
            value={values.categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
            className={fieldClass(errors.categoryId)}
            {...fieldAria('entry-category', { error: errors.categoryId })}
          >
            <option value="" disabled>
              {categories.length ? 'Select a category' : 'No categories available'}
            </option>
            {categories.map((entry) => (
              <option key={entry._id} value={entry._id}>
                {entry.name} · {priorityLabel(entry.defaultPriority)} default
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        id="entry-description"
        label="Description"
        optional
        hint="Serial number, accessories that went with it, anything to check on return."
      >
        <textarea
          id="entry-description"
          value={values.description}
          onChange={update('description')}
          rows={2}
          maxLength={1000}
          placeholder="Serial number, accessories that went with it, anything to check on return"
          className={`${fieldClass()} resize-y`}
        />
      </Field>

      {linkedItem && (
        <div className="rounded-lg border border-primary/25 bg-primary-soft px-3.5 py-3 text-xs leading-relaxed text-primary">
          This entry is linked to <span className="font-semibold">{linkedItem.title}</span>. Its
          listing will show as borrowed until you confirm the return.
        </div>
      )}
    </FormSection>
  );
}
