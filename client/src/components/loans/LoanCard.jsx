import { BellOff, BellRing, CalendarClock, Check, Settings2, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../utils/cn.js';
import { dueLabel, dueTone, formatDate, formatDateTime, isOverdue } from '../../utils/formatDate.js';
import Button from '../common/Button.jsx';
import PriorityBadge from '../common/PriorityBadge.jsx';
import StatusBadge from '../common/StatusBadge.jsx';
import { CategoryIcon } from '../items/ItemCard.jsx';

function reminderState(loan) {
  const reminders = loan.reminders ?? {};

  if (!reminders.enabled) {
    return { tone: 'muted', icon: BellOff, text: 'Automatic reminders off' };
  }
  if (reminders.frequency === 'manual') {
    return { tone: 'muted', icon: BellRing, text: 'Manual reminders only' };
  }
  if (!loan.deliveryChannels?.length) {
    return {
      tone: 'warn',
      icon: BellOff,
      text: 'No usable channel — consent or contact details missing',
    };
  }
  if (!reminders.nextDueAt) {
    return { tone: 'muted', icon: BellRing, text: 'All scheduled reminders logged' };
  }
  return {
    tone: 'ok',
    icon: BellRing,
    text: `Next reminder ${formatDateTime(reminders.nextDueAt)}`,
  };
}

const TONES = {
  ok: 'text-muted',
  muted: 'text-muted',
  warn: 'font-medium text-pending',
};

const DUE_TONES = {
  danger: 'text-danger',
  pending: 'text-pending',
  ink: 'text-ink',
  muted: 'text-muted',
};

export default function LoanCard({
  loan,
  role,
  busy = false,
  onReturn,
  onRemind,
  onReschedule,
  onSettings,
}) {
  const item = loan.itemId;
  const lending = role === 'lent';
  const active = loan.status === 'active';
  const overdue = isOverdue(loan);
  const counterparty = lending ? loan.borrower : loan.lenderId;
  const state = reminderState(loan);
  const StateIcon = state.icon;

  return (
    <article className="panel p-4 transition-colors hover:border-faint sm:p-5">
      <div className="flex gap-4">
        <Link
          to={item ? `/items/${item._id}` : `/loans/${loan._id}`}
          aria-label={loan.itemName}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-soft text-primary"
        >
          {item?.imageUrl ? (
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <CategoryIcon category={loan.categoryId?.name} className="h-7 w-7" />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/loans/${loan._id}`}
                className="line-clamp-1 font-semibold text-ink hover:text-primary"
              >
                {loan.itemName}
              </Link>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
                <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {lending ? 'Lent to ' : 'Borrowed from '}
                {lending && loan.borrowerId?._id ? (
                  <Link
                    to={`/borrowers/${loan.borrowerId._id}`}
                    className="font-medium text-ink hover:text-primary hover:underline"
                  >
                    {counterparty?.name ?? 'Unknown user'}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{counterparty?.name ?? 'Unknown user'}</span>
                )}
                {loan.categoryId?.name && (
                  <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-medium text-muted ring-1 ring-inset ring-line">
                    {loan.categoryId.name}
                  </span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {lending && <PriorityBadge priority={loan.priority} source={loan.prioritySource} />}
              {overdue ? (
                <StatusBadge status="overdue" label="Overdue" />
              ) : (
                <StatusBadge status={loan.status} />
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDate(loan.lentAt)} → {formatDate(loan.dueDate)}
            </span>
            <span className={cn('font-semibold', DUE_TONES[dueTone(loan)])}>
              {dueLabel(loan)}
            </span>
          </div>

          {lending && active && (
            <p className={cn('mt-2 flex items-center gap-1.5 text-xs', TONES[state.tone])}>
              <StateIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {state.text}
            </p>
          )}
        </div>
      </div>

      {lending && active && (onSettings || onReschedule || onRemind || onReturn) && (
        <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {onSettings && (
            <Button variant="ghost" size="sm" onClick={onSettings} disabled={busy}>
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Settings
            </Button>
          )}
          {onReschedule && (
            <Button variant="secondary" size="sm" onClick={onReschedule} disabled={busy}>
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
              Deadline and priority
            </Button>
          )}
          {onRemind && (
            <Button variant="secondary" size="sm" onClick={onRemind} disabled={busy}>
              <BellRing className="h-4 w-4" aria-hidden="true" />
              Send reminder
            </Button>
          )}
          {onReturn && (
            <Button variant="success" size="sm" onClick={onReturn} loading={busy}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Mark returned
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
