import { useState } from 'react';
import { ITEM_CONDITIONS } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';
import Button from '../common/Button.jsx';
import { FIELD_CLASS, LABEL_CLASS, fieldClass } from '../common/Field.jsx';

// When editing, categoryId arrives as a populated object; when creating it is absent.
// Normalise to the bare ObjectId string the <select> and the API both expect.
function initialCategoryId(initialValues) {
  const raw = initialValues?.categoryId;
  if (!raw) return '';
  return typeof raw === 'object' ? raw._id ?? '' : raw;
}

export default function ItemForm({
  initialValues,
  categories = [],
  onSubmit,
  onCancel,
  submitting = false,
  submitLabel = 'Save item',
}) {
  const [values, setValues] = useState(() => ({
    title: initialValues?.title ?? '',
    description: initialValues?.description ?? '',
    categoryId: initialCategoryId(initialValues),
    condition: initialValues?.condition ?? ITEM_CONDITIONS[0],
    imageUrl: initialValues?.imageUrl ?? '',
  }));
  const [errors, setErrors] = useState({});

  function update(field) {
    return (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = {};
    if (values.title.trim().length < 3) nextErrors.title = 'Title must be at least 3 characters';
    if (values.description.trim().length < 10) {
      nextErrors.description = 'Description must be at least 10 characters';
    }
    if (!values.categoryId) nextErrors.categoryId = 'Choose a category';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      title: values.title.trim(),
      description: values.description.trim(),
      categoryId: values.categoryId,
      condition: values.condition,
      imageUrl: values.imageUrl.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label className={LABEL_CLASS} htmlFor="item-title">
          Title
        </label>
        <input
          id="item-title"
          value={values.title}
          onChange={update('title')}
          placeholder="Scientific Calculator"
          maxLength={100}
          className={fieldClass(errors.title)}
        />
        {errors.title && <p className="mt-1.5 text-xs font-medium text-danger">{errors.title}</p>}
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="item-description">
          Description
        </label>
        <textarea
          id="item-description"
          value={values.description}
          onChange={update('description')}
          rows={4}
          maxLength={1000}
          placeholder="What is it, what condition is it in, and what should the borrower know?"
          className={cn(fieldClass(errors.description), 'resize-y')}
        />
        {errors.description && (
          <p className="mt-1.5 text-xs font-medium text-danger">{errors.description}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS} htmlFor="item-category">
            Category
          </label>
          <select
            id="item-category"
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
          {errors.categoryId && (
            <p className="mt-1.5 text-xs font-medium text-danger">{errors.categoryId}</p>
          )}
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="item-condition">
            Condition
          </label>
          <select id="item-condition" value={values.condition} onChange={update('condition')} className={FIELD_CLASS}>
            {ITEM_CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {condition}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="item-image">
          Image URL <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="item-image"
          value={values.imageUrl}
          onChange={update('imageUrl')}
          placeholder="https://example.com/calculator.jpg"
          className={FIELD_CLASS}
        />
        {values.imageUrl.trim() && (
          <img
            src={values.imageUrl}
            alt="Listing preview"
            className="mt-3 h-32 w-full rounded-xl border border-line object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        )}
      </div>

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
