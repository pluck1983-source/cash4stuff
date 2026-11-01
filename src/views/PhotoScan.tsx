import { useEffect, useRef, useState } from 'react';
import type { AiSuggestion, AppState, Item, ItemGender } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { categoryLabel, GENDER_LABELS, GENDER_OPTIONS, isHeld, UNCATEGORISED } from '../lib/calc';
import { loadPhotoBlob } from '../lib/photos';
import { routeHref } from '../lib/router';
import { unlockAiKey } from '../lib/aiKey';
import { acceptSuggestion, suggestionDiffers } from '../lib/aiReview';
import { Button, Empty, Field, Input, PageHeader, Select } from '../components/ui';
import { Photo } from '../components/Photo';

/**
 * Runs the photo AI over stock that was added before it (or without it), and
 * lists the items where it disagrees with what's recorded, to accept or keep.
 * Nothing changes until a suggestion is accepted.
 */
export function PhotoScanView({ state, actions }: { state: AppState; actions: AppActions }) {
  const [category, setCategory] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  // Items dealt with on this visit stay in the list (with what was done) until
  // the page is left, so they don't vanish from under your finger.
  const [handled, setHandled] = useState<Record<string, { done: string; suggestion: AiSuggestion }>>({});
  const [amending, setAmending] = useState<string | null>(null);
  // Leaving the page stops the scan; what's done so far is kept.
  useEffect(() => () => void (stopRef.current = true), []);

  const inScope = (i: Item) =>
    !category || (category === UNCATEGORISED ? !state.settings.categories.includes(i.category) : i.category === category);
  const toScan = state.items.filter((i) => isHeld(i) && i.photoId && !i.aiScannedAt && inScope(i));
  const review = state.items.filter((i) => (i.aiSuggestion || handled[i.id]) && isHeld(i) && inScope(i));
  const open = review.filter((i) => i.aiSuggestion && !handled[i.id]);
  const sure = open.filter((i) => i.aiSuggestion?.sure);
  const keys = state.settings.aiKeys ?? [];

  async function scan() {
    setError(null);
    let apiKey: string | null;
    try {
      apiKey = await unlockAiKey(keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Face ID failed');
      return;
    }
    if (!apiKey) return;
    const key = apiKey;
    const { suggestFromPhoto } = await import('../lib/autoCategorise');
    const queue = [...toScan];
    const total = queue.length;
    let done = 0;
    stopRef.current = false;
    setProgress({ done, total });
    const worker = async () => {
      for (let item = queue.shift(); item && !stopRef.current; item = queue.shift()) {
        try {
          const photo = await loadPhotoBlob(item.photoId!);
          if (photo) {
            const s = await suggestFromPhoto(photo, state.settings, key);
            actions.patchItem(item.id, { aiScannedAt: new Date().toISOString(), ...(suggestionDiffers(item, s) ? { aiSuggestion: s } : {}) });
          }
        } catch (e) {
          // A bad key or empty balance fails every photo, so stop at the first.
          if (e instanceof Error && 'status' in e && (e.status === 401 || e.status === 403 || e.status === 400)) {
            stopRef.current = true;
            setError(`The photo AI stopped: ${e.message}. Check the key and credit in Settings.`);
          }
        }
        setProgress({ done: ++done, total });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setProgress(null);
  }

  const markDone = (item: Item, done: string) => item.aiSuggestion && setHandled((h) => ({ ...h, [item.id]: { done, suggestion: item.aiSuggestion! } }));
  const accept = (item: Item) => {
    if (!item.aiSuggestion) return;
    markDone(item, '✓ Accepted');
    actions.patchItem(item.id, acceptSuggestion(item, item.aiSuggestion));
  };
  const keep = (item: Item) => {
    markDone(item, '✓ Kept as it was');
    actions.patchItem(item.id, { aiSuggestion: undefined });
  };
  const amend = (item: Item, changes: Pick<Item, 'name' | 'gender' | 'category' | 'subcategory'>) => {
    markDone(item, '✓ Amended');
    actions.patchItem(item.id, { ...changes, aiSuggestion: undefined, needsCheck: false });
    setAmending(null);
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Scan stock photos" back={routeHref({ name: 'settings' })} />
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        The photo AI looks at each stock photo it hasn't seen yet and suggests a category, women's/men's and a name. Only the items where it disagrees with what's
        recorded are listed below - nothing changes until you accept. Photos added from now on are checked as they're added.
      </p>
      {keys.length === 0 ? (
        <Empty>
          Save an API key in <a className="underline" href={routeHref({ name: 'settings' })}>Settings &gt; Photo AI</a> first.
        </Empty>
      ) : (
        <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <Field label="Which stock">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} disabled={progress !== null}>
              <option value="">All categories</option>
              {state.settings.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option value={UNCATEGORISED}>Uncategorised</option>
            </Select>
          </Field>
          {progress ? (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
                <div className="h-full bg-brand-600" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>
                  Scanned {progress.done} of {progress.total} - keep this page open
                </span>
                <Button onClick={() => (stopRef.current = true)}>Stop</Button>
              </div>
            </div>
          ) : toScan.length > 0 ? (
            <Button variant="primary" className="w-full" onClick={() => void scan()}>
              ✨ Scan {toScan.length} photo{toScan.length === 1 ? '' : 's'} (about {Math.max(1, Math.round(toScan.length * 0.03))}p)
            </Button>
          ) : (
            <p className="text-sm text-slate-500">✓ Every photo here has been scanned.</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {review.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900 dark:text-slate-50">
              {open.length} to review{progress ? ' so far' : ''}
            </h2>
            {sure.length > 0 && (
              <Button
                onClick={() => {
                  if (window.confirm(`Accept the ${sure.length} suggestions the AI is sure about?`)) sure.forEach(accept);
                }}
              >
                Accept all sure ({sure.length})
              </Button>
            )}
          </div>
          <ul className="space-y-3">
            {review.map((item) => {
              const done = handled[item.id];
              const s = item.aiSuggestion ?? done!.suggestion;
              const suggested = { ...item, ...acceptSuggestion(item, s) };
              return (
                <li key={item.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
                  <a href={routeHref({ name: 'item', id: item.id })} className="shrink-0">
                    <Photo id={item.photoId} alt={item.name || item.category} className="h-24 w-24 rounded-md object-cover" />
                  </a>
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <div className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{item.sku}</div>
                    {done ? (
                      <>
                        <div className="font-medium text-slate-900 dark:text-slate-50">{[item.name, categoryLabel(item)].filter(Boolean).join(' · ') || 'No category'}</div>
                        <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{done.done}</div>
                      </>
                    ) : amending === item.id ? (
                      <AmendForm state={state} start={suggested} onSave={(changes) => amend(item, changes)} onCancel={() => setAmending(null)} />
                    ) : (
                      <>
                        <div className="text-slate-500 line-through">{[item.name, categoryLabel(item)].filter(Boolean).join(' · ') || 'No category'}</div>
                        <div className="font-medium text-slate-900 dark:text-slate-50">{[suggested.name, categoryLabel(suggested)].filter(Boolean).join(' · ')}</div>
                        {!s.sure && <div className="text-xs font-medium text-amber-700 dark:text-amber-400">⚠ AI not sure</div>}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button variant="primary" onClick={() => accept(item)}>
                            Accept
                          </Button>
                          <Button onClick={() => setAmending(item.id)}>Amend</Button>
                          <Button onClick={() => keep(item)}>Keep as is</Button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

/** Starts from the AI's answer so only what it got wrong needs changing */
function AmendForm({
  state,
  start,
  onSave,
  onCancel,
}: {
  state: AppState;
  start: Pick<Item, 'name' | 'gender' | 'category' | 'subcategory'>;
  onSave: (changes: Pick<Item, 'name' | 'gender' | 'category' | 'subcategory'>) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(start);
  const subs = state.settings.subcategories[d.category] ?? [];
  return (
    <div className="space-y-1.5">
      <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Name" aria-label="Name" />
      <Select value={d.gender} onChange={(e) => setD({ ...d, gender: e.target.value as ItemGender })} aria-label="Women's or men's">
        <option value="">Women's/men's?</option>
        {GENDER_OPTIONS.map((g) => (
          <option key={g} value={g}>
            {GENDER_LABELS[g]}
          </option>
        ))}
      </Select>
      <Select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value, subcategory: '' })} aria-label="Category">
        <option value="">Category?</option>
        {state.settings.categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      {subs.length > 0 && (
        <Select value={d.subcategory} onChange={(e) => setD({ ...d, subcategory: e.target.value })} aria-label="Sub-category">
          <option value="">Sub-category?</option>
          {subs.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="primary" onClick={() => onSave({ ...d, name: d.name.trim() })}>
          Save
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
