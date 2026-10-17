import { Eye, EyeOff, TriangleAlert, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import { LABEL_CLASS, fieldClass } from '../components/common/Field.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import { Brand } from '../components/layout/Sidebar.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { getApiMessage } from '../services/api.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PHONE_LENGTH = 24;

function TextField({ id, label, type = 'text', error, hint, revealable = false, ...props }) {
  const [visible, setVisible] = useState(false);
  const inputType = revealable ? (visible ? 'text' : 'password') : type;

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={inputType}
          aria-invalid={error ? 'true' : undefined}
          className={fieldClass(error, { trailing: revealable })}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-muted transition-colors hover:text-ink"
          >
            {visible ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const { isAuthenticated, initializing, register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    const email = form.email.trim();
    const phone = form.phone.trim();

    const nextErrors = {};
    if (!name) {
      nextErrors.name = 'Name is required';
    } else if (name.length < 2) {
      nextErrors.name = 'Name must be at least 2 characters';
    }

    if (!email) {
      nextErrors.email = 'Email is required';
    } else if (!EMAIL_PATTERN.test(email)) {
      nextErrors.email = 'Enter a valid email address';
    }

    if (phone.length > MAX_PHONE_LENGTH) {
      nextErrors.phone = `Phone number must be at most ${MAX_PHONE_LENGTH} characters`;
    }

    if (!form.password) {
      nextErrors.password = 'Password is required';
    } else if (form.password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (!form.confirmPassword) {
      nextErrors.confirmPassword = 'Confirm your password';
    } else if (form.confirmPassword !== form.password) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(nextErrors);
    setFormError('');
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await register({ name, email, password: form.password, phone });
      toast.success('Account created');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setFormError(getApiMessage(error, 'Could not create your account'));
    } finally {
      setSubmitting(false);
    }
  }

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <LoadingSpinner size="lg" label="Checking your session" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="LendLoop home" className="mb-6 flex justify-center">
          <Brand />
        </Link>

        <div className="panel p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">Create your account</h1>
          <p className="mt-1.5 text-sm text-muted">
            Join LendLoop to list what you can lend and borrow what you need from people around you.
          </p>

          {formError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3"
            >
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
              <p className="text-sm font-medium text-danger">{formError}</p>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <TextField
              id="name"
              label="Full name"
              placeholder="Alex Morgan"
              autoComplete="name"
              required
              value={form.name}
              onChange={update('name')}
              error={errors.name}
            />

            <TextField
              id="email"
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={form.email}
              onChange={update('email')}
              error={errors.email}
            />

            <TextField
              id="phone"
              label="Phone"
              type="tel"
              placeholder="Optional"
              autoComplete="tel"
              value={form.phone}
              onChange={update('phone')}
              error={errors.phone}
              hint="Optional - shown to people you lend to."
            />

            <TextField
              id="password"
              label="Password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              revealable
              required
              value={form.password}
              onChange={update('password')}
              error={errors.password}
            />

            <TextField
              id="confirmPassword"
              label="Confirm password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              revealable
              required
              value={form.confirmPassword}
              onChange={update('confirmPassword')}
              error={errors.confirmPassword}
            />

            <Button type="submit" className="mt-2 w-full" loading={submitting}>
              {!submitting && <UserPlus className="h-4 w-4" aria-hidden="true" />}
              Create account
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary transition-colors hover:text-primary-hover">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
