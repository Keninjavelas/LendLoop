import { normalisePhone } from '../utils/constants.js';

// Business-initiated WhatsApp delivery needs an approved Meta business setup, recipient
// opt-in and pre-approved templates, so the MVP hands the lender a prefilled chat link
// instead of claiming a send that never happened.
export function buildWhatsAppLink(phone, message) {
  const digits = normalisePhone(phone);
  if (digits.length < 8) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(String(message ?? ''))}`;
}

export async function sendWhatsApp({ phone, message }) {
  const link = buildWhatsAppLink(phone, message);
  if (!link) {
    return {
      status: 'failed',
      provider: 'wa.me',
      link: '',
      error: 'A WhatsApp number with country code is required',
    };
  }

  return { status: 'link', provider: 'wa.me', link, error: '' };
}
