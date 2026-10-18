import { useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import {
  ENTRY_STEPS,
  FIELD_IDS,
  STEP_FIELDS,
  applyCategorySelection,
  applyItemSelection,
  applyPrioritySelection,
  buildPayload,
  createEntryDefaults,
  firstErrorField,
  validateEntry,
  validateStep,
} from '../../utils/lendingEntry.js';
import Button from '../common/Button.jsx';
import EntryStepper from './entry/EntryStepper.jsx';
import ItemStep from './entry/ItemStep.jsx';
import BorrowerStep from './entry/BorrowerStep.jsx';
import TermsStep from './entry/TermsStep.jsx';
import RemindersStep from './entry/RemindersStep.jsx';
import ReviewStep from './entry/ReviewStep.jsx';

export default function LendingEntryForm({
  categories = [],
  items = [],
  onSubmit,
  onCancel,
  submitting = false,
  submitError = '',
}) {
  const { user } = useAuth();
  const [values, setValues] = useState(() => createEntryDefaults(user?.preferences));
  const initialValues = useRef(values);
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState({});
  const [channelsTouched, setChannelsTouched] = useState(false);
  const headingRef = useRef(null);

  const currentStep = ENTRY_STEPS[stepIndex];
  const category = categories.find((entry) => entry._id === values.categoryId) ?? null;
  const errorList = Object.values(errors).filter(Boolean);

  function clearError(field) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function update(field) {
    return (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setValues((current) => ({ ...current, [field]: value }));
      clearError(field);
      if (field === 'frequency') {
        clearError('channels');
        clearError('customOffsets');
      }
      if (field === 'templateMode') clearError('customMessage');
    };
  }

  function handleCategoryChange(categoryId) {
    const nextCategory = categories.find((entry) => entry._id === categoryId) ?? null;
    setValues((current) =>
      applyCategorySelection(current, nextCategory, user?.preferences, channelsTouched),
    );
    clearError('categoryId');
  }

  function handlePriorityChange(priority) {
    setValues((current) =>
      applyPrioritySelection(current, priority, category, user?.preferences, channelsTouched),
    );
    clearError('priority');
  }

  function handleItemLink(itemId) {
    const item = items.find((entry) => entry._id === itemId) ?? null;
    setValues((current) =>
      applyItemSelection(current, item, categories, user?.preferences, channelsTouched),
    );
  }

  function toggleChannel(channel) {
    setChannelsTouched(true);
    setValues((current) => ({
      ...current,
      channels: current.channels.includes(channel)
        ? current.channels.filter((entry) => entry !== channel)
        : [...current.channels, channel],
    }));
    clearError('channels');
  }

  function focusHeading() {
    window.requestAnimationFrame(() => headingRef.current?.focus());
  }

  function focusErrors(nextErrors) {
    const id = firstErrorField(nextErrors);
    window.requestAnimationFrame(() => {
      const target = id ? document.getElementById(id) : null;
      (target ?? headingRef.current)?.focus();
    });
  }

  function advance() {
    const nextErrors = validateStep(currentStep.id, values);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      focusErrors(nextErrors);
      return;
    }
    setErrors({});
    setStepIndex((index) => Math.min(index + 1, ENTRY_STEPS.length - 1));
    focusHeading();
  }

  function handleBack() {
    setErrors({});
    setStepIndex((index) => Math.max(index - 1, 0));
    focusHeading();
  }

  function handleStepSelect(index) {
    if (index >= stepIndex) return;
    setErrors({});
    setStepIndex(index);
    focusHeading();
  }

  // The footer CTA is always a submit button. Switching it from button to submit at the
  // last step lets React reuse the node, so the browser's default action fires after the
  // click handler and saves before the review is ever shown. One submit path avoids that.
  function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    if (currentStep.id !== 'review') {
      advance();
      return;
    }

    const nextErrors = validateEntry(values);
    if (Object.keys(nextErrors).length) {
      const keys = Object.keys(nextErrors);
      const firstStep = ENTRY_STEPS.findIndex((step) =>
        (STEP_FIELDS[step.id] ?? []).some((field) => keys.includes(field)),
      );
      if (firstStep !== -1) setStepIndex(firstStep);
      setErrors(nextErrors);
      focusErrors(nextErrors);
      return;
    }

    setErrors({});
    onSubmit(buildPayload(values));
  }

  function handleCancel() {
    if (submitting) return;
    const dirty = JSON.stringify(values) !== JSON.stringify(initialValues.current);
    if (dirty && !window.confirm('Discard this lending entry? Your details will not be saved.')) {
      return;
    }
    onCancel?.();
  }

  let stepContent = null;
  if (currentStep.id === 'item') {
    stepContent = (
      <ItemStep
        values={values}
        errors={errors}
        update={update}
        onItemLink={handleItemLink}
        onCategoryChange={handleCategoryChange}
        categories={categories}
        items={items}
      />
    );
  } else if (currentStep.id === 'borrower') {
    stepContent = <BorrowerStep values={values} errors={errors} update={update} />;
  } else if (currentStep.id === 'terms') {
    stepContent = (
      <TermsStep
        values={values}
        errors={errors}
        update={update}
        onPriorityChange={handlePriorityChange}
        category={category}
      />
    );
  } else if (currentStep.id === 'reminders') {
    stepContent = (
      <RemindersStep
        values={values}
        errors={errors}
        update={update}
        toggleChannel={toggleChannel}
        category={category}
      />
    );
  } else {
    stepContent = (
      <ReviewStep
        values={values}
        categories={categories}
        items={items}
        onEdit={(stepId) => handleStepSelect(ENTRY_STEPS.findIndex((step) => step.id === stepId))}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <EntryStepper
        steps={ENTRY_STEPS}
        currentIndex={stepIndex}
        onSelect={handleStepSelect}
        disabled={submitting}
      />

      <section className="panel p-4 sm:p-6">
        <header className="border-b border-line pb-4">
          <p className="eyebrow">
            Step {stepIndex + 1} of {ENTRY_STEPS.length}
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-1.5 text-lg font-bold text-ink focus:outline-none"
          >
            {currentStep.title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{currentStep.description}</p>
        </header>

        {submitError && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-relaxed text-danger"
          >
            {submitError}
          </div>
        )}

        {errorList.length > 0 && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
          >
            <p className="text-sm font-semibold text-danger">Check these details</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-danger">
              {errorList.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">{stepContent}</div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Button variant="ghost" onClick={handleCancel} disabled={submitting}>
            Cancel
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="secondary" onClick={handleBack} disabled={submitting}>
                Back
              </Button>
            )}
            <Button type="submit" loading={submitting} disabled={submitting}>
              {currentStep.id === 'review' ? 'Save lending entry' : 'Continue'}
            </Button>
          </div>
        </footer>
      </section>
    </form>
  );
}
