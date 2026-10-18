import {
  BellRing,
  Boxes,
  ChevronRight,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  LogOut,
  Mail,
  MessageSquareText,
  Package,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import { CheckRow, LABEL_CLASS, READONLY_FIELD_CLASS, RadioRow, fieldClass } from '../components/common/Field.jsx';
import Modal from '../components/common/Modal.jsx';
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
  {
    to: '/categories',
    label: 'Categories',
    description: 'Groups and default priorities',
    icon: Boxes,
  },
  {
    to: '/templates',
    label: 'Templates',
    description: 'Messages used by reminders',
    icon: MessageSquareText,
  },
];

const SECTION_LINKS = [
  { href: '#account', label: 'Account' },
  { href: '#profile-details', label: 'Profile details' },
  { href: '#reminder-defaults', label: 'Notifications & defaults' },
  { href: '#security', label: 'Security' },
  { href: '#privacy', label: 'Privacy & deletion' },
];

const CHANNEL_OPTIONS = [
  {
    value: 'email',
    title: 'Email',
    description: 'A message with the loan details and due date.',
  },
  {
    value: 'whatsapp',
    title: 'WhatsApp',
    description: 'A prefilled chat that you send yourself.',
  },
];

const MAX_NAME_LENGTH = 80;
const MAX_PHONE_LENGTH = 24;
const MAX_AVATAR_LENGTH = 2048;
const MIN_PASSWORD_LENGTH = 8;

const EMPTY_PASSWORD_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const EMPTY_DELETE_FORM = { password: '', confirmation: '' };

function snapshotOf(user) {
  return {
    name: user?.name ?? '',
    phone: user?.profile?.phone ?? '',
    avatarUrl: user?.profile?.avatarUrl ?? '',
    defaultReminderChannel: user?.preferences?.defaultReminderChannel ?? 'email',
    emailNotifications: user?.preferences?.emailNotifications ?? true,
    whatsappNotifications: user?.preferences?.whatsappNotifications ?? false,
  };
}

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

