import { useMemo, useState } from 'react';
import {
  CHANNEL_LABELS,
  FREQUENCY_LABELS,
  PRIORITY_SCHEDULES,
  PRIORITIES,
  REMINDER_CHANNELS,
  REMINDER_FREQUENCIES,
  TEMPLATE_MODES,
  TEMPLATE_MODE_LABELS,
  offsetLabel,
  priorityLabel,
  priorityScheduleSummary,
} from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';
import { fromInputDate, toInputDate, tomorrowInputDate } from '../../utils/formatDate.js';
import { useAuth } from '../../hooks/useAuth.js';
import Button from '../common/Button.jsx';
import { CheckRow, Field, FormSection, LABEL_CLASS, fieldClass } from '../common/Field.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DAY_MS = 86400000;

// The stock preferences mirror the medium-priority defaults. Only a deliberate change
// in Settings overrides the priority-driven channel presets, so existing accounts keep
// the behaviour they had before preferences existed.
function preferredChannels(preferences) {
  if (!preferences) return [];
  const untouched =
    preferences.defaultReminderChannel === 'email' &&
    preferences.emailNotifications === true &&
    preferences.whatsappNotifications === false;
  if (untouched) return [];

  const enabled = [];
  if (preferences.emailNotifications) enabled.push('email');
  if (preferences.whatsappNotifications) enabled.push('whatsapp');
  if (!enabled.length) return [];

  const preferred = preferences.defaultReminderChannel;
  return enabled.includes(preferred)
    ? [preferred, ...enabled.filter((channel) => channel !== preferred)]
    : enabled;
}

function initialChannels(priority, preferences) {
  const preferred = preferredChannels(preferences);
  return preferred.length ? preferred : [...(PRIORITY_SCHEDULES[priority]?.channels ?? ['email'])];
}

