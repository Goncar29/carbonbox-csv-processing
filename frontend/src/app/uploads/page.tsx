import Link from 'next/link';
import { UploadList } from '@/features/document-processing/components/UploadList';

interface UploadsPageProps {
  searchParams: Promise<{ page?: string }>;
}

const parsePage = (value: string | undefined): number => {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
};

export default async function UploadsPage({ searchParams }: UploadsPageProps) {
  const page = parsePage((await searchParams).page);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Uploads</h1>
        <Link
          href="/uploads/new"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          New upload
        </Link>
      </div>
      <UploadList page={page} />
    </section>
  );
}
