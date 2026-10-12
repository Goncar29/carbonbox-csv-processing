'use client';

import { useRouter } from 'next/navigation';
import { ChangeEvent, DragEvent, FormEvent, useState } from 'react';
import { ErrorAlert } from '@/shared/components/ErrorAlert';
import { useCreateUpload } from '../api/uploadsApi';

const isCsvFile = (file: File): boolean => file.name.toLowerCase().endsWith('.csv');

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const createUpload = useCreateUpload(setProgress);

  const selectFile = (selected: File | undefined) => {
    if (!selected) return;
    if (!isCsvFile(selected)) {
      setFile(null);
      setValidationError('Only .csv files are allowed');
      return;
    }
    setValidationError(null);
    setFile(selected);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files[0]);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setProgress(0);
    createUpload.mutate(file, {
      onSuccess: (created) => router.push(`/uploads/${created.id}`),
    });
  };

  const isUploading = createUpload.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          isDragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <span className="font-medium">Drag & drop a CSV file here</span>
        <span className="mt-1 text-sm text-slate-500">or click to choose one</span>
        <span className="mt-3 font-mono text-xs text-slate-400">category,amount,unit,date</span>
        <input type="file" accept=".csv,text/csv" onChange={handleChange} className="sr-only" disabled={isUploading} />
      </label>

      {file && (
        <p className="text-sm text-slate-700">
          Selected: <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
        </p>
      )}
      {validationError && <p className="text-sm text-red-600">{validationError}</p>}
      {createUpload.isError && <ErrorAlert error={createUpload.error} />}

      {isUploading && (
        <div className="space-y-1">
          <p className="text-sm text-slate-600">Uploading... {progress}%</p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={!file || isUploading}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>
    </form>
  );
}