export default function LendingEntryForm({ categories = [], items = [], onSubmit, onCancel, submitting = false }) {
  const { user } = useAuth();
  const [values, setValues] = useState({
    itemId: '',
    itemName: '',
    description: '',
    categoryId: '',
    borrowerName: '',
    borrowerEmail: '',
    borrowerPhone: '',
    consentEmail: false,
    consentWhatsApp: false,
    consentNote: '',
    lentAt: toInputDate(new Date()),
    dueDate: tomorrowInputDate(),
    priority: 'category-default',
    channels: initialChannels('medium', user?.preferences),
    remindersEnabled: true,
    frequency: 'daily',
    customOffsets: '-3, -1, 0',
    templateMode: 'priority',
    customMessage: '',
    notes: '',
    overdueIntervalHours: 48,
    maxOverdueReminders: 5,
  });
  const [errors, setErrors] = useState({});
  // Once the lender has hand-picked channels, a later priority change must not overwrite them.
  const [channelsTouched, setChannelsTouched] = useState(false);

  const category = useMemo(
    () => categories.find((entry) => entry._id === values.categoryId) ?? null,
    [categories, values.categoryId],
  );

  const resolvedPriority =
    values.priority === 'category-default' ? category?.defaultPriority ?? 'medium' : values.priority;

  function update(field) {
    return (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
    };
  }

  function handlePriorityChange(event) {
    const priority = event.target.value;
    setValues((prev) => ({
      ...prev,
      priority,
      channels: channelsTouched ? prev.channels : initialChannels(priority === 'category-default'
        ? category?.defaultPriority ?? 'medium'
        : priority, user?.preferences),
    }));
  }

  function handleCategoryChange(event) {
    const categoryId = event.target.value;
    const next = categories.find((entry) => entry._id === categoryId);
    setValues((prev) => ({
      ...prev,
      categoryId,
      channels:
        channelsTouched || prev.priority !== 'category-default'
          ? prev.channels
          : initialChannels(next?.defaultPriority ?? 'medium', user?.preferences),
    }));
  }

  // Linking a listed item drives its availability, so it prefills what the listing already knows.
  function handleItemLink(event) {
    const itemId = event.target.value;
    const linked = items.find((entry) => entry._id === itemId);
    setValues((prev) => ({
      ...prev,
      itemId,
      itemName: linked ? linked.title : prev.itemName,
      description: linked ? linked.description || prev.description : prev.description,
      categoryId: linked?.categoryId ? linked.categoryId._id ?? linked.categoryId : prev.categoryId,
    }));
  }

  function toggleChannel(channel) {
    setChannelsTouched(true);
    setValues((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((entry) => entry !== channel)
        : [...prev.channels, channel],
    }));
  }

  function parseOffsets() {
    return String(values.customOffsets)
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((part) => Number.isFinite(part));
  }

  function validate() {
    const next = {};

    if (values.itemName.trim().length < 2) next.itemName = 'Give the item a name';
    if (!values.categoryId) next.categoryId = 'Choose a category';
    if (values.borrowerName.trim().length < 2) next.borrowerName = 'Who has the item?';
    if (values.borrowerEmail.trim() && !EMAIL_PATTERN.test(values.borrowerEmail.trim())) {
      next.borrowerEmail = 'That does not look like an email address';
    }
    if (values.borrowerPhone.trim() && values.borrowerPhone.replace(/\D/g, '').length < 8) {
      next.borrowerPhone = 'Include the country code, e.g. +919876543210';
    }

    const lent = fromInputDate(values.lentAt);
    const due = fromInputDate(values.dueDate);
    if (!lent) next.lentAt = 'Pick the day it went out';
    if (!due) next.dueDate = 'Pick the day it is due back';
    if (lent && due && due.getTime() <= lent.getTime()) {
      next.dueDate = 'The deadline must fall after the lending date';
    }

    if (values.remindersEnabled && values.frequency !== 'manual' && !values.channels.length) {
      next.channels = 'Pick at least one channel, or switch reminders to manual only';
    }
    if (values.frequency === 'custom' && !parseOffsets().length) {
      next.customOffsets = 'List at least one day offset, e.g. -3, -1, 0';
    }
    if (values.templateMode === 'custom' && !values.customMessage.trim()) {
      next.customMessage = 'Write the message you want sent';
    }
    if (Number(values.overdueIntervalHours) < 1) next.overdueIntervalHours = 'At least one hour';
    if (Number(values.maxOverdueReminders) < 0 || Number(values.maxOverdueReminders) > 50) {
      next.maxOverdueReminders = 'Between 0 and 50';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!validate()) return;

    const lent = fromInputDate(values.lentAt);
    const due = fromInputDate(values.dueDate);

    onSubmit({
      itemName: values.itemName.trim(),
      description: values.description.trim(),
      categoryId: values.categoryId,
      itemId: values.itemId || null,
      borrower: {
        name: values.borrowerName.trim(),
        email: values.borrowerEmail.trim().toLowerCase(),
        phone: values.borrowerPhone.trim(),
        consent: {
          email: values.consentEmail,
          whatsapp: values.consentWhatsApp,
          note: values.consentNote.trim(),
        },
      },
      lentAt: lent.toISOString(),
      dueDate: due.toISOString(),
      priority: values.priority,
      notes: values.notes.trim(),
      reminders: {
        enabled: values.remindersEnabled,
        channels: values.channels,
        frequency: values.frequency,
        templateMode: values.templateMode,
        customMessage: values.customMessage.trim(),
        customOffsetsDays: values.frequency === 'custom' ? parseOffsets() : [],
        overdueIntervalHours: Number(values.overdueIntervalHours),
        maxOverdueReminders: Number(values.maxOverdueReminders),
      },
    });
  }

  const automated = values.remindersEnabled && values.frequency !== 'manual';
  const channelWarnings = REMINDER_CHANNELS.filter((channel) => {
    if (!values.channels.includes(channel)) return false;
    if (channel === 'email') return !values.consentEmail || !EMAIL_PATTERN.test(values.borrowerEmail.trim());
    return !values.consentWhatsApp || values.borrowerPhone.replace(/\D/g, '').length < 8;
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <FormSection
        title="What went out"
        description="Link one of your listings to keep its availability in sync, or record something you never listed."
      >
        {items.length > 0 && (
          <Field id="entry-item-link" label="From your listings" optional>
            <select
              id="entry-item-link"
              value={values.itemId}
              onChange={handleItemLink}
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
        )}

        <Field id="entry-item-name" label="Item name" error={errors.itemName}>
          <input
            id="entry-item-name"
            value={values.itemName}
            onChange={update('itemName')}
            placeholder="Scientific calculator"
            maxLength={120}
            className={fieldClass(errors.itemName)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="entry-category" label="Category" error={errors.categoryId}>
            <select
              id="entry-category"
              value={values.categoryId}
              onChange={handleCategoryChange}
              className={fieldClass(errors.categoryId)}
            >
              <option value="" disabled>
                Select a category
              </option>
              {categories.map((entry) => (
                <option key={entry._id} value={entry._id}>
                  {entry.name} · {priorityLabel(entry.defaultPriority)} by default
                </option>
              ))}
            </select>
          </Field>

          <Field
            id="entry-priority"
            label="Priority"
            hint={priorityScheduleSummary(resolvedPriority) && `Reminds ${priorityScheduleSummary(resolvedPriority).toLowerCase()}`}
          >
            <select
              id="entry-priority"
              value={values.priority}
              onChange={handlePriorityChange}
              className={fieldClass()}
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
        </div>

        <Field id="entry-description" label="Description" optional>
          <textarea
            id="entry-description"
            value={values.description}
            onChange={update('description')}
            rows={2}
            maxLength={1000}
            placeholder="Serial number, accessories that went with it, anything to check on return"
            className={cn(fieldClass(), 'resize-y')}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Who has it"
        description="Borrowers do not need a LendLoop account. Contact details are optional, but a channel without them cannot be used."
      >
        <Field id="entry-borrower" label="Borrower name" error={errors.borrowerName}>
          <input
            id="entry-borrower"
            value={values.borrowerName}
            onChange={update('borrowerName')}
            placeholder="Rohan Mehta"
            maxLength={100}
            className={fieldClass(errors.borrowerName)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="entry-email"
            label="Borrower email"
            optional
            error={errors.borrowerEmail}
            hint="Used for email reminders"
          >
            <input
              id="entry-email"
              type="email"
              value={values.borrowerEmail}
              onChange={update('borrowerEmail')}
              placeholder="rohan@example.com"
              maxLength={160}
              className={fieldClass(errors.borrowerEmail)}
            />
          </Field>

          <Field
            id="entry-phone"
            label="WhatsApp number"
            optional
            error={errors.borrowerPhone}
            hint="With country code, e.g. +919876543210"
          >
            <input
              id="entry-phone"
              type="tel"
              value={values.borrowerPhone}
              onChange={update('borrowerPhone')}
              placeholder="+919876543210"
              maxLength={20}
              className={fieldClass(errors.borrowerPhone)}
            />
          </Field>
        </div>

        <div>
          <p className={LABEL_CLASS}>Borrower agreed to reminders on</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckRow
              id="entry-consent-email"
              checked={values.consentEmail}
              onChange={update('consentEmail')}
              title="Email"
              description="They said yes to deadline emails"
            />
            <CheckRow
              id="entry-consent-whatsapp"
              checked={values.consentWhatsApp}
              onChange={update('consentWhatsApp')}
              title="WhatsApp"
              description="They said yes to WhatsApp nudges"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Consent gates delivery: a channel the borrower has not agreed to is never used, whatever the
            priority says.
          </p>
        </div>

        {(values.consentEmail || values.consentWhatsApp) && (
          <Field id="entry-consent-note" label="Consent note" optional>
            <input
              id="entry-consent-note"
              value={values.consentNote}
              onChange={update('consentNote')}
              placeholder="Agreed on the class group chat, 12 Oct"
              maxLength={200}
              className={fieldClass()}
            />
          </Field>
        )}
      </FormSection>

      <FormSection title="When it goes back">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="entry-lent" label="Lending date" error={errors.lentAt}>
            <input
              id="entry-lent"
              type="date"
              value={values.lentAt}
              onChange={update('lentAt')}
              className={fieldClass(errors.lentAt)}
            />
          </Field>

          <Field id="entry-due" label="Return deadline" error={errors.dueDate}>
            <input
              id="entry-due"
              type="date"
              value={values.dueDate}
              onChange={update('dueDate')}
              className={fieldClass(errors.dueDate)}
            />
          </Field>
        </div>

        {fromInputDate(values.lentAt) && fromInputDate(values.dueDate) && (
          <p className="text-xs text-muted">
            Out for{' '}
            <span className="font-semibold text-ink">
              {Math.max(
                0,
                Math.round(
                  (fromInputDate(values.dueDate).getTime() - fromInputDate(values.lentAt).getTime()) / DAY_MS,
                ),
              )}{' '}
              days
            </span>
            . A backdated entry is fine — it simply starts life overdue, and stale reminders are never
            dumped on the borrower.
          </p>
        )}
      </FormSection>

      <FormSection
        title="Reminders"
        description="Priority sets the timing; you stay in control of whether anything is sent at all."
      >
        <CheckRow
          id="entry-reminders-enabled"
          checked={values.remindersEnabled}
          onChange={update('remindersEnabled')}
          title="Send automatic reminders"
          description="Turn this off to keep the schedule but silence the entry — you can still send reminders by hand."
        />

        {values.remindersEnabled && (
          <>
            <div>
              <p className={LABEL_CLASS}>Channels</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {REMINDER_CHANNELS.map((channel) => (
                  <CheckRow
                    key={channel}
                    id={`entry-channel-${channel}`}
                    checked={values.channels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                    title={CHANNEL_LABELS[channel]}
                    description={
                      channel === 'email'
                        ? 'Email through your configured provider (preview otherwise)'
                        : 'Opens a prefilled wa.me chat for you to send'
                    }
                  />
                ))}
              </div>
              {errors.channels && (
                <p className="mt-1.5 text-xs font-medium text-danger">{errors.channels}</p>
              )}
              {automated && channelWarnings.length > 0 && (
                <p className="mt-1.5 text-xs font-medium text-pending">
                  {channelWarnings.map((channel) => CHANNEL_LABELS[channel]).join(' and ')} selected, but
                  consent or contact details are missing — that channel will be skipped.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="entry-frequency" label="Reminder frequency">
                <select
                  id="entry-frequency"
                  value={values.frequency}
                  onChange={update('frequency')}
                  className={fieldClass()}
                >
                  {REMINDER_FREQUENCIES.map((frequency) => (
                    <option key={frequency} value={frequency}>
                      {FREQUENCY_LABELS[frequency]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field id="entry-template-mode" label="Message">
                <select
                  id="entry-template-mode"
                  value={values.templateMode}
                  onChange={update('templateMode')}
                  className={fieldClass()}
                >
                  {TEMPLATE_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {TEMPLATE_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {values.frequency === 'custom' && (
              <Field
                id="entry-offsets"
                label="Days relative to the deadline"
                error={errors.customOffsets}
                hint="Negative is before, 0 is the deadline itself. The list below previews what that means."
              >
                <input
                  id="entry-offsets"
                  value={values.customOffsets}
                  onChange={update('customOffsets')}
                  placeholder="-3, -1, 0"
                  className={fieldClass(errors.customOffsets)}
                />
                {parseOffsets().length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {parseOffsets()
                      .slice()
                      .sort((a, b) => a - b)
                      .map((offset) => (
                        <li
                          key={offset}
                          className="rounded-md bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-line"
                        >
                          {offsetLabel(offset)}
                        </li>
                      ))}
                  </ul>
                )}
              </Field>
            )}

            {values.templateMode === 'custom' && (
              <Field
                id="entry-custom-message"
                label="Custom message"
                error={errors.customMessage}
                hint="Placeholders like {borrowerName}, {itemName} and {duePhrase} are filled in per entry."
              >
                <textarea
                  id="entry-custom-message"
                  value={values.customMessage}
                  onChange={update('customMessage')}
                  rows={4}
                  maxLength={1000}
                  placeholder="Hi {borrowerName}, a quick nudge that {itemName} is {duePhrase}."
                  className={cn(fieldClass(errors.customMessage), 'resize-y')}
                />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="entry-overdue-interval"
                label="Once overdue, remind every"
                error={errors.overdueIntervalHours}
                hint="Hours between overdue nudges"
              >
                <input
                  id="entry-overdue-interval"
                  type="number"
                  min={1}
                  max={720}
                  value={values.overdueIntervalHours}
                  onChange={update('overdueIntervalHours')}
                  className={fieldClass(errors.overdueIntervalHours)}
                />
              </Field>

              <Field
                id="entry-overdue-cap"
                label="Overdue reminder limit"
                error={errors.maxOverdueReminders}
                hint="Stops an overdue entry nagging forever"
              >
                <input
                  id="entry-overdue-cap"
                  type="number"
                  min={0}
                  max={50}
                  value={values.maxOverdueReminders}
                  onChange={update('maxOverdueReminders')}
                  className={fieldClass(errors.maxOverdueReminders)}
                />
              </Field>
            </div>
          </>
        )}
      </FormSection>

      <Field id="entry-notes" label="Notes" optional>
        <textarea
          id="entry-notes"
          value={values.notes}
          onChange={update('notes')}
          rows={3}
          maxLength={1000}
          placeholder="Only visible to you — where it was handed over, what condition it left in"
          className={cn(fieldClass(), 'resize-y')}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          Save lending entry
        </Button>
      </div>
    </form>
  );
}
