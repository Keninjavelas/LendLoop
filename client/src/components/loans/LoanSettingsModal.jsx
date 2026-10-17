import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getApiMessage } from '../../services/api.js';
import { loanService } from '../../services/loanService.js';
import {
  CHANNEL_LABELS,
  FREQUENCY_LABELS,
  REMINDER_CHANNELS,
  REMINDER_FREQUENCIES,
  TEMPLATE_MODES,
  TEMPLATE_MODE_LABELS,
  offsetLabel,
} from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import { CheckRow, Field, FormSection, LABEL_CLASS, fieldClass } from '../common/Field.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseOffsets(raw) {
  return String(raw)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
}

export default function LoanSettingsModal({ loan, open, onClose, onSaved }) {
  const [values, setValues] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !loan) {
      return;
    }
    const reminders = loan.reminders ?? {};
    setValues({
      borrowerName: loan.borrower?.name ?? '',
      borrowerEmail: loan.borrower?.email ?? '',
      borrowerPhone: loan.borrower?.phone ?? '',
      consentEmail: loan.borrower?.consent?.email === true,
      consentWhatsApp: loan.borrower?.consent?.whatsapp === true,
      consentNote: loan.borrower?.consent?.note ?? '',
      enabled: reminders.enabled !== false,
      channels: [...(reminders.channels ?? [])],
      frequency: reminders.frequency ?? 'daily',
      templateMode: reminders.templateMode ?? 'priority',
      customMessage: reminders.customMessage ?? '',
      customOffsets: (reminders.customOffsetsDays ?? []).join(', ') || '-3, -1, 0',
      overdueIntervalHours: reminders.overdueIntervalHours ?? 48,
      maxOverdueReminders: reminders.maxOverdueReminders ?? 5,
      notes: loan.notes ?? '',
      description: loan.description ?? '',
    });
    setErrors({});
  }, [open, loan]);

  if (!open || !loan || !values) return null;

  function update(field) {
    return (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));
    };
  }

  function toggleChannel(channel) {
    setValues((prev) => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter((entry) => entry !== channel)
        : [...prev.channels, channel],
    }));
  }

  function validate() {
    const next = {};
    if (values.borrowerName.trim().length < 2) next.borrowerName = 'The borrower needs a name';
    if (values.borrowerEmail.trim() && !EMAIL_PATTERN.test(values.borrowerEmail.trim())) {
      next.borrowerEmail = 'That does not look like an email address';
    }
    if (values.borrowerPhone.trim() && values.borrowerPhone.replace(/\D/g, '').length < 8) {
      next.borrowerPhone = 'Include the country code, e.g. +919876543210';
    }
    if (values.enabled && values.frequency !== 'manual' && !values.channels.length) {
      next.channels = 'Pick at least one channel, or switch reminders off';
    }
    if (values.frequency === 'custom' && !parseOffsets(values.customOffsets).length) {
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

  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    try {
      const data = await loanService.updateSettings(loan._id, {
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
        reminders: {
          enabled: values.enabled,
          channels: values.channels,
          frequency: values.frequency,
          templateMode: values.templateMode,
          customMessage: values.customMessage.trim(),
          customOffsetsDays: values.frequency === 'custom' ? parseOffsets(values.customOffsets) : [],
          overdueIntervalHours: Number(values.overdueIntervalHours),
          maxOverdueReminders: Number(values.maxOverdueReminders),
        },
        notes: values.notes.trim(),
        description: values.description.trim(),
      });

      data.warnings?.forEach((warning) => toast.warning(warning));
      toast.success('Settings saved');
      onSaved?.(data.loan);
      onClose?.();
    } catch (error) {
      toast.error(getApiMessage(error, 'Could not save those settings'));
    } finally {
      setSaving(false);
    }
  }

  const readiness = loan.channelReadiness ?? [];
  const automated = values.enabled && values.frequency !== 'manual';

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      size="lg"
      title="Reminder and borrower settings"
      description={loan.itemName}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Save settings
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormSection
          title="Automatic reminders"
          description="The kill switch silences this entry without losing its schedule — manual reminders still work."
        >
          <CheckRow
            id="settings-enabled"
            checked={values.enabled}
            onChange={update('enabled')}
            title="Automatic reminders on"
            description={
              automated
                ? 'The scheduler walks this entry on its priority schedule'
                : 'Nothing will be sent on its own'
            }
          />

          {values.enabled && (
            <>
              <div>
                <p className={LABEL_CLASS}>Channels</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {REMINDER_CHANNELS.map((channel) => {
                    const state = readiness.find((entry) => entry.channel === channel);
                    return (
                      <CheckRow
                        key={channel}
                        id={`settings-channel-${channel}`}
                        checked={values.channels.includes(channel)}
                        onChange={() => toggleChannel(channel)}
                        title={CHANNEL_LABELS[channel]}
                        description={
                          !state?.hasContact
                            ? `No ${channel === 'email' ? 'email address' : 'WhatsApp number'} recorded`
                            : state.consented
                              ? 'Consent recorded'
                              : 'Consent not recorded — the scheduler will skip this channel'
                        }
                      />
                    );
                  })}
                </div>
                {errors.channels && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{errors.channels}</p>
                )}
                {automated && !loan.deliveryChannels?.length && (
                  <p className="mt-1.5 text-xs font-medium text-pending">
                    No channel is usable yet, so the scheduler will keep skipping this entry until
                    consent and contact details line up.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="settings-frequency" label="Frequency">
                  <select
                    id="settings-frequency"
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

                <Field id="settings-template-mode" label="Message">
                  <select
                    id="settings-template-mode"
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
                  id="settings-offsets"
                  label="Days relative to the deadline"
                  error={errors.customOffsets}
                  hint="Negative is before, 0 is the deadline itself."
                >
                  <input
                    id="settings-offsets"
                    value={values.customOffsets}
                    onChange={update('customOffsets')}
                    placeholder="-3, -1, 0"
                    className={fieldClass(errors.customOffsets)}
                  />
                  {parseOffsets(values.customOffsets).length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {parseOffsets(values.customOffsets)
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
                  id="settings-custom-message"
                  label="Custom message"
                  error={errors.customMessage}
                  hint="Placeholders such as {borrowerName}, {itemName} and {duePhrase} are filled in per entry."
                >
                  <textarea
                    id="settings-custom-message"
                    value={values.customMessage}
                    onChange={update('customMessage')}
                    rows={4}
                    maxLength={1000}
                    className={cn(fieldClass(errors.customMessage), 'resize-y')}
                  />
                </Field>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="settings-overdue-interval"
                  label="Once overdue, remind every"
                  error={errors.overdueIntervalHours}
                  hint="Hours between overdue nudges"
                >
                  <input
                    id="settings-overdue-interval"
                    type="number"
                    min={1}
                    max={720}
                    value={values.overdueIntervalHours}
                    onChange={update('overdueIntervalHours')}
                    className={fieldClass(errors.overdueIntervalHours)}
                  />
                </Field>

                <Field
                  id="settings-overdue-cap"
                  label="Overdue reminder limit"
                  error={errors.maxOverdueReminders}
                  hint="Stops an overdue entry nagging forever"
                >
                  <input
                    id="settings-overdue-cap"
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

        <FormSection
          title="Borrower"
          description="Consent gates delivery. Recording it here arms the matching channel; withdrawing it disarms it."
        >
          <Field id="settings-borrower" label="Name" error={errors.borrowerName}>
            <input
              id="settings-borrower"
              value={values.borrowerName}
              onChange={update('borrowerName')}
              maxLength={100}
              className={fieldClass(errors.borrowerName)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="settings-email" label="Email" optional error={errors.borrowerEmail}>
              <input
                id="settings-email"
                type="email"
                value={values.borrowerEmail}
                onChange={update('borrowerEmail')}
                maxLength={160}
                className={fieldClass(errors.borrowerEmail)}
              />
            </Field>

            <Field id="settings-phone" label="WhatsApp number" optional error={errors.borrowerPhone}>
              <input
                id="settings-phone"
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
            <p className={LABEL_CLASS}>Agreed to reminders on</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckRow
                id="settings-consent-email"
                checked={values.consentEmail}
                onChange={update('consentEmail')}
                title="Email"
                description="They said yes to deadline emails"
              />
              <CheckRow
                id="settings-consent-whatsapp"
                checked={values.consentWhatsApp}
                onChange={update('consentWhatsApp')}
                title="WhatsApp"
                description="They said yes to WhatsApp nudges"
              />
            </div>
          </div>

          <Field id="settings-consent-note" label="Consent note" optional>
            <input
              id="settings-consent-note"
              value={values.consentNote}
              onChange={update('consentNote')}
              maxLength={200}
              placeholder="Agreed on the class group chat, 12 Oct"
              className={fieldClass()}
            />
          </Field>
        </FormSection>

        <FormSection title="Details">
          <Field id="settings-description" label="Description" optional>
            <textarea
              id="settings-description"
              value={values.description}
              onChange={update('description')}
              rows={2}
              maxLength={1000}
              className={cn(fieldClass(), 'resize-y')}
            />
          </Field>

          <Field id="settings-notes" label="Notes" optional hint="Only visible to you.">
            <textarea
              id="settings-notes"
              value={values.notes}
              onChange={update('notes')}
              rows={3}
              maxLength={1000}
              className={cn(fieldClass(), 'resize-y')}
            />
          </Field>
        </FormSection>
      </div>
    </Modal>
  );
}
