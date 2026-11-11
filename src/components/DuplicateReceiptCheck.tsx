import { useState } from 'react';
import type { Expense } from '../lib/types';
import { loadPhotoBlob, photoFingerprint } from '../lib/photos';
import { findDuplicateReceipts, type DuplicateGroup } from '../lib/receiptDuplicates';
import { Button, Card } from './ui';

/**
 * Looks through every receipt and invoice already on a cost for ones entered
 * twice. It only lists them - the person opens each cost and decides.
 */
export function DuplicateReceiptCheck({
  expenses,
  describe,
  onEdit,
  className = '',
}: {
  expenses: Expense[];
  describe: (e: Expense) => string;
  onEdit: (e: Expense) => void;
  className?: string;
}) {
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [result, setResult] = useState<{ groups: DuplicateGroup<Expense>[]; unread: number } | null>(null);

  async function run() {
    // Receipts added before upload fingerprints existed: fingerprint the stored copy instead.
    const todo = expenses.filter((e) => e.voidedAt === null).flatMap((e) => e.attachmentIds.filter((id) => !e.attachmentHashes[id]));
    const ids = [...new Set(todo)];
    const fileHashes = new Map<string, string>();
    let unread = 0;
    setResult(null);
    setProgress({ done: 0, of: ids.length });
    for (const [n, id] of ids.entries()) {
      const blob = await loadPhotoBlob(id).catch(() => null);
      const hash = blob ? await photoFingerprint(blob).catch(() => null) : null;
      if (hash) fileHashes.set(id, hash);
      else unread++;
      setProgress({ done: n + 1, of: ids.length });
    }
    setProgress(null);
    setResult({ groups: findDuplicateReceipts(expenses, fileHashes), unread });
  }

  return (
    <Card title="Duplicate receipts" className={className}>
      <p className="mb-3 text-xs text-slate-500">
        Looks for the same receipt or invoice file on more than one cost, and for two costs with the same date and amount. Nothing is changed - open a cost to
        check it.
      </p>
      <Button className="w-full" disabled={progress !== null} onClick={() => void run()}>
        {progress ? `Checking… ${progress.done} of ${progress.of}` : result ? 'Check again' : 'Check for duplicates'}
      </Button>
      {result && (
        <div className="mt-3 space-y-3">
          {result.groups.length === 0 ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">No duplicates found.</p>
          ) : (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {result.groups.length} possible duplicate{result.groups.length === 1 ? '' : 's'}
            </p>
          )}
          {result.groups.map((g, n) => (
            <div key={n} className="rounded-lg border border-amber-200 bg-amber-50 p-2 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="mb-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                {g.kind === 'file' ? (g.expenses.length === 1 ? 'Same file added twice to one cost' : 'Same receipt file') : 'Same date and amount'}
              </div>
              <ul className="space-y-1">
                {g.expenses.map((e) => (
                  <li key={e.id}>
                    <button type="button" className="text-left text-sm text-brand-700 underline dark:text-brand-300" onClick={() => onEdit(e)}>
                      {describe(e)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {result.unread > 0 && (
            <p className="text-xs text-slate-500">
              {result.unread} file{result.unread === 1 ? '' : 's'} couldn't be opened (offline or not synced yet), so only their dates and amounts were checked.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
