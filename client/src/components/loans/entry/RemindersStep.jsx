import {
  CheckRow,
  Field,
  FormSection,
  LABEL_CLASS,
  fieldAria,
  fieldClass,
} from '../../common/Field.jsx';
import {
  CHANNEL_LABELS,
  FREQUENCY_LABELS,
  REMINDER_CHANNELS,
  REMINDER_FREQUENCIES,
  TEMPLATE_MODES,
  TEMPLATE_MODE_LABELS,
  offsetLabel,
  priorityLabel,
} from '../../../utils/constants.js';
import {
  channelReadiness,
  parseOffsets,
  reminderPlan,
} from '../../../utils/lendingEntry.js';
import { cn } from '../../../utils/cn.js';

const CHANNEL_HELP = {
  email: 'Submitted through the configured provider, or saved as a preview when no provider is configured.',
  whatsapp: 'Generates a prefilled wa.me chat for you to send. LendLoop never records a link as delivered.',
};

export default function RemindersStep({ values, errors, update, toggleChannel, category }) {
  const readiness = channelReadiness(values);
  const selectedUnready = readiness.filter((entry) => entry.selected && !entry.ready);
  const readyChannels = readiness.filter((entry) => entry.selected && entry.ready);
  const plan = reminderPlan(values, category);
  const offsets = parseOffsets(values.customOffsets);
  const automated = values.remindersEnabled && values.frequency !== 'manual';

  return (
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
          <div
            role="group"
            aria-labelledby="entry-channels-label"
            aria-describedby={errors.channels ? 'entry-channels-error' : 'entry-channels-help'}
          >
            <p id="entry-channels-label" className={LABEL_CLASS}>
              Channels
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {REMINDER_CHANNELS.map((channel) => {
                const state = readiness.find((entry) => entry.channel === channel);
                const suffix = state.selected
                  ? state.ready
                    ? ' Ready for this entry.'
                    : ` Not usable yet: ${state.reason}.`
                  : '';
                return (
                  <CheckRow
                    key={channel}
                    id={`entry-channel-${channel}`}
                    checked={values.channels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                    title={CHANNEL_LABELS[channel]}
                    description={`${CHANNEL_HELP[channel]}${suffix}`}
                  />
                );
              })}
            </div>
            {errors.channels ? (
              <p id="entry-channels-error" role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors.channels}
              </p>
            ) : (
              <p id="entry-channels-help" className="mt-1.5 text-xs leading-relaxed text-muted">
                A channel is only used when the borrower has agreed to it and there is a contact
                detail to reach them on.
              </p>
            )}
            {automated && selectedUnready.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-pending">
                {selectedUnready.map((entry) => CHANNEL_LABELS[entry.channel]).join(' and ')} will be
                skipped until the missing consent or contact details are recorded.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="entry-frequency" label="Reminder frequency" error={errors.frequency}>
              <select
                id="entry-frequency"
                value={values.frequency}
                onChange={update('frequency')}
                className={fieldClass(errors.frequency)}
                {...fieldAria('entry-frequency', { error: errors.frequency })}
              >
                {REMINDER_FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {FREQUENCY_LABELS[frequency]}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="entry-template-mode" label="Message" error={errors.templateMode}>
              <select
                id="entry-template-mode"
                value={values.templateMode}
                onChange={update('templateMode')}
                className={fieldClass(errors.templateMode)}
                {...fieldAria('entry-template-mode', { error: errors.templateMode })}
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
                {...fieldAria('entry-offsets', {
                  error: errors.customOffsets,
                  hint: 'Negative is before, 0 is the deadline itself. The list below previews what that means.',
                })}
              />
              {offsets.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {offsets.map((offset) => (
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
                {...fieldAria('entry-custom-message', {
                  error: errors.customMessage,
                  hint: 'Placeholders like {borrowerName}, {itemName} and {duePhrase} are filled in per entry.',
                })}
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
                {...fieldAria('entry-overdue-interval', {
                  error: errors.overdueIntervalHours,
                  hint: 'Hours between overdue nudges',
                })}
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
                {...fieldAria('entry-overdue-cap', {
                  error: errors.maxOverdueReminders,
                  hint: 'Stops an overdue entry nagging forever',
                })}
              />
            </Field>
          </div>
        </>
      )}

      <div className="rounded-xl border border-line-soft bg-canvas/50 p-4">
        <p className="eyebrow">Effective schedule</p>
        {plan.mode === 'off' && (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Automatic reminders are off. The selected channels and timing are kept, but nothing is
            queued. You can still send a reminder by hand from the loan page.
          </p>
        )}
        {plan.mode === 'manual' && (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Manual only. No automatic messages will be queued; send one from the loan page when you
            need to.
          </p>
        )}
        {plan.mode === 'automatic' && (
          <>
            <p className="mt-2 text-sm font-semibold text-ink">
              {priorityLabel(plan.priority)} priority ·{' '}
              {plan.labels.length ? plan.labels.join(' · ') : 'No reminder days configured yet'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {Number(values.maxOverdueReminders) === 0
                ? 'No overdue reminders will be queued.'
                : `After the deadline, every ${values.overdueIntervalHours} hours, up to ${values.maxOverdueReminders} reminders.`}
            </p>
          </>
        )}
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {readyChannels.length
            ? `Usable channels: ${readyChannels.map((entry) => CHANNEL_LABELS[entry.channel]).join(' and ')}.`
            : 'No selected channel is usable yet.'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Message source: {TEMPLATE_MODE_LABELS[values.templateMode]}. Message text is generated when a
          reminder is queued; saving this entry sends nothing.
        </p>
      </div>
    </FormSection>
  );
}
