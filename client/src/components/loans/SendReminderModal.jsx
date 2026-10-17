import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Mail, MessageCircle, Send } from 'lucide-react';
import { toast } from 'sonner';
import { getApiMessage } from '../../services/api.js';
import { loanService } from '../../services/loanService.js';
import { CHANNEL_LABELS, TEMPLATE_MODES, TEMPLATE_MODE_LABELS } from '../../utils/constants.js';
import { cn } from '../../utils/cn.js';
import Button from '../common/Button.jsx';
import Modal from '../common/Modal.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { CheckRow, Field, LABEL_CLASS, RadioRow, fieldClass } from '../common/Field.jsx';

const MODE_DESCRIPTIONS = {
  priority: 'Uses the template bound to this entry\'s priority',
  category: 'Uses the template bound to this entry\'s category, falling back to priority',
  custom: 'Uses the message you write here, with placeholders filled in',
};

const STATUS_LABELS = {
  sent: 'Submitted',
  preview: 'Preview only',
  link: 'Link generated',
  failed: 'Failed',
};

// A log status of `link` means LendLoop produced a prefilled wa.me chat and nothing was
// sent; `preview` means no mail provider is configured. `sent` means the provider
// accepted the mail. None of these is a delivery receipt.
const STATUS_HINTS = {
  sent: 'Accepted by the mail provider — delivery confirmation is not tracked',
  preview: 'No mail provider configured — nothing reached the borrower',
  link: 'WhatsApp link generated — nothing is sent until you press Send in WhatsApp',
  failed: 'The provider rejected the message',
};

