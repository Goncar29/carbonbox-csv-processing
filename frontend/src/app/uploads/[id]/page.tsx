import { UploadDetail } from '@/features/document-processing/components/UploadDetail';

interface UploadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function UploadDetailPage({ params }: UploadDetailPageProps) {
  const { id } = await params;
  return <UploadDetail id={id} />;
}
