import { STATUS_LABEL, STATUS_TONE, type OsStatus } from '@/lib/os/status';

export function StatusBadge({ status, className = '' }: { status: OsStatus; className?: string }) {
  return (
    <span className={`badge ${STATUS_TONE[status]} ${className}`}>{STATUS_LABEL[status]}</span>
  );
}