export default function SendReminderModal({ loan, open, onClose, onSent }) {
  const [mode, setMode] = useState('priority');
  const [message, setMessage] = useState('');
  const [channels, setChannels] = useState([]);
  const [preview, setPreview] = useState(null);
  const [links, setLinks] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const readiness = loan?.channelReadiness ?? [];

  useEffect(() => {
    if (!open || !loan) return;
    setResult(null);
    setPreview(null);
    setLinks(null);
    setPreviewError('');
    setMode(loan.reminders?.templateMode ?? 'priority');
    setMessage(loan.reminders?.customMessage ?? '');
    setChannels(
      loan.deliveryChannels?.length ? [...loan.deliveryChannels] : [...(loan.reminders?.channels ?? [])],
    );
  }, [open, loan]);

  // Live preview, debounced so typing in a custom message does not fire a request per key.
  useEffect(() => {
    if (!open || !loan || result) return undefined;

    let ignore = false;
    const timer = setTimeout(() => {
      setLoadingPreview(true);
      loanService
        .previewReminder(loan._id, { mode, message: mode === 'custom' ? message : undefined })
        .then((data) => {
          if (ignore) return;
          setPreview(data.preview);
          setLinks(data.links ?? null);
          setPreviewError('');
        })
        .catch((error) => {
          if (ignore) return;
          setPreviewError(getApiMessage(error, 'Could not render that preview'));
        })
        .finally(() => {
          if (!ignore) setLoadingPreview(false);
        });
    }, 350);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [open, loan, mode, message, result]);

  function toggleChannel(channel) {
    setChannels((current) =>
      current.includes(channel) ? current.filter((entry) => entry !== channel) : [...current, channel],
    );
  }

  async function copyMessage() {
    if (!preview) return;
    const text = `${preview.subject}\n\n${preview.body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Message copied');
    } catch {
      toast.error('Your browser blocked the clipboard — select the text and copy it manually');
    }
  }

  async function handleSend() {
    if (!loan || !channels.length) return;

    setSending(true);
    try {
      const data = await loanService.sendReminder(loan._id, {
        channels,
        templateMode: mode,
        message: mode === 'custom' ? message : undefined,
      });
      setResult(data);
      data.warnings?.forEach((warning) => toast.warning(warning));
      toast.success(`Reminder logged on ${data.logs.length} channel${data.logs.length === 1 ? '' : 's'}`);
      onSent?.(data);
    } catch (error) {
      toast.error(getApiMessage(error, 'Could not send that reminder'));
    } finally {
      setSending(false);
    }
  }

  const blockedChannels = readiness.filter((entry) => !entry.hasContact).map((entry) => entry.channel);
  const unconsented = readiness.filter(
    (entry) => channels.includes(entry.channel) && !entry.consented && entry.hasContact,
  );

  function renderResult() {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {result.logs.map((log) => (
            <div key={log._id} className="inset-panel p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {log.channel === 'email' ? (
                    <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
                  ) : (
                    <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
                  {CHANNEL_LABELS[log.channel] ?? log.channel}
                  <span className="font-normal text-muted">to {log.recipient}</span>
                </span>
                <StatusBadge status={log.status} label={STATUS_LABELS[log.status] ?? log.status} />
              </div>
              <p className="mt-1.5 text-xs text-muted">{STATUS_HINTS[log.status] ?? ''}</p>
              {log.error && <p className="mt-1.5 text-xs font-medium text-danger">{log.error}</p>}
              {log.link && (
                <a
                  href={log.link}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open the prefilled WhatsApp chat in a new tab"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-success/35 bg-success-soft px-3 py-2 text-sm font-semibold text-success transition-colors hover:bg-success/15"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Open the WhatsApp chat
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          ))}
        </div>

        {result.links?.email && (
          <a
            href={result.links.email}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Or open this as an email draft
          </a>
        )}

        <div className="inset-panel p-3.5">
          <p className="eyebrow">Message text</p>
          <p className="mt-1.5 text-sm font-semibold text-ink">{result.message?.subject}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-muted">{result.message?.body}</p>
        </div>
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={result ? 'Reminder logged' : 'Send a reminder'}
      description={
        result
          ? 'Manual attempts are never deduplicated against the schedule, so this is on top of any automatic reminders.'
          : `${loan?.itemName ?? 'This entry'} · ${loan?.borrower?.name ?? 'the borrower'}`
      }
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} loading={sending} disabled={!channels.length || loadingPreview}>
              {!sending && <Send className="h-4 w-4" aria-hidden="true" />}
              Send reminder
            </Button>
          </>
        )
      }
    >
      {result ? (
        renderResult()
      ) : (
        <div className="space-y-5">
          <div>
            <p className={LABEL_CLASS}>Send on</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {readiness.map((entry) => (
                <CheckRow
                  key={entry.channel}
                  id={`send-channel-${entry.channel}`}
                  checked={channels.includes(entry.channel)}
                  onChange={() => toggleChannel(entry.channel)}
                  disabled={!entry.hasContact}
                  title={CHANNEL_LABELS[entry.channel] ?? entry.channel}
                  description={
                    !entry.hasContact
                      ? `No ${entry.channel === 'email' ? 'email address' : 'WhatsApp number'} recorded`
                      : entry.consented
                        ? 'Consent recorded'
                        : 'Consent not recorded — sending is your call'
                  }
                />
              ))}
            </div>
            {!channels.length && (
              <p className="mt-1.5 text-xs font-medium text-danger">
                Choose at least one channel
                {blockedChannels.length === readiness.length ? ', or add contact details first' : ''}
              </p>
            )}
            {unconsented.length > 0 && (
              <p className="mt-1.5 text-xs font-medium text-pending">
                {unconsented.map((entry) => CHANNEL_LABELS[entry.channel]).join(' and ')} will be used
                without recorded consent. It is logged, but it is on you.
              </p>
            )}
          </div>

          <div>
            <p className={LABEL_CLASS}>Message</p>
            <div className="space-y-2">
              {TEMPLATE_MODES.map((entry) => (
                <RadioRow
                  key={entry}
                  name="reminder-mode"
                  value={entry}
                  checked={mode === entry}
                  onChange={() => setMode(entry)}
                  title={TEMPLATE_MODE_LABELS[entry]}
                  description={MODE_DESCRIPTIONS[entry]}
                />
              ))}
            </div>
          </div>

          {mode === 'custom' && (
            <Field
              id="send-custom-message"
              label="Your message"
              hint="Placeholders such as {borrowerName}, {itemName} and {duePhrase} are filled in below."
            >
              <textarea
                id="send-custom-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="Hi {borrowerName}, a quick nudge that {itemName} is {duePhrase}."
                className={cn(fieldClass(), 'resize-y')}
              />
            </Field>
          )}

          <div className="inset-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow">
                Preview
                {preview?.templateName ? ` · ${preview.templateName}` : ''}
              </p>
              <Button variant="ghost" size="sm" onClick={copyMessage} disabled={!preview}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy
              </Button>
            </div>

            {loadingPreview ? (
              <p className="mt-3 text-sm text-muted">Rendering…</p>
            ) : previewError ? (
              <p className="mt-3 text-sm font-medium text-danger">{previewError}</p>
            ) : preview ? (
              <div className="mt-3">
                <p className="text-sm font-semibold text-ink">{preview.subject}</p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted">
                  {preview.body}
                </p>
              </div>
            ) : null}

            {!loadingPreview && preview && (links?.email || links?.whatsapp) && (
              <div className="mt-4 flex flex-wrap gap-3 border-t border-line-soft pt-3">
                {links.email && (
                  <a
                    href={links.email}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    Open as an email draft
                  </a>
                )}
                {links.whatsapp && (
                  <a
                    href={links.whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open this message in WhatsApp in a new tab"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Open in WhatsApp
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
                <span className="w-full text-xs text-muted">
                  Opening a draft yourself delivers the same text without logging a send.
                </span>
              </div>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted">
            Nothing is deduplicated here: a manual reminder is logged separately from the scheduled
            slots, so sending one does not cancel anything the scheduler still owes.
          </p>
        </div>
      )}
    </Modal>
  );
}