function looksLikeHttpUrl(value) {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export default function SettingsPage() {
  const { user, setUser, logout, deleteAccount } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(() => snapshotOf(user));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [counts, setCounts] = useState(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteForm, setDeleteForm] = useState(EMPTY_DELETE_FORM);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Re-seed only when the signed-in account changes, never on every profile save,
  // so an in-progress edit is not wiped underneath the user.
  const userId = user?._id ?? '';
  useEffect(() => {
    if (!userId) return;
    setForm(snapshotOf(user));
    // `user` is read from the closure on purpose: depending on the whole object would
    // re-seed after every save and discard what the user is typing.
  }, [userId]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [user?.profile?.avatarUrl]);

  useEffect(() => {
    setPreviewBroken(false);
  }, [form.avatarUrl]);

  // Nice-to-have context: the profile form has to render even when these calls fail,
  // so the error is swallowed and the summary falls back to placeholders.
  useEffect(() => {
    let ignore = false;

    Promise.all([
      itemService.mine().then((result) => result?.items ?? []),
      loanService.list({}),
    ])
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

  const baseline = snapshotOf(user);
  const dirty =
    ['name', 'phone', 'avatarUrl', 'defaultReminderChannel'].some(
      (field) => form[field].trim() !== baseline[field].trim(),
    ) ||
    form.emailNotifications !== baseline.emailNotifications ||
    form.whatsappNotifications !== baseline.whatsappNotifications;

  function update(field) {
    return (event) => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
      setErrors((current) => ({ ...current, [field]: '' }));
      setFormError('');
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const name = form.name.trim();
    const phone = form.phone.trim();
    const avatarUrl = form.avatarUrl.trim();

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
    if (avatarUrl.length > MAX_AVATAR_LENGTH) {
      nextErrors.avatarUrl = 'Avatar URL is too long';
    } else if (!looksLikeHttpUrl(avatarUrl)) {
      nextErrors.avatarUrl = 'Enter a full http or https image address';
    }

    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const result = await authService.updateProfile({
        name,
        profile: { phone, avatarUrl },
        preferences: {
          defaultReminderChannel: form.defaultReminderChannel,
          emailNotifications: form.emailNotifications,
          whatsappNotifications: form.whatsappNotifications,
        },
      });
      setUser(result);
      // Adopt the server-normalised values so the dirty check settles immediately.
      setForm(snapshotOf(result));
      toast.success('Profile updated');
    } catch (error) {
      setFormError(getApiMessage(error, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setForm(snapshotOf(user));
    setErrors({});
    setFormError('');
  }

  function openPasswordModal() {
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordError('');
    setPasswordOpen(true);
  }

  function closePasswordModal() {
    if (changingPassword) return;
    setPasswordOpen(false);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordError('');
  }

  function updatePassword(field) {
    return (event) => {
      setPasswordForm((current) => ({ ...current, [field]: event.target.value }));
      setPasswordError('');
    };
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();

    if (!passwordForm.currentPassword) {
      setPasswordError('Enter your current password');
      return;
    }
    if (passwordForm.newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('The new passwords do not match');
      return;
    }

    setChangingPassword(true);
    setPasswordError('');
    try {
      const result = await authService.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setUser(result);
      setPasswordOpen(false);
      setPasswordForm(EMPTY_PASSWORD_FORM);
      toast.success('Password updated');
    } catch (error) {
      setPasswordError(getApiMessage(error, 'Could not update your password'));
    } finally {
      setChangingPassword(false);
    }
  }

  function openDeleteModal() {
    setDeleteForm(EMPTY_DELETE_FORM);
    setDeleteError('');
    setDeleteOpen(true);
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteForm(EMPTY_DELETE_FORM);
    setDeleteError('');
  }

  function updateDelete(field) {
    return (event) => {
      setDeleteForm((current) => ({ ...current, [field]: event.target.value }));
      setDeleteError('');
    };
  }

  async function handleDeleteSubmit(event) {
    event.preventDefault();

    if (!deleteForm.password) {
      setDeleteError('Enter your password to delete the account');
      return;
    }
    if (deleteForm.confirmation.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm account deletion');
      return;
    }

    setDeleting(true);
    setDeleteError('');
    try {
      await deleteAccount({
        password: deleteForm.password,
        confirmation: deleteForm.confirmation.trim(),
      });
      setDeleteOpen(false);
      toast.success('Your account has been deleted');
      navigate('/', { replace: true });
    } catch (error) {
      setDeleteError(getApiMessage(error, 'Could not delete your account'));
    } finally {
      setDeleting(false);
    }
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

  const avatarUrl = user?.profile?.avatarUrl ?? '';
  const previewUrl = form.avatarUrl.trim();
  const showAvatar = Boolean(avatarUrl) && !avatarBroken;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Your profile, reminder defaults, security and account controls. Categories and reminder
          templates are managed alongside these settings.
        </p>
      </header>

      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-2 rounded-xl border border-line bg-surface px-3 py-2.5"
      >
        {SECTION_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section id="account" className="panel scroll-mt-24 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-xl font-extrabold tracking-tight text-primary">
                  {initialsOf(user?.name)}
                  {showAvatar && (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={() => setAvatarBroken(true)}
                    />
                  )}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold tracking-tight text-ink">
                    {user?.name ?? 'Your name'}
                  </h2>
                  <p className="eyebrow mt-1.5">Member since {formatDate(user?.createdAt)}</p>
                </div>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Password protected
              </span>
            </div>

            <div className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
              <div className="inset-panel flex items-center gap-2.5 px-3.5 py-2.5">
                <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate text-sm text-ink">{user?.email}</span>
              </div>
              <div className="inset-panel flex items-center gap-2.5 px-3.5 py-2.5">
                <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 truncate text-sm text-ink">
                  {user?.profile?.phone || 'No phone number added'}
                </span>
              </div>
            </div>
          </section>

          <section id="profile-details" className="panel scroll-mt-24 p-5 sm:p-6">
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

            <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
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
                    aria-describedby={errors.name ? 'profile-name-error' : undefined}
                    className={fieldClass(errors.name)}
                  />
                  {errors.name && (
                    <p id="profile-name-error" className="mt-1.5 text-xs font-medium text-danger">
                      {errors.name}
                    </p>
                  )}
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
                    aria-describedby={errors.phone ? 'profile-phone-error' : 'profile-phone-hint'}
                    className={fieldClass(errors.phone)}
                  />
                  {errors.phone ? (
                    <p id="profile-phone-error" className="mt-1.5 text-xs font-medium text-danger">
                      {errors.phone}
                    </p>
                  ) : (
                    <p id="profile-phone-hint" className="mt-1.5 text-xs text-muted">
                      Shown to people you lend to or borrow from.
                    </p>
                  )}
                </div>
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
                <label className={LABEL_CLASS} htmlFor="profile-avatar">
                  Avatar image <span className="font-normal text-muted">(optional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-raised text-sm font-bold text-primary">
                    {initialsOf(form.name || user?.name)}
                    {previewUrl && !previewBroken && looksLikeHttpUrl(previewUrl) && (
                      <img
                        src={previewUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={() => setPreviewBroken(true)}
                      />
                    )}
                  </span>
                  <input
                    id="profile-avatar"
                    name="avatarUrl"
                    type="url"
                    placeholder="https://example.com/photo.jpg"
                    maxLength={MAX_AVATAR_LENGTH}
                    value={form.avatarUrl}
                    onChange={update('avatarUrl')}
                    aria-invalid={errors.avatarUrl ? 'true' : undefined}
                    aria-describedby={errors.avatarUrl ? 'profile-avatar-error' : 'profile-avatar-hint'}
                    className={fieldClass(errors.avatarUrl)}
                  />
                </div>
                {errors.avatarUrl ? (
                  <p id="profile-avatar-error" className="mt-1.5 text-xs font-medium text-danger">
                    {errors.avatarUrl}
                  </p>
                ) : (
                  <p id="profile-avatar-hint" className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                    <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Paste a public image address. Leave it empty to use your initials.
                  </p>
                )}
              </div>

              <div id="reminder-defaults" className="scroll-mt-24 border-t border-line pt-5">
                <div className="flex items-start gap-2.5">
                  <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold text-ink">Reminder defaults</h3>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                      New lending entries start with these channels. You can still adjust each one
                      before saving.
                    </p>
                  </div>
                </div>

                <fieldset className="mt-4">
                  <legend className={LABEL_CLASS}>Default reminder channel</legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {CHANNEL_OPTIONS.map((option) => (
                      <RadioRow
                        key={option.value}
                        name="defaultReminderChannel"
                        value={option.value}
                        checked={form.defaultReminderChannel === option.value}
                        onChange={update('defaultReminderChannel')}
                        title={option.title}
                        description={option.description}
                      />
                    ))}
                  </div>
                </fieldset>

                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  <CheckRow
                    id="preference-email"
                    checked={form.emailNotifications}
                    onChange={update('emailNotifications')}
                    title="Email notifications"
                    description="Include email when a loan has reminders due."
                  />
                  <CheckRow
                    id="preference-whatsapp"
                    checked={form.whatsappNotifications}
                    onChange={update('whatsappNotifications')}
                    title="WhatsApp reminders"
                    description="Offer a prefilled WhatsApp chat to send yourself."
                  />
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-muted">
                  If both are off, new entries fall back to the channels set by their priority.
                </p>
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

          <section id="security" className="panel scroll-mt-24 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <KeyRound className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-base font-bold tracking-tight text-ink">Password</h2>
                <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                  Changing it signs out every other device. This session stays signed in.
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={openPasswordModal} className="w-full sm:w-auto">
              Change password
            </Button>
          </section>

          <section id="privacy" className="scroll-mt-24 rounded-xl border border-danger/30 bg-danger-soft/25 p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-ink">Delete account</h2>
                  <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                    Your listings are archived, pending requests are cancelled, and your name and
                    contact details are removed. Past loans stay with the other person&apos;s
                    history. Accounts with active loans cannot be deleted.
                  </p>
                </div>
              </div>
              <Button variant="danger" onClick={openDeleteModal} className="w-full sm:w-auto">
                Delete account
              </Button>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel p-5 sm:p-6">
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

          <section className="panel p-5 sm:p-6">
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

      <Modal
        open={passwordOpen}
        onClose={closePasswordModal}
        title="Change password"
        description="Confirm your current password, then choose a new one of at least 8 characters."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closePasswordModal} disabled={changingPassword}>
              Cancel
            </Button>
            <Button type="submit" form="password-form" loading={changingPassword}>
              Update password
            </Button>
          </>
        }
      >
        <form id="password-form" className="space-y-4" onSubmit={handlePasswordSubmit} noValidate>
          {passwordError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm font-medium text-danger">{passwordError}</p>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS} htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={updatePassword('currentPassword')}
              className={fieldClass()}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={passwordForm.newPassword}
              onChange={updatePassword('newPassword')}
              className={fieldClass()}
            />
            <p className="mt-1.5 text-xs text-muted">
              At least {MIN_PASSWORD_LENGTH} characters. A phrase you have not used elsewhere works
              well.
            </p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={updatePassword('confirmPassword')}
              className={fieldClass()}
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={closeDeleteModal}
        title="Delete account"
        description="This cannot be undone. Confirm with your password and the word DELETE."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeDeleteModal} disabled={deleting}>
              Keep account
            </Button>
            <Button type="submit" form="delete-account-form" variant="danger" loading={deleting}>
              Delete permanently
            </Button>
          </>
        }
      >
        <form id="delete-account-form" className="space-y-4" onSubmit={handleDeleteSubmit} noValidate>
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted">
              Active loans block deletion. Close or return them first. Pending requests will be
              cancelled and your listings archived.
            </p>
          </div>

          {deleteError && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger-soft px-3.5 py-3"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm font-medium text-danger">{deleteError}</p>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS} htmlFor="delete-password">
              Password
            </label>
            <input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deleteForm.password}
              onChange={updateDelete('password')}
              className={fieldClass()}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="delete-confirmation">
              Type DELETE to confirm
            </label>
            <input
              id="delete-confirmation"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="DELETE"
              value={deleteForm.confirmation}
              onChange={updateDelete('confirmation')}
              className={fieldClass()}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
