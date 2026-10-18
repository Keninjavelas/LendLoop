import {
  CheckRow,
  Field,
  FormSection,
  LABEL_CLASS,
  fieldAria,
  fieldClass,
} from '../../common/Field.jsx';

export default function BorrowerStep({ values, errors, update, linked = false }) {
  return (
    <FormSection
      title="Who has it"
      description={
        linked
          ? 'This entry is linked to an existing LendLoop account, so their identity is verified.'
          : 'Borrowers do not need a LendLoop account. Only you can see these details.'
      }
    >
      {linked && (
        <div className="rounded-lg border border-primary/30 bg-primary-soft px-4 py-3">
          <p className="text-sm font-semibold text-ink">Linked LendLoop account</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            Name, email and number come from their profile and stay read-only here. Only your own
            lending history with them is used — other lenders' relationships are never visible.
          </p>
        </div>
      )}

      <Field id="entry-borrower" label="Borrower name" error={errors.borrowerName}>
        <input
          id="entry-borrower"
          value={values.borrowerName}
          onChange={update('borrowerName')}
          readOnly={linked}
          placeholder="Rohan Mehta"
          maxLength={100}
          className={fieldClass(errors.borrowerName)}
          {...fieldAria('entry-borrower', { error: errors.borrowerName })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="entry-email"
          label="Borrower email"
          optional
          error={errors.borrowerEmail}
          hint={linked ? 'From their account' : 'Used for email reminders'}
        >
          <input
            id="entry-email"
            type="email"
            value={values.borrowerEmail}
            onChange={update('borrowerEmail')}
            readOnly={linked}
            placeholder="rohan@example.com"
            maxLength={160}
            className={fieldClass(errors.borrowerEmail)}
            {...fieldAria('entry-email', {
              error: errors.borrowerEmail,
              hint: linked ? 'From their account' : 'Used for email reminders',
            })}
          />
        </Field>

        <Field
          id="entry-phone"
          label="WhatsApp number"
          optional
          error={errors.borrowerPhone}
          hint={linked ? 'From their account' : 'With country code, e.g. +919876543210'}
        >
          <input
            id="entry-phone"
            type="tel"
            value={values.borrowerPhone}
            onChange={update('borrowerPhone')}
            readOnly={linked}
            placeholder="+919876543210"
            maxLength={20}
            className={fieldClass(errors.borrowerPhone)}
            {...fieldAria('entry-phone', {
              error: errors.borrowerPhone,
              hint: linked ? 'From their account' : 'With country code, e.g. +919876543210',
            })}
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
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Consent gates delivery: a channel the borrower has not agreed to is never used, whatever the
          priority says.
        </p>
      </div>

      {(values.consentEmail || values.consentWhatsApp) && (
        <Field
          id="entry-consent-note"
          label="Consent note"
          optional
          hint="A short reminder of when and how they agreed."
        >
          <input
            id="entry-consent-note"
            value={values.consentNote}
            onChange={update('consentNote')}
            placeholder="Agreed on the class group chat, 12 Oct"
            maxLength={200}
            className={fieldClass()}
            {...fieldAria('entry-consent-note', {
              hint: 'A short reminder of when and how they agreed.',
            })}
          />
        </Field>
      )}
    </FormSection>
  );
}
