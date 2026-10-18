import {
  ArrowUpRight,
  BellRing,
  CircleCheck,
  Clock,
  Handshake,
  Plus,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/common/Button.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import LoadingSpinner from '../components/common/LoadingSpinner.jsx';
import StatStrip from '../components/common/StatStrip.jsx';
import DeadlinePriorityModal from '../components/loans/DeadlinePriorityModal.jsx';
import LoanCard from '../components/loans/LoanCard.jsx';
import LoanSettingsModal from '../components/loans/LoanSettingsModal.jsx';
import ReturnLoanDialog from '../components/loans/ReturnLoanDialog.jsx';
import SendReminderModal from '../components/loans/SendReminderModal.jsx';
import { getApiMessage } from '../services/api.js';
import { borrowerService } from '../services/borrowerService.js';
import { categoryService } from '../services/categoryService.js';
import { loanService } from '../services/loanService.js';
import { cn } from '../utils/cn.js';
import { PRIORITIES, priorityLabel } from '../utils/constants.js';
import { isOverdue } from '../utils/formatDate.js';

const LOAN_STATUSES = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'returned', label: 'Returned' },
];

const SORT_OPTIONS = [
  { value: 'attention', label: 'Needs attention first' },
  { value: 'due', label: 'Due date' },
  { value: 'priority', label: 'Priority' },
  { value: 'newest', label: 'Newest recorded' },
  { value: 'oldest', label: 'Oldest recorded' },
  { value: 'borrower', label: 'Borrower name' },
];

const DEFAULT_SORT = 'attention';

const CONTROL_CLASS =
  'h-10 rounded-lg border border-line bg-raised px-3 text-sm text-ink transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

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

