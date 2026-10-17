import {
  ArrowUpRight,
  BellRing,
  Check,
  CircleCheck,
  Clock,
  Handshake,
  Plus,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import Modal from '../components/common/Modal.jsx';
import StatStrip from '../components/common/StatStrip.jsx';
import DeadlinePriorityModal from '../components/loans/DeadlinePriorityModal.jsx';
import LendingEntryForm from '../components/loans/LendingEntryForm.jsx';
import LoanCard from '../components/loans/LoanCard.jsx';
import LoanSettingsModal from '../components/loans/LoanSettingsModal.jsx';
import SendReminderModal from '../components/loans/SendReminderModal.jsx';
import { getApiMessage } from '../services/api.js';
import { categoryService } from '../services/categoryService.js';
import { itemService } from '../services/itemService.js';
import { loanService } from '../services/loanService.js';
import { cn } from '../utils/cn.js';
import { PRIORITIES, priorityLabel } from '../utils/constants.js';
import { isOverdue } from '../utils/formatDate.js';

const LOAN_STATUSES = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'returned', label: 'Returned' },
];

// Overdue is derived, so it needs its own bucket when ordering the list.
function sortRank(loan) {
  if (isOverdue(loan)) return 0;
  if (loan.status === 'active') return 1;
  return 2;
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function recency(loan) {
  const value = loan.status === 'returned' ? loan.returnedAt || loan.createdAt : loan.lentAt || loan.createdAt;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

// `cn` joins without merging, so each state is one complete literal string rather than an
// override appended to a base — the active pill carries a ring where the idle one carries
// a border. The active fill is a soft tint, not solid green: the page spends its one solid
// accent on the primary Button.
function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-primary-soft text-primary ring-1 ring-inset ring-primary/25'
          : 'border border-line bg-raised text-muted hover:border-faint hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
        active
          ? 'bg-primary-soft text-primary ring-1 ring-inset ring-primary/25'
          : 'text-muted hover:bg-raised hover:text-ink',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export default function LoansPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [role, setRole] = useState('lent');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  const [loans, setLoans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // One modal at a time: { mode: 'create' | 'remind' | 'reschedule' | 'settings' | 'return', loan }
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // The dashboard links here with ?new=1 so its call to action opens the form rather than
  // merely landing on the list. The flag is cleared straight away, otherwise a refresh or a
  // back-navigation would keep reopening a modal the lender already dismissed.
  useEffect(() => {
    if (!searchParams.get('new')) return;
    setModal({ mode: 'create', loan: null });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');

    loanService
      .list({
        role,
        status: status || undefined,
        priority: priority || undefined,
        overdue: overdueOnly ? 'true' : undefined,
      })
      .then((result) => {
        if (ignore) return;
        setLoans(Array.isArray(result) ? result : []);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(getApiMessage(fetchError, 'Could not load your loans'));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [role, status, priority, overdueOnly, reloadKey]);

  // The lending entry form needs the category list for its priority defaults, and the
  // lender's available listings so an entry can be linked to one. Both are optional to
  // the page, so a failure only narrows the dropdowns.
  useEffect(() => {
    let ignore = false;
    categoryService
      .list()
      .then((result) => {
        if (!ignore) setCategories(Array.isArray(result) ? result : []);
      })
      .catch(() => {
        if (!ignore) setCategories([]);
      });
    itemService
      .mine()
      .then((result) => {
        if (!ignore) {
          setItems((Array.isArray(result) ? result : []).filter((item) => item.status === 'available'));
        }
      })
      .catch(() => {
        if (!ignore) setItems([]);
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  const ordered = useMemo(
    () =>
      [...loans].sort((a, b) => {
        const rank = sortRank(a) - sortRank(b);
        if (rank !== 0) return rank;
        if (role === 'lent') {
          const byPriority = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
          if (byPriority !== 0) return byPriority;
        }
        return recency(b) - recency(a);
      }),
    [loans, role],
  );

  const activeCount = loans.filter((loan) => loan.status === 'active').length;
  const overdueCount = loans.filter((loan) => isOverdue(loan)).length;
  const returnedCount = loans.filter((loan) => loan.status === 'returned').length;
  const armedCount = loans.filter(
    (loan) => loan.status === 'active' && loan.reminders?.enabled && loan.reminders?.nextDueAt,
  ).length;

  const stats =
    role === 'lent'
      ? [
          {
            key: 'active',
            label: 'Out now',
            value: activeCount,
            caption: `${armedCount} with reminders armed`,
            icon: Clock,
            tint: 'bg-info-soft text-info',
            valueClass: 'text-ink',
          },
          {
            key: 'overdue',
            label: 'Overdue',
            value: overdueCount,
            caption: overdueCount === 0 ? 'Everything is back on time' : 'Past the agreed return date',
            icon: TriangleAlert,
            tint: 'bg-danger-soft text-danger',
            valueClass: 'text-danger',
          },
          {
            key: 'returned',
            label: 'Returned',
            value: returnedCount,
            caption: 'Closed out and back on the shelf',
            icon: CircleCheck,
            tint: 'bg-success-soft text-success',
            valueClass: 'text-ink',
          },
        ]
      : [
          {
            key: 'active',
            label: 'In your hands',
            value: activeCount,
            caption: 'Borrowed and not yet returned',
            icon: Clock,
            tint: 'bg-info-soft text-info',
            valueClass: 'text-ink',
          },
          {
            key: 'overdue',
            label: 'Overdue',
            value: overdueCount,
            caption: overdueCount === 0 ? 'Nothing is late' : 'Get these back to their owners',
            icon: TriangleAlert,
            tint: 'bg-danger-soft text-danger',
            valueClass: 'text-danger',
          },
          {
            key: 'returned',
            label: 'Returned',
            value: returnedCount,
            caption: 'Handed back and closed out',
            icon: CircleCheck,
            tint: 'bg-success-soft text-success',
            valueClass: 'text-ink',
          },
        ];

  function closeModal() {
    if (submitting) return;
    setModal(null);
  }

  // Every mutation returns the server's view of the entry, so the card is replaced wholesale
  // rather than patched — the reminder schedule and channel readiness come from the server.
  function replaceLoan(loan) {
    if (!loan?._id) return;
    setLoans((current) =>
      current.some((entry) => entry._id === loan._id)
        ? current.map((entry) => (entry._id === loan._id ? loan : entry))
        : [loan, ...current],
    );
  }

  async function handleCreate(payload) {
    setSubmitting(true);
    try {
      const { loan, warnings } = await loanService.create(payload);
      replaceLoan(loan);
      setModal(null);
      warnings?.forEach((warning) => toast.warning(warning));
      toast.success('Lending entry saved');
    } catch (createError) {
      toast.error(getApiMessage(createError, 'Could not save that lending entry'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmReturn() {
    const loan = modal?.loan;
    if (!loan) return;

    setBusyId(loan._id);
    try {
      const returned = await loanService.markReturned(loan._id);
      replaceLoan(returned ?? { ...loan, status: 'returned' });
      setModal(null);
      toast.success('Return confirmed');
    } catch (actionError) {
      toast.error(getApiMessage(actionError, 'Could not confirm that return'));
      setModal(null);
      // The server is the source of truth, so pull the list again after a conflict.
      setReloadKey((key) => key + 1);
    } finally {
      setBusyId('');
    }
  }

  function renderEmptyState() {
    if (role === 'borrowed') {
      return (
        <EmptyState
          icon={RefreshCw}
          title="You are not borrowing anything"
          description="Once an owner approves one of your requests, the loan shows up here with its due date so you always know when to hand the item back."
          action={
            <Button variant="secondary" onClick={() => navigate('/items')}>
              Find something to borrow
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={BellRing}
        title="No lending entries here"
        description="Record anything you have lent — listed on LendLoop or not. Priority decides how early the reminders go out, and you stay in control of every one of them."
        action={
          <Button onClick={() => setModal({ mode: 'create', loan: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New lending entry
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Lending and borrowing</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Loans</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Everything out on loan in both directions. On the lending side you can set a priority,
            move a deadline, and send a reminder by hand — every change is kept in the entry's history.
          </p>
        </div>

        {role === 'lent' && (
          <Button className="sm:ml-auto" onClick={() => setModal({ mode: 'create', loan: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New lending entry
          </Button>
        )}
      </header>

      <div className="space-y-4">
        <div className="panel flex flex-col gap-2 p-1.5 sm:flex-row">
          <TabButton
            active={role === 'lent'}
            onClick={() => setRole('lent')}
            icon={RefreshCw}
            label="Lending"
          />
          <TabButton
            active={role === 'borrowed'}
            onClick={() => setRole('borrowed')}
            icon={Handshake}
            label="Borrowing"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {LOAN_STATUSES.map((entry) => (
            <FilterPill
              key={entry.value || 'all'}
              active={status === entry.value}
              onClick={() => setStatus(entry.value)}
            >
              {entry.label}
            </FilterPill>
          ))}

          {role === 'lent' && (
            <>
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
              <FilterPill active={overdueOnly} onClick={() => setOverdueOnly((value) => !value)}>
                Overdue only
              </FilterPill>
              {PRIORITIES.map((entry) => (
                <FilterPill
                  key={entry}
                  active={priority === entry}
                  onClick={() => setPriority((current) => (current === entry ? '' : entry))}
                >
                  {priorityLabel(entry)}
                </FilterPill>
              ))}
            </>
          )}
        </div>
      </div>

      <StatStrip stats={stats} columns={3} />

      {loading ? (
        <LoadingSpinner size="lg" label="Loading your loans" />
      ) : error ? (
        <div role="alert" className="panel px-6 py-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-ink">Could not load your loans</h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{error}</p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : ordered.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="space-y-4">
          {ordered.map((loan) => (
            <LoanCard
              key={loan._id}
              loan={loan}
              role={role}
              busy={busyId === loan._id}
              onReturn={() => setModal({ mode: 'return', loan })}
              onRemind={() => setModal({ mode: 'remind', loan })}
              onReschedule={() => setModal({ mode: 'reschedule', loan })}
              onSettings={() => setModal({ mode: 'settings', loan })}
            />
          ))}
        </div>
      )}

      <Modal
        open={modal?.mode === 'create'}
        onClose={closeModal}
        size="lg"
        title="New lending entry"
        description="Record what went out, who has it, and when it is due back. The borrower does not need a LendLoop account."
      >
        <LendingEntryForm
          categories={categories}
          items={items}
          onSubmit={handleCreate}
          onCancel={closeModal}
          submitting={submitting}
        />
      </Modal>

      <SendReminderModal
        loan={modal?.mode === 'remind' ? modal.loan : null}
        open={modal?.mode === 'remind'}
        onClose={() => setModal(null)}
        onSent={() => setReloadKey((key) => key + 1)}
      />

      <DeadlinePriorityModal
        loan={modal?.mode === 'reschedule' ? modal.loan : null}
        categories={categories}
        open={modal?.mode === 'reschedule'}
        onClose={() => setModal(null)}
        onSaved={replaceLoan}
      />

      <LoanSettingsModal
        loan={modal?.mode === 'settings' ? modal.loan : null}
        open={modal?.mode === 'settings'}
        onClose={() => setModal(null)}
        onSaved={replaceLoan}
      />

      <Modal
        open={modal?.mode === 'return'}
        onClose={closeModal}
        size="sm"
        title="Confirm return"
        description="Closing the entry stops its reminders and frees any linked listing."
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={busyId !== ''}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleConfirmReturn}
              loading={busyId === modal?.loan?._id}
            >
              {busyId !== modal?.loan?._id && <Check className="h-4 w-4" aria-hidden="true" />}
              Confirm return
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          Confirm that{' '}
          <span className="font-semibold text-ink">{modal?.loan?.borrower?.name ?? 'the borrower'}</span>{' '}
          has handed back{' '}
          <span className="font-semibold text-ink">{modal?.loan?.itemName ?? 'this item'}</span>. The
          entry is closed straight away and cannot be reopened.
        </p>
      </Modal>
    </div>
  );
}
