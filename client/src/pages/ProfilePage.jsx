import {
  Boxes,
  ChevronRight,
  Inbox,
  LogOut,
  Mail,
  Package,
  Phone,
  RefreshCw,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import {
  LABEL_CLASS,
  READONLY_FIELD_CLASS,
  fieldClass,
} from '../components/common/Field.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { getApiMessage } from '../services/api.js';
import { authService } from '../services/authService.js';
import { itemService } from '../services/itemService.js';
import { loanService } from '../services/loanService.js';
import { formatDate } from '../utils/formatDate.js';

const QUICK_LINKS = [
  {
    to: '/my-items',
    label: 'My Items',
    description: 'Edit or remove your listings',
    icon: Package,
  },
  {
    to: '/requests',
    label: 'Requests',
    description: 'Incoming and outgoing borrows',
    icon: Inbox,
  },
  {
    to: '/loans',
    label: 'Loans',
    description: 'Due dates, returns and history',
    icon: RefreshCw,
  },
];

const MAX_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 24;

function initialsOf(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '?'
  );
}

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => ({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [counts, setCounts] = useState(null);

  // Re-seed only when the signed-in account changes, never on every profile save,
  // so an in-progress edit is not wiped underneath the user.
  const userId = user?._id ?? '';
  useEffect(() => {
    if (!userId) return;
    setForm({ name: user?.name ?? '', phone: user?.phone ?? '' });
    // `user` is read from the closure on purpose: depending on the whole object would
    // re-seed after every save and discard what the user is typing.
  }, [userId]);

  // Nice-to-have context: the profile form has to render even when these calls fail,
  // so the error is swallowed and the summary falls back to placeholders.
  useEffect(() => {
    let ignore = false;

    Promise.all([itemService.mine(), loanService.list({})])
      .then(([myItems, allLoans]) => {
        if (ignore) return;
        const listings = Array.isArray(myItems) ? myItems : [];
        setCounts({
          listings: listings.length,
          available: listings.filter((item) => item.status === 'available').length,
          loans: Array.isArray(allLoans) ? allLoans.length : 0,
        });
      })
      .catch(() => {
        if (!ignore) setCounts(null);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const dirty =
    form.name.trim() !== (user?.name ?? '').trim() ||
    form.phone.trim() !== (user?.phone ?? '').trim();

  function update(field) {
    return (event) => {
      const { value } = event.target;
      setForm((current) => ({ ...current, [field]: value }));
      setErrors((current) => ({ ...current, [field]: '' }));
      setFormError('');
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const name = form.name.trim();
    const phone = form.phone.trim();

    const nextErrors = {};
    if (!name) {
      nextErrors.name = 'Name is required';
    } else if (name.length < 2) {
      nextErrors.name = 'Name must be at least 2 characters';
    } else if (name.length > MAX_NAME_LENGTH) {
      nextErrors.name = `Name must be at most ${MAX_NAME_LENGTH} characters`;
    }
    if (phone.length > MAX_PHONE_LENGTH) {
      nextErrors.phone = `Phone number must be at most ${MAX_PHONE_LENGTH} characters`;
    }

    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const result = await authService.updateProfile({ name, phone });
      setUser(result);
      // Adopt the server-normalised values so the dirty check settles immediately.
      setForm({ name: result?.name ?? name, phone: result?.phone ?? phone });
      toast.success('Profile updated');
    } catch (error) {
      setFormError(getApiMessage(error, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm({ name: user?.name ?? '', phone: user?.phone ?? '' });
    setErrors({});
    setFormError('');
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
      toast.success('Signed out');
      navigate('/');
    } catch (error) {
      toast.error(getApiMessage(error, 'Could not sign out'));
      setSigningOut(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Profile</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Your details are what borrowers and lenders see next to every request and loan.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="panel p-6">
            <div className="flex items-center gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-extrabold tracking-tight text-primary">
                {initialsOf(user?.name)}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold tracking-tight text-ink">
                  {user?.name ?? 'Your name'}
                </h2>
                <p className="eyebrow mt-1.5">Member since {formatDate(user?.createdAt)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
              <div className="inset-panel flex items-center gap-2.5 px-3.5 py-2.5">
                <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate text-sm text-ink">{user?.email}</span>
              </div>
              <div className="inset-panel flex items-center gap-2.5 px-3.5 py-2.5">
                <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate text-sm text-ink">
                  {user?.phone || 'No phone number added'}
                </span>
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <p className="eyebrow">Edit details</p>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-ink">Your information</h2>
            <p className="mt-1 text-sm text-muted">
              Keep your name and phone current so people can reach you about a handover.
            </p>

            {formError && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                <p className="text-sm font-medium text-danger">{formError}</p>
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              <div>
                <label className={LABEL_CLASS} htmlFor="profile-name">
                  Full name
                </label>
                <input
                  id="profile-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={MAX_NAME_LENGTH}
                  value={form.name}
                  onChange={update('name')}
                  aria-invalid={errors.name ? 'true' : undefined}
                  className={fieldClass(errors.name)}
                />
                {errors.name && (
                  <p className="mt-1.5 text-xs font-medium text-danger">{errors.name}</p>
                )}
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="profile-email">
                  Email
                </label>
                <input
                  id="profile-email"
                  name="email"
                  type="email"
                  value={user?.email ?? ''}
                  readOnly
                  disabled
                  className={READONLY_FIELD_CLASS}
                />
                <p className="mt-1.5 text-xs text-muted">
                  Email is your login identifier and cannot be changed here.
                </p>
              </div>

              <div>
                <label className={LABEL_CLASS} htmlFor="profile-phone">
                  Phone <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="Add a number for handovers"
                  maxLength={MAX_PHONE_LENGTH}
                  value={form.phone}
                  onChange={update('phone')}
                  aria-invalid={errors.phone ? 'true' : undefined}
                  className={fieldClass(errors.phone)}
                />
                {errors.phone ? (
                  <p className="mt-1.5 text-xs font-medium text-danger">{errors.phone}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-muted">
                    Shown to people you lend to or borrow from.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
                {dirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleReset}
                    disabled={saving}
                    className="mr-auto"
                  >
                    Reset
                  </Button>
                )}
                <Button type="submit" loading={saving} disabled={!dirty}>
                  {!saving && <Save className="h-4 w-4" aria-hidden="true" />}
                  Save changes
                </Button>
              </div>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel p-6">
            <p className="eyebrow">Jump to</p>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-ink">Your LendLoop</h2>

            <div className="mt-4 space-y-2.5">
              {QUICK_LINKS.map(({ to, label, description, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="group flex items-center gap-3 rounded-lg border border-line bg-raised px-3.5 py-3 transition-colors hover:border-faint hover:bg-line-soft"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{label}</span>
                    <span className="block truncate text-xs text-muted">{description}</span>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>

            <Button
              variant="secondary"
              className="mt-5 w-full"
              onClick={handleSignOut}
              loading={signingOut}
            >
              {!signingOut && <LogOut className="h-4 w-4" aria-hidden="true" />}
              Sign out
            </Button>
          </section>

          <section className="panel p-6">
            <p className="eyebrow">Activity</p>
            <h2 className="mt-2 text-lg font-bold tracking-tight text-ink">Your activity so far</h2>

            <dl className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <Boxes className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Active listings
                </dt>
                <dd className="text-sm font-bold text-ink">{counts ? counts.listings : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <Package className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Available now
                </dt>
                <dd className="text-sm font-bold text-ink">{counts ? counts.available : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Loans, all time
                </dt>
                <dd className="text-sm font-bold text-ink">{counts ? counts.loans : '—'}</dd>
              </div>
            </dl>

            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
              Archived listings are left out of these numbers. They stay attached to the loans they
              already created so past returns keep resolving.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