function ActiveChip({ children, onClear, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-inset ring-line">
      {children}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="rounded text-faint transition-colors hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

export default function LoansPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters live in the URL so dashboard, insights and borrower drill-downs land on a
  // list the user can bookmark, refresh or share within their own session.
  const role = searchParams.get('role') === 'borrowed' ? 'borrowed' : 'lent';
  const rawStatus = searchParams.get('status') ?? '';
  const status = LOAN_STATUSES.some((entry) => entry.value === rawStatus) ? rawStatus : '';
  const rawPriority = searchParams.get('priority') ?? '';
  const priority = PRIORITIES.includes(rawPriority) ? rawPriority : '';
  const overdueOnly = searchParams.get('overdue') === 'true';
  const q = searchParams.get('q') ?? '';
  const rawSort = searchParams.get('sort') ?? '';
  const sort = SORT_OPTIONS.some((entry) => entry.value === rawSort) ? rawSort : DEFAULT_SORT;
  const categoryId = searchParams.get('categoryId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const borrowerId = searchParams.get('borrowerId') ?? '';

  const [term, setTerm] = useState(q);
  const [loans, setLoans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [borrowerName, setBorrowerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // One modal at a time: { mode: 'remind' | 'reschedule' | 'settings' | 'return', loan }
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState('');

  const rangeInvalid = Boolean(from && to && from > to);

  function updateParams(changes) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value === null || value === undefined) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  // The input stays local while typing; the URL catches up after a pause so each keystroke
  // is not a request or a history entry.
  useEffect(() => {
    setTerm(q);
  }, [q]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const trimmed = term.trim();
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    if (next.toString() === searchParams.toString()) return undefined;
    const handle = setTimeout(() => setSearchParams(next, { replace: true }), 300);
    return () => clearTimeout(handle);
  }, [term, searchParams, setSearchParams]);

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
        q: q || undefined,
        sort,
        categoryId: categoryId || undefined,
        from: from || undefined,
        to: to || undefined,
        borrowerId: borrowerId || undefined,
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
  }, [role, status, priority, overdueOnly, q, sort, categoryId, from, to, borrowerId, reloadKey]);

  // Category names and defaults label the deadline and priority dialog. A failure only
  // narrows that dialog and the category filter; the loan list itself stays usable.
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
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // A borrower drill-down should name the borrower in the filter chip. The loans payload
  // also carries the name, but a filtered list may legitimately be empty.
  useEffect(() => {
    if (!borrowerId) {
      setBorrowerName('');
      return undefined;
    }

    let ignore = false;
    borrowerService
      .get(borrowerId)
      .then((result) => {
        if (!ignore) setBorrowerName(result?.borrower?.name ?? '');
      })
      .catch(() => {
        if (!ignore) setBorrowerName('');
      });

    return () => {
      ignore = true;
    };
  }, [borrowerId]);

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

  const hasFilters = Boolean(
    status || priority || overdueOnly || q || categoryId || from || to || borrowerId,
  );

  function changeRole(nextRole) {
    updateParams({
      role: nextRole === 'borrowed' ? 'borrowed' : '',
      ...(nextRole === 'borrowed' ? { priority: '', categoryId: '', borrowerId: '' } : {}),
    });
  }

  function changeStatus(nextStatus) {
    updateParams({
      status: nextStatus,
      ...(nextStatus !== 'active' ? { overdue: '' } : {}),
    });
  }

  function toggleOverdue() {
    const next = !overdueOnly;
    updateParams({
      overdue: next ? 'true' : '',
      ...(next ? { status: 'active' } : {}),
    });
  }

  function clearFilters() {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams();
        if (current.get('role') === 'borrowed') next.set('role', 'borrowed');
        return next;
      },
      { replace: true },
    );
    setTerm('');
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

  function handleReturned(returned) {
    const loan = modal?.mode === 'return' ? modal.loan : null;
    setModal(null);
    if (!returned || !loan) return;

    // A returned entry no longer belongs in the active or overdue buckets.
    if (status === 'active' || overdueOnly) {
      setLoans((current) => current.filter((entry) => entry._id !== returned._id));
      return;
    }

    replaceLoan(returned);
  }

  const categoryName = categories.find((entry) => entry._id === categoryId)?.name ?? '';

  function renderEmptyState() {
    if (hasFilters) {
      return (
        <EmptyState
          icon={Search}
          title="No loans match these filters"
          description="Try a different status, name or date range. Clearing the filters returns to everything in this direction."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear all filters
            </Button>
          }
        />
      );
    }

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
          <Button onClick={() => navigate('/loans/new')}>
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
            move a deadline, and send a reminder by hand — every change is kept in the entry&apos;s history.
          </p>
        </div>

        {role === 'lent' && (
          <Button className="sm:ml-auto" onClick={() => navigate('/loans/new')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New lending entry
          </Button>
        )}
      </header>

      <div className="space-y-4">
        <div className="panel flex flex-col gap-2 p-1.5 sm:flex-row">
          <TabButton
            active={role === 'lent'}
            onClick={() => changeRole('lent')}
            icon={RefreshCw}
            label="Lending"
          />
          <TabButton
            active={role === 'borrowed'}
            onClick={() => changeRole('borrowed')}
            icon={Handshake}
            label="Borrowing"
          />
        </div>

        <section className="panel space-y-3 p-3 sm:p-4" aria-label="Loan filters">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">Search loans</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder={
                  role === 'lent' ? 'Search item, borrower or notes' : 'Search item or notes'
                }
                className="h-10 w-full rounded-lg border border-line bg-raised pl-9 pr-3 text-sm text-ink placeholder:text-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              {role === 'lent' && (
                <label className="flex items-center gap-2 text-xs font-medium text-muted">
                  <span className="sr-only sm:not-sr-only">Category</span>
                  <select
                    value={categoryId}
                    onChange={(event) => updateParams({ categoryId: event.target.value })}
                    className={cn(CONTROL_CLASS, 'max-w-44')}
                  >
                    <option value="">All categories</option>
                    {categories.map((category) => (
                      <option key={category._id} value={category._id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="flex items-center gap-2 text-xs font-medium text-muted">
                <span className="sr-only sm:not-sr-only">Sort</span>
                <select
                  value={sort}
                  onChange={(event) =>
                    updateParams({
                      sort: event.target.value === DEFAULT_SORT ? '' : event.target.value,
                    })
                  }
                  className={cn(CONTROL_CLASS, 'max-w-52')}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {LOAN_STATUSES.map((entry) => (
              <FilterPill
                key={entry.value || 'all'}
                active={status === entry.value}
                onClick={() => changeStatus(entry.value)}
              >
                {entry.label}
              </FilterPill>
            ))}

            <span className="mx-1 hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
            <FilterPill active={overdueOnly} onClick={toggleOverdue}>
              Overdue only
            </FilterPill>

            {role === 'lent' &&
              PRIORITIES.map((entry) => (
                <FilterPill
                  key={entry}
                  active={priority === entry}
                  onClick={() => updateParams({ priority: priority === entry ? '' : entry })}
                >
                  {priorityLabel(entry)}
                </FilterPill>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              Lent from
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => updateParams({ from: event.target.value })}
                className={CONTROL_CLASS}
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              to
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => updateParams({ to: event.target.value })}
                className={CONTROL_CLASS}
              />
            </label>

            {hasFilters && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>

          {(borrowerId || categoryId) && (
            <div className="flex flex-wrap items-center gap-2">
              {borrowerId && (
                <ActiveChip
                  label="borrower"
                  onClear={() => updateParams({ borrowerId: '' })}
                >
                  Borrower: {borrowerName || 'selected account'}
                </ActiveChip>
              )}
              {categoryId && (
                <ActiveChip label="category" onClear={() => updateParams({ categoryId: '' })}>
                  Category: {categoryName || 'selected category'}
                </ActiveChip>
              )}
            </div>
          )}

          {rangeInvalid && (
            <p role="alert" className="text-xs font-medium text-danger">
              The start date falls after the end date, so no entries can match.
            </p>
          )}
        </section>
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
      ) : loans.length === 0 ? (
        renderEmptyState()
      ) : (
        <div className="space-y-4">
          <p className="px-1 text-xs text-muted">
            {loans.length} {loans.length === 1 ? 'entry' : 'entries'}
            {hasFilters ? ' matching these filters' : ''}
          </p>
          {loans.map((loan) => (
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

      <ReturnLoanDialog
        loan={modal?.mode === 'return' ? modal.loan : null}
        open={modal?.mode === 'return'}
        onClose={() => setModal(null)}
        onReturned={handleReturned}
      />
    </div>
  );
}
