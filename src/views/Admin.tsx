import { useState } from 'react';
import type { AppState } from '../lib/types';
import type { AppActions } from '../lib/useAppState';
import { listValues, usageCount, type ListKind } from '../lib/lists';
import { Button, Card, Input, PageHeader, Select } from '../components/ui';

const SECTIONS: { kind: Exclude<ListKind, 'subcategories'>; title: string; hint: string; noun: string }[] = [
  { kind: 'categories', title: 'Stock categories', hint: 'Tap a category to manage its types (e.g. Tops → T-shirts).', noun: 'item' },
  { kind: 'storageAreas', title: 'Storage areas', hint: 'Where stock is kept. Racks and boxes are typed per item.', noun: 'item' },
  { kind: 'salesChannels', title: 'Where you sell', hint: 'Offered when recording a sale.', noun: 'sale' },
  { kind: 'expenseCategories', title: 'Cost types', hint: 'Offered when adding a running cost. Tax headings are set on the Finance tab.', noun: 'cost' },
];

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

export function AdminView({ state, actions }: { state: AppState; actions: AppActions }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Admin" />
      <p className="-mt-3 mb-4 text-sm text-slate-500">
        Add, rename, reorder or delete the choices used across the app. Renaming updates everything already using that name.
      </p>
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <Card key={s.kind} title={s.title}>
            <p className="mb-3 text-xs text-slate-500">{s.hint}</p>
            <ListEditor state={state} actions={actions} kind={s.kind} noun={s.noun} />
          </Card>
        ))}
      </div>
    </div>
  );
}

function ListEditor({ state, actions, kind, noun, parent }: { state: AppState; actions: AppActions; kind: ListKind; noun: string; parent?: string }) {
  const values = listValues(state.settings, kind, parent);
  const [adding, setAdding] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {values.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">None yet</li>}
        {values.map((name, i) => (
          <Row
            key={name}
            state={state}
            actions={actions}
            kind={kind}
            noun={noun}
            parent={parent}
            name={name}
            first={i === 0}
            last={i === values.length - 1}
            expanded={open === name}
            onToggle={() => setOpen(open === name ? null : name)}
          />
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!adding.trim()) return;
          if (values.includes(adding.trim())) return window.alert(`"${adding.trim()}" is already in the list.`);
          actions.editList({ kind, op: 'add', name: adding, parent });
          setAdding('');
        }}
      >
        <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={parent ? `New type of ${parent.toLowerCase()}` : 'Add new…'} aria-label="Add new" className="flex-1" />
        <Button type="submit" disabled={!adding.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

function Row({
  state,
  actions,
  kind,
  noun,
  parent,
  name,
  first,
  last,
  expanded,
  onToggle,
}: {
  state: AppState;
  actions: AppActions;
  kind: ListKind;
  noun: string;
  parent?: string;
  name: string;
  first: boolean;
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const others = listValues(state.settings, kind, parent).filter((v) => v !== name);
  const [moveTo, setMoveTo] = useState(others[0] ?? '');
  const used = usageCount(state, kind, name, parent);
  const subs = kind === 'categories' ? (state.settings.subcategories[name] ?? []) : [];
  const iconButton = 'shrink-0 rounded-md px-2 py-1 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800';

  function rename() {
    const to = window.prompt(`Rename "${name}" to:`, name)?.trim();
    if (!to || to === name) return;
    const merging = others.includes(to);
    if (merging && !window.confirm(`"${to}" already exists. Merge "${name}" into it?${used ? ` ${plural(used, noun)} will move across.` : ''}`)) return;
    actions.editList({ kind, op: 'rename', from: name, to, parent });
  }

  function remove() {
    if (used === 0) {
      if (window.confirm(`Delete "${name}"?`)) actions.editList({ kind, op: 'delete', name, moveTo: null, parent });
      return;
    }
    setDeleting(true);
  }

  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-1">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={kind === 'categories' ? onToggle : undefined}>
          <span className="block text-sm font-medium break-words text-slate-900 dark:text-slate-100">
            {kind === 'categories' && <span className="mr-1 inline-block w-3 text-slate-400">{expanded ? '▾' : '▸'}</span>}
            {name}
          </span>
          <span className="block text-xs text-slate-500">
            {used ? `${plural(used, noun)}` : `Not used`}
            {subs.length > 0 && ` · ${plural(subs.length, 'type')}`}
          </span>
        </button>
        <button type="button" className={`${iconButton} text-slate-500`} disabled={first} aria-label={`Move ${name} up`} onClick={() => actions.editList({ kind, op: 'move', name, by: -1, parent })}>
          ↑
        </button>
        <button type="button" className={`${iconButton} text-slate-500`} disabled={last} aria-label={`Move ${name} down`} onClick={() => actions.editList({ kind, op: 'move', name, by: 1, parent })}>
          ↓
        </button>
        <button type="button" className={`${iconButton} text-xs text-slate-500`} onClick={rename}>
          Rename
        </button>
        <button type="button" className={`${iconButton} text-xs text-red-600 dark:text-red-400`} onClick={remove}>
          Delete
        </button>
      </div>

      {deleting && (
        <div role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <p>
            <strong>
              {plural(used, noun)} {used === 1 ? 'uses' : 'use'} "{name}".
            </strong>{' '}
            Move {used === 1 ? 'it' : 'them'} to another {kind === 'subcategories' ? 'type' : 'choice'} before deleting, so nothing is left with a name that's no longer on the list.
          </p>
          {others.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>Move to</span>
              <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="w-auto flex-1 py-1" aria-label="Move to">
                {others.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {others.length > 0 && (
              <Button variant="primary" onClick={() => actions.editList({ kind, op: 'delete', name, moveTo, parent })}>
                Move &amp; delete
              </Button>
            )}
            <Button
              onClick={() => {
                if (window.confirm(`Delete "${name}" and leave ${plural(used, noun)} still labelled "${name}"?`)) actions.editList({ kind, op: 'delete', name, moveTo: null, parent });
              }}
            >
              Delete, keep label
            </Button>
            <Button onClick={() => setDeleting(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {expanded && kind === 'categories' && (
        <div className="mt-2 border-l-2 border-brand-200 pl-3 dark:border-brand-900">
          <p className="mb-2 text-xs text-slate-500">Types of {name.toLowerCase()} (optional)</p>
          <ListEditor state={state} actions={actions} kind="subcategories" noun="item" parent={name} />
        </div>
      )}
    </li>
  );
}
