import { useState } from 'react';
import type { Settings } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { forgetUnlockedKey, lockAiKey } from '../lib/aiKey';
import { Button, Card, Field, Input } from './ui';

/**
 * The key for the photo AI on bulk photo add. Saved locked with Face ID in
 * the synced settings, so it unlocks on the saver's other devices too.
 */
export function PhotoAiSettings({ settings, actions }: { settings: Settings; actions: AppActions }) {
  const keys = settings.aiKeys ?? [];
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const locked = await lockAiKey(key);
      actions.updateSettings({ ...settings, aiKeys: [...keys, locked] });
      setKey('');
      setAdding(false);
      setMessage('✓ Saved and locked with Face ID');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save the key');
    }
    setBusy(false);
  }

  return (
    <Card title="Photo AI">
      <p className="mb-3 text-sm text-slate-500">
        Lets "Add from photos" suggest the category, women's/men's and a name for each photo, flag the ones it isn't sure about, and spot items already in stock
        under a different photo. Uses an Anthropic API key (console.anthropic.com, pay as you go - well under 1p a photo). The key is locked with Face ID and
        unlocks on your other devices signed in to the same Apple ID; others sharing the data can't read it and add their own.
      </p>
      {keys.length > 0 && !adding ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-700 dark:text-slate-200">
            🔒 {keys.length === 1 ? 'Key saved' : `${keys.length} keys saved`} (one per Apple ID)
          </span>
          <div className="flex gap-2">
            <Button onClick={() => setAdding(true)}>Add my own key</Button>
            <Button
              onClick={() => {
                if (!window.confirm('Remove every saved photo AI key, from all devices?')) return;
                forgetUnlockedKey();
                actions.updateSettings({ ...settings, aiKeys: [] });
                setMessage(null);
              }}
            >
              Remove all
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Field label="API key">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" spellCheck={false} />
          </Field>
          <Button variant="primary" className="w-full" disabled={busy || !key.trim().startsWith('sk-ant-')} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save with Face ID'}
          </Button>
        </div>
      )}
      {message && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>}
    </Card>
  );
}
