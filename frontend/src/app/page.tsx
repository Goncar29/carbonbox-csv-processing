import Link from 'next/link';
import { UploadsSummary } from '@/features/document-processing/components/UploadsSummary';

export default function DashboardPage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/uploads/new"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          New upload
        </Link>
      </div>
      <UploadsSummary />
    </section>
  );
}
