'use client';

import Link from 'next/link';
import { ErrorAlert } from '@/shared/components/ErrorAlert';
import { LoadingSpinner } from '@/shared/components/LoadingSpinner';
import { formatDateTime } from '@/shared/lib/format';
import { PAGE_SIZE, useUploads } from '../api/uploadsApi';
import { Upload } from '../types/upload.types';
import { StatusBadge } from './ProcessingStatus';

export function UploadList({ page }: { page: number }) {
  const { data, isPending, isError, error, isFetching } = useUploads(page);

  if (isPending) return <LoadingSpinner label="Loading uploads..." />;
  if (isError) return <ErrorAlert error={error} />;

  if (data.total === 0) {
    return (
      <p className="text-sm text-slate-500">
        No uploads yet.{' '}
        <Link href="/uploads/new" className="text-emerald-700 hover:underline">
          Upload your first CSV
        </Link>
      </p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className={`space-y-4 ${isFetching ? 'opacity-70' : ''}`}>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">File name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Uploaded at</th>
              <th className="px-4 py-2 text-right font-medium">Processed rows</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.data.map((upload) => (
              <UploadRow key={upload.id} upload={upload} />
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={data.total} />
    </div>
  );
}

function UploadRow({ upload }: { upload: Upload }) {
  const processed =
    upload.totalRows === null ? '—' : `${upload.processedRows ?? 0} / ${upload.totalRows}`;

  return (
    <tr>
      <td className="max-w-xs truncate px-4 py-2" title={upload.fileName}>
        {upload.fileName}
      </td>
      <td className="px-4 py-2">
        <StatusBadge status={upload.status} />
      </td>
      <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(upload.createdAt)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{processed}</td>
      <td className="px-4 py-2">
        <Link href={`/uploads/${upload.id}`} className="text-emerald-700 hover:underline">
          View detail
        </Link>
      </td>
    </tr>
  );
}

function Pagination({ page, totalPages, total }: { page: number; totalPages: number; total: number }) {
  const linkClass = 'rounded-md border border-slate-300 bg-white px-3 py-1 hover:bg-slate-100';
  const disabledClass = 'rounded-md border border-slate-200 px-3 py-1 text-slate-300';

  return (
    <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-slate-500">
        Page {page} of {totalPages} · {total} uploads
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={`/uploads?page=${page - 1}`} className={linkClass}>
            Previous
          </Link>
        ) : (
          <span className={disabledClass}>Previous</span>
        )}
        {page < totalPages ? (
          <Link href={`/uploads?page=${page + 1}`} className={linkClass}>
            Next
          </Link>
        ) : (
          <span className={disabledClass}>Next</span>
        )}
      </div>
    </nav>
  );
}
