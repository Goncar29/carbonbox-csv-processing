import { UploadStatus } from '../types/upload.types';

const BADGE_STYLES: Record<UploadStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 ring-yellow-300',
  PROCESSING: 'bg-blue-100 text-blue-800 ring-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 ring-green-300',
  FAILED: 'bg-red-100 text-red-800 ring-red-300',
};

export function StatusBadge({ status }: { status: UploadStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${BADGE_STYLES[status]}`}>
      {status}
    </span>
  );
}

/**
 * The worker stores row counters only when it finishes, so while PROCESSING the bar is
 * indeterminate instead of showing a fake percentage.
 */
export function ProcessingProgress({ status }: { status: UploadStatus }) {
  if (status !== 'PENDING' && status !== 'PROCESSING') return null;
  const label = status === 'PENDING' ? 'Waiting in queue...' : 'Processing file...';

  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-600">{label} (refreshing every 3 seconds)</p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label={label}>
        <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
      </div>
    </div>
  );
}
