// Penny — reusable bottom-sheet form for adding/editing EMIs, subscriptions, money-map items.
import { useState } from 'react';

export interface Field {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'toggle';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export type FormValues = Record<string, string | number | boolean | undefined>;

export function EditSheet({
  open,
  title,
  fields,
  initial,
  saveLabel = 'Save',
  onSave,
  onClose,
  onDelete,
}: {
  open: boolean;
  title: string;
  fields: Field[];
  initial: FormValues;
  saveLabel?: string;
  onSave: (values: FormValues) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const [vals, setVals] = useState<FormValues>(initial);
  const [seed, setSeed] = useState(initial);
  if (open && seed !== initial) {
    setSeed(initial);
    setVals(initial);
  }

  const set = (k: string, v: string | number | boolean) => setVals((cur) => ({ ...cur, [k]: v }));

  const submit = () => {
    const out: FormValues = {};
    for (const f of fields) {
      const raw = vals[f.key];
      if (f.type === 'number') out[f.key] = raw === '' || raw == null ? undefined : Number(raw);
      else if (f.type === 'toggle') out[f.key] = !!raw;
      else if (f.type === 'date') out[f.key] = raw ? String(raw) : undefined;
      else out[f.key] = raw != null ? String(raw) : undefined;
    }
    onSave(out);
  };

  return (
    <>
      <div className={`sheet-dim${open ? ' open' : ''}`} style={{ zIndex: 70 }} onClick={onClose} />
      <div className={`sheet${open ? ' open' : ''}`} style={{ zIndex: 71, maxHeight: '80%', overflowY: 'auto' }}>
        <div className="h-display" style={{ fontSize: 17, padding: '0 6px 12px' }}>{title}</div>
        {fields.map((f) => (
          <div className="es-field" key={f.key} style={{ borderTop: '1px solid var(--line)' }}>
            <span className="lab">{f.label}</span>
            {f.type === 'select' ? (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {f.options!.map((o) => (
                  <button
                    key={o.value}
                    className="chip-btn"
                    style={{ padding: '4px 10px', fontSize: 11.5, ...(String(vals[f.key]) === o.value ? { background: 'var(--accent-tint)', borderColor: 'var(--accent)', color: 'var(--accent-deep)' } : {}) }}
                    onClick={() => set(f.key, o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </span>
            ) : f.type === 'toggle' ? (
              <button
                className={`groc-check${vals[f.key] ? ' on' : ''}`}
                onClick={() => set(f.key, !vals[f.key])}
                aria-label={f.label}
                style={{ alignSelf: 'flex-end' }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5L19.5 7" /></svg>
              </button>
            ) : (
              <input
                className="es-input"
                inputMode={f.type === 'number' ? 'decimal' : f.type === 'date' ? 'none' : 'text'}
                type={f.type === 'date' ? 'date' : 'text'}
                placeholder={f.placeholder || '—'}
                value={vals[f.key] == null ? '' : String(vals[f.key])}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {onDelete && (
            <button
              onClick={onDelete}
              className="chip-btn"
              style={{ color: 'var(--coral-deep)', borderColor: 'var(--coral-tint)' }}
            >
              Delete
            </button>
          )}
          <button className="xp-save" style={{ flex: 1, borderRadius: 14 }} onClick={submit}>{saveLabel}</button>
        </div>
      </div>
    </>
  );
}
