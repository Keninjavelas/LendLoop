import nodemailer from 'nodemailer';

let cached = null;

function textToHtml(text = '') {
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 12px">${escapeBlock(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
  return `<div style="font-family:Inter,system-ui,sans-serif;color:#0F172A;font-size:15px;line-height:1.6">${paragraphs}</div>`;
}

function escapeBlock(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMailer() {
  const from = process.env.MAIL_FROM || 'LendLoop <no-reply@lendloop.local>';
  const driver = (process.env.MAIL_DRIVER || '').trim().toLowerCase();

  if (driver === 'resend' && process.env.RESEND_API_KEY) {
    return {
      driver: 'resend',
      from,
      transport: nodemailer.createTransport({
        host: process.env.RESEND_HOST || 'smtp.resend.com',
        port: Number(process.env.RESEND_PORT || 587),
        secure: String(process.env.RESEND_SECURE) === 'true',
        auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
      }),
    };
  }

  // `preview` is an explicit opt-out of real delivery, so it has to win over a configured
  // SMTP_HOST - otherwise a .env carried over from a real provider would send live mail
  // during a local reminder test.
  if (driver !== 'preview' && process.env.SMTP_HOST) {
    return {
      driver: 'smtp',
      from,
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE) === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      }),
    };
  }

  // No provider configured: render the message and hand it back instead of dropping it,
  // so the whole reminder pipeline stays exercisable without credentials.
  return {
    driver: 'preview',
    from,
    transport: nodemailer.createTransport({ streamTransport: true, buffer: true }),
  };
}

export function getMailer() {
  if (!cached) cached = buildMailer();
  return cached;
}

export function resetMailer() {
  cached = null;
}

export function buildMailtoLink(email, subject, body) {
  if (!email) return '';
  const params = new URLSearchParams({ subject: String(subject ?? ''), body: String(body ?? '') });
  return `mailto:${email}?${params.toString()}`;
}

export async function sendEmail({ to, subject, text, html }) {
  const { driver, from, transport } = getMailer();
  const body = String(text ?? '');

  try {
    const info = await transport.sendMail({
      from,
      to,
      subject,
      text: body,
      html: html ?? textToHtml(body),
    });

    if (driver === 'preview') {
      return {
        status: 'preview',
        provider: 'preview',
        messageId: info.messageId || '',
        error: '',
      };
    }

    return { status: 'sent', provider: driver, messageId: info.messageId || '', error: '' };
  } catch (error) {
    return { status: 'failed', provider: driver, messageId: '', error: error.message || 'Email failed' };
  }
}
