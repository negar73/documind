import { cn } from '@/lib/utils';
import type { DocumentDto } from '@/lib/dto';

type Status = DocumentDto['status'];

const STATUS_STYLES: Record<Status, { label: string; dot: string; badge: string; pulse?: boolean }> = {
  PENDING: {
    label: 'Queued',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300',
  },
  PROCESSING: {
    label: 'Processing',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    pulse: true,
  },
  READY: {
    label: 'Ready',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  FAILED: {
    label: 'Failed',
    dot: 'bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  },
};

/** Color-coded ingestion status chip (emerald / amber pulse / red / slate). */
export function StatusBadge({ status, error }: { status: Status; error?: string | null }) {
  const style = STATUS_STYLES[status];
  return (
    <span
      title={status === 'FAILED' && error ? error : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        style.badge
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', style.dot, style.pulse && 'animate-pulse')}
      />
      {style.label}
    </span>
  );
}
