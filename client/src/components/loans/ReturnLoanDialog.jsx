import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getApiMessage } from '../../services/api.js';
import { loanService } from '../../services/loanService.js';
import { cn } from '../../utils/cn.js';
import { fromInputDate, toInputDate } from '../../utils/formatDate.js';
import Button from '../common/Button.jsx';
import { CheckRow, Field, fieldClass } from '../common/Field.jsx';
import Modal from '../common/Modal.jsx';

const FORM_ID = 'return-loan-form';

export default function ReturnLoanDialog({ loan, open, onClose, onReturned }) {
  const [returnDate, setReturnDate] = useState('');
  const [note, setNote] = useState('');
  const [borrowerConfirmed, setBorrowerConfirmed] = useState(false);
  const [dateError, setDateError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !loan) return;
    setReturnDate(toInputDate(new Date()));
    setNote('');
    setBorrowerConfirmed(false);
    setDateError('');
    setSubmitError('');
  }, [open, loan]);

  if (!open || !loan) return null;

  const today = toInputDate(new Date());
  const lentDate = loan.lentAt ? toInputDate(new Date(loan.lentAt)) : undefined;

  function handleClose() {
    if (!saving) onClose?.();
  }

  function handleDateChange(event) {
    setReturnDate(event.target.value);
    setDateError('');
    setSubmitError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');

    const selected = fromInputDate(returnDate);
    if (!selected) {
      setDateError('Choose the date the item came back');
      return;
    }

    const currentToday = toInputDate(new Date());
    if (returnDate > currentToday) {
      setDateError('Return date cannot be in the future');
      return;
    }
    if (lentDate && returnDate < lentDate) {
      setDateError('Return date cannot be before the lending date');
      return;
    }

    // A same-day return uses the current time. Earlier dates use local noon so converting
    // to UTC cannot slide the chosen date back or forward by a day.
    let returnedAt;
    if (returnDate === currentToday) {
      returnedAt = new Date().toISOString();
    } else {
      selected.setHours(12, 0, 0, 0);
      returnedAt = selected.toISOString();
    }

    setSaving(true);
    try {
      const returned = await loanService.markReturned(loan._id, {
        returnedAt,
        note: note.trim(),
        borrowerConfirmedReturn: borrowerConfirmed,
      });
      toast.success('Return confirmed');
      onReturned?.(returned);
    } catch (error) {
      const message = getApiMessage(error, 'Could not confirm that return');
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="md"
      title="Confirm return"
      description="Record when the item came back and anything worth remembering."
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="success" type="submit" form={FORM_ID} loading={saving}>
            {!saving && <Check className="h-4 w-4" aria-hidden="true" />}
            Confirm return
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5" noValidate>
        <p className="text-sm leading-relaxed text-muted">
          Confirm that{' '}
          <span className="font-semibold text-ink">{loan.borrower?.name ?? 'the borrower'}</span>{' '}
          handed back <span className="font-semibold text-ink">{loan.itemName}</span>.
        </p>

        <Field
          id="return-date"
          label="Return date"
          error={dateError}
          hint="The date the item actually came back."
        >
          <input
            id="return-date"
            type="date"
            value={returnDate}
            min={lentDate}
            max={today}
            onChange={handleDateChange}
            aria-invalid={dateError ? 'true' : undefined}
            aria-describedby={dateError ? 'return-date-error' : 'return-date-hint'}
            className={fieldClass(dateError)}
          />
        </Field>

        <Field
          id="return-note"
          label="Return note"
          optional
          hint="Condition, missing accessories, or any handover details."
        >
          <textarea
            id="return-note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setSubmitError('');
            }}
            rows={3}
            maxLength={500}
            placeholder="Came back clean, with the charger and case."
            className={cn(fieldClass(), 'resize-y')}
          />
        </Field>

        <CheckRow
          id="return-borrower-confirmed"
          checked={borrowerConfirmed}
          onChange={(event) => {
            setBorrowerConfirmed(event.target.checked);
            setSubmitError('');
          }}
          title="Borrower confirmed the return"
          description="Saved as your report. LendLoop does not contact or independently verify the borrower."
        />

        <p className="rounded-lg border border-line-soft bg-raised px-3.5 py-3 text-xs leading-relaxed text-muted">
          Returning closes the loan, stops all reminders, and puts any linked listing back on
          your shelf. It cannot be reopened.
        </p>

        {submitError && (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
          >
            {submitError}
          </p>
        )}
      </form>
    </Modal>
  );
}
