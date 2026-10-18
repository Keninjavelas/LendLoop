import { ArrowLeft, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import LendingEntryForm from '../components/loans/LendingEntryForm.jsx';
import { getApiMessage } from '../services/api.js';
import { categoryService } from '../services/categoryService.js';
import { itemService } from '../services/itemService.js';
import { loanService } from '../services/loanService.js';

export default function NewLoanPage() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setLoadError('');
    setSubmitError('');

    // Categories drive the picker and priority inheritance, so that failure blocks the form.
    // Listings are optional context, so a failed load only removes the link control.
    Promise.all([categoryService.list(), itemService.mine().catch(() => [])])
      .then(([loadedCategories, myItems]) => {
        if (ignore) return;
        setCategories(Array.isArray(loadedCategories) ? loadedCategories : []);
        setItems(
          (Array.isArray(myItems) ? myItems : []).filter((item) => item.status === 'available'),
        );
      })
      .catch((fetchError) => {
        if (ignore) return;
        setLoadError(getApiMessage(fetchError, 'Could not load your categories'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  async function handleSubmit(payload) {
    setSubmitting(true);
    setSubmitError('');

    try {
      const { loan, warnings } = await loanService.create(payload);
      warnings?.forEach((warning) => toast.warning(warning));
      toast.success('Lending entry saved');
      navigate(`/loans/${loan._id}`, { replace: true });
    } catch (createError) {
      setSubmitError(getApiMessage(createError, 'Could not save that lending entry'));
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <Link
          to="/loans"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to loans
        </Link>
        <p className="eyebrow mt-5">New lending entry</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Record what went out.
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Add the item, the borrower and the deadline. Reminders follow the entry's priority, and
          nothing is sent when you save.
        </p>
      </header>

      {loading ? (
        <LoadingSpinner size="lg" label="Loading the entry form" />
      ) : loadError ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load the entry form</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{loadError}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : (
        <LendingEntryForm
          categories={categories}
          items={items}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/loans')}
          submitting={submitting}
          submitError={submitError}
        />
      )}
    </div>
  );
}
