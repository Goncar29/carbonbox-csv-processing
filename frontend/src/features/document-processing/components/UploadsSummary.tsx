'use client';

import { ErrorAlert } from '@/shared/components/ErrorAlert';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { useUploadsSummary } from '../api/uploadsApi';

export function UploadsSummary() {
  const { data, isPending, isError, error } = useUploadsSummary();

  if (isPending) return <LoadingSpinner label="Loading summary..." />;
  if (isError) return <ErrorAlert error={error} />;

  const cards = [
    { label: 'Total uploads', value: data.total, accent: 'text-slate-900' },
    { label: 'Completed', value: data.completed, accent: 'text-green-700' },
    // "In progress" covers both queued and running uploads.
    { label: 'In progress', value: data.pending + data.processing, accent: 'text-blue-700' },
    { label: 'Failed', value: data.failed, accent: 'text-red-700' },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5">
          <dt className="text-sm text-slate-500">{card.label}</dt>
          <dd className={`mt-1 text-3xl font-semibold tabular-nums ${card.accent}`}>{card.value}</dd>
        </div>
      ))}
    </dl>
  );
}
