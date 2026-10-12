'use client';

import Link from 'next/link';
import { ErrorAlert } from '@/shared/components/ErrorAlert';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { formatDateTime } from '@/shared/lib/format';
import { useUpload, useUploadResults } from '../api/uploadsApi';
import { Upload } from '../types/upload.types';
import { ProcessingProgress, StatusBadge } from './ProcessingStatus';
import { ResultsTable } from './ResultsTable';

export function UploadDetail({ id }: { id: string }) {
  const uploadQuery = useUpload(id);
  const upload = uploadQuery.data;
  const resultsQuery = useUploadResults(id, upload?.status === 'COMPLETED');

  return (
    <section className="space-y-6">
      <Link href="/uploads" className="text-sm text-emerald-700 hover:underline">
        ← Back to uploads
      </Link>

      {uploadQuery.isPending && <LoadingSpinner label="Loading upload..." />}
      {uploadQuery.isError && <ErrorAlert error={uploadQuery.error} />}

      {upload && (
        <>
          <UploadSummaryCard upload={upload} />
          <ProcessingProgress status={upload.status} />

          {upload.status === 'FAILED' && (
            <ErrorReport title="The file could not be processed" message={upload.errorMessage} />
          )}

          {upload.status === 'COMPLETED' && (
            <>
              {upload.errorMessage && (
                <ErrorReport
                  title={`${upload.failedRows ?? 0} rows were rejected`}
                  message={upload.errorMessage}
                />
              )}
              <h2 className="text-lg font-semibold">Processed data</h2>
              {resultsQuery.isPending && <LoadingSpinner label="Loading results..." />}
              {resultsQuery.isError && <ErrorAlert error={resultsQuery.error} />}
              {resultsQuery.data && <ResultsTable rows={resultsQuery.data.data} />}
            </>
          )}
        </>
      )}
    </section>
  );
}

function UploadSummaryCard({ upload }: { upload: Upload }) {
  const counters = [
    { label: 'Total rows', value: upload.totalRows },
    { label: 'Processed rows', value: upload.processedRows },
    { label: 'Failed rows', value: upload.failedRows },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold break-all">{upload.fileName}</h1>
        <StatusBadge status={upload.status} />
      </div>
      <p className="mt-1 text-sm text-slate-500">Uploaded {formatDateTime(upload.createdAt)}</p>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        {counters.map((counter) => (
          <div key={counter.label}>
            <dt className="text-xs text-slate-500">{counter.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{counter.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** errorMessage holds one error per line ("Row N, column X: ..."), so each line is listed. */
function ErrorReport({ title, message }: { title: string; message: string | null }) {
  const lines = message?.split('\n').filter(Boolean) ?? [];

  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-medium">{title}</p>
      {lines.length > 0 && (
        <ul className="mt-2 max-h-64 list-disc space-y-0.5 overflow-y-auto pl-5 font-mono text-xs">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
