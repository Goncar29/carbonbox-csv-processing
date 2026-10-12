import { UploadForm } from '@/features/document-processing/components/UploadForm';

export default function NewUploadPage() {
  return (
    <section className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">New upload</h1>
      <UploadForm />
    </section>
  );
}
