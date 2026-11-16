import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { TextField } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import {
  addScopeItem,
  deleteScopeItem,
  updateScopeItem,
  type ScopeItem,
  type ScopeItemKind,
  type ScopeVersion,
} from '../../lib/api/scope';
import { errorMessages, toApiError } from '../../lib/api/errors';
import { LIMITS, validateItemText } from '../../lib/domain/project';
import { kindHeading } from '../../lib/domain/format';

const singular: Record<ScopeItemKind, string> = {
  deliverable: 'deliverable',
  exclusion: 'exclusion',
  assumption: 'assumption',
};

const withArticle: Record<ScopeItemKind, string> = {
  deliverable: 'a deliverable',
  exclusion: 'an exclusion',
  assumption: 'an assumption',
};

const iconBtn =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:text-slate-300';

/** Editable list of one kind of scope item in the draft. Every change is saved immediately. */
export function ScopeItemsEditor({
  version,
  kind,
  disabled,
  onChanged,
}: {
  version: ScopeVersion;
  kind: ScopeItemKind;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const items = version.scope_items.filter((i) => i.kind === kind);
  const [newText, setNewText] = useState('');
  const [newError, setNewError] = useState<string>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addId = `add-${kind}`;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorMessages[toApiError(e).code]);
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const err = validateItemText(newText);
    setNewError(err);
    if (err || busy) return;
    const next = items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1;
    await run(async () => {
      await addScopeItem(version.id, kind, newText.trim(), next);
      setNewText('');
    });
    document.getElementById(addId)?.focus();
  }

  async function onSaveEdit(item: ScopeItem) {
    const err = validateItemText(editText);
    setEditError(err);
    if (err || busy) return;
    await run(async () => {
      await updateScopeItem(item.id, { description: editText.trim() });
      setEditingId(null);
    });
  }

  async function move(index: number, delta: -1 | 1) {
    const a = items[index];
    const b = items[index + delta];
    if (!a || !b) return;
    // Swap positions; equal sort_order values are normalised to the list position first.
    const posA = a.sort_order === b.sort_order ? index + 1 : a.sort_order;
    const posB = a.sort_order === b.sort_order ? index + 1 + delta : b.sort_order;
    await run(async () => {
      await updateScopeItem(a.id, { sort_order: posB });
      await updateScopeItem(b.id, { sort_order: posA });
    });
  }

  return (
    <section aria-labelledby={`${kind}-heading`} className="space-y-2">
      <h4 id={`${kind}-heading`} className="text-sm font-semibold text-slate-800">
        {kindHeading[kind]}
      </h4>
      {error && <Alert tone="error">{error}</Alert>}
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">None yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={item.id} className="rounded-md border border-slate-200 bg-white p-2">
              {editingId === item.id ? (
                <div className="space-y-2">
                  <TextField
                    id={`edit-${item.id}`}
                    label={`Edit ${singular[kind]}`}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    error={editError}
                    maxLength={LIMITS.item + 1}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button type="button" busy={busy} onClick={() => void onSaveEdit(item)}>
                      Save
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words py-2 pl-1 text-sm">{item.description}</p>
                  <div className="flex shrink-0 flex-wrap justify-end">
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={disabled || busy || i === 0}
                      onClick={() => void move(i, -1)}
                      aria-label={`Move "${item.description}" up`}
                    >
                      <ArrowUp aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={disabled || busy || i === items.length - 1}
                      onClick={() => void move(i, 1)}
                      aria-label={`Move "${item.description}" down`}
                    >
                      <ArrowDown aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={disabled || busy}
                      onClick={() => {
                        setEditingId(item.id);
                        setEditText(item.description);
                        setEditError(undefined);
                      }}
                      aria-label={`Edit "${item.description}"`}
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className={iconBtn}
                      disabled={disabled || busy}
                      onClick={() => void run(() => deleteScopeItem(item.id))}
                      aria-label={`Remove "${item.description}"`}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <form noValidate onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <TextField
            id={addId}
            label={`Add ${withArticle[kind]}`}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            error={newError}
            maxLength={LIMITS.item + 1}
            disabled={disabled}
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          busy={busy}
          disabled={disabled}
          className="sm:mt-6"
        >
          Add
        </Button>
      </form>
    </section>
  );
}
