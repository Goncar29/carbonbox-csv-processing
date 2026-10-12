import { getErrorMessage } from '../lib/api-client';

export function ErrorAlert({ error }: { error: unknown }) {
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {getErrorMessage(error)}
    </div>
  );
}
