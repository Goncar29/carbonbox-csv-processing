import { ActivityData } from '../types/upload.types';

export function ResultsTable({ rows }: { rows: ActivityData[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">No valid rows were saved for this file.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-4 py-2 font-medium">Category</th>
            <th className="px-4 py-2 text-right font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Unit</th>
            <th className="px-4 py-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={`${row.category}-${row.date}-${index}`}>
              <td className="px-4 py-2">{row.category}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.amount}</td>
              <td className="px-4 py-2">{row.unit}</td>
              <td className="px-4 py-2 tabular-nums">{row.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
