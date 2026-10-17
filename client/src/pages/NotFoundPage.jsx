import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button.jsx';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </span>

      <p className="mt-6 font-display text-6xl font-bold tabular-nums tracking-tight text-ink sm:text-7xl">
        404
      </p>

      <h1 className="mt-3 text-xl font-bold text-ink">We could not find that page</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        The link may be out of date, or the item it pointed to has been archived or removed.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => navigate('/')}>Back to home</Button>
        <Button variant="secondary" onClick={() => navigate('/items')}>
          Browse items
        </Button>
      </div>
    </div>
  );
}
