import { useState } from 'react';
import { forgetAiKey, hasAiKey, saveAiKey } from '../lib/aiKey';
import { Button, Card, Field, Input } from './ui';

/**
 * The key for "Suggest categories" on bulk photo add. Saved on this phone
 * only, locked with Face ID; each phone that wants it needs the key pasted in.
 */
export function PhotoAiSettings() {
  const [saved, setSaved] = useState(hasAiKey);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await saveAiKey(key);
      setKey('');
      setSaved(true);
      setMessage('✓ Saved and locked with Face ID');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save the key');
    }
    setBusy(false);
  }

  return (
    <Card title="Photo AI">
      <p className="mb-3 text-sm text-slate-500">
        Lets "Add from photos" suggest the category, women's/men's and a name for each photo, and flags the ones it isn't sure about. Uses an Anthropic API key
        (console.anthropic.com, pay as you go - about 0.03p a photo). The key stays on this phone, locked with Face ID, and isn't shared with other phones.
      </p>
      {saved ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-700 dark:text-slate-200">🔒 Key saved on this phone</span>
          <Button
            onClick={() => {
              if (!window.confirm('Remove the photo AI key from this phone?')) return;
              forgetAiKey();
              setSaved(false);
              setMessage(null);
            }}
          >
            Remove key
          </Button>
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
