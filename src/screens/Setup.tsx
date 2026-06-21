// Penny — Setup hub: schema-driven CRUD for every table. Categories have a
// bespoke tree editor; all other tables (accounts, transactions, EMIs, recurring,
// money-map) share one generic TableManager driven by the schema registry, with
// shared delete-confirmation + referential guards.
import { useState } from 'react';
import type { CategoryNode } from '../lib/types';
import { CATS, catStyle } from '../lib/data';
import { hasAnthropicKey } from '../lib/config';
import { generateCategoriesDirect } from '../lib/anthropic';
import { TABLE_ORDER, TABLE_SPECS } from '../lib/schema';
import { Icons } from '../components/Icons';
import { EditSheet, type FormValues } from '../components/EditSheet';
import { ConfirmDialog, type ConfirmOptions } from '../components/ConfirmDialog';
import { useApp } from '../state/AppContext';

const ICON_KEYS = ['cup', 'basket', 'car', 'bag', 'bolt', 'loop', 'heart', 'house', 'spark', 'arrowdown', 'dots'];
const PALETTE: [string, string][] = [
  ['#C98B2D', '#F4E7CC'], ['#5F7F50', '#E5ECDB'], ['#4E7A8A', '#DEEAEE'], ['#D96845', '#F8E2D8'],
  ['#8A6FB1', '#EAE3F2'], ['#B65C7E', '#F4DFE7'], ['#4F8F7B', '#DFEDE8'], ['#A8793C', '#F0E5D2'],
  ['#C2702E', '#F5E4D0'], ['#46613A', '#E5ECDB'], ['#968D7D', '#EFE8D8'],
];

const iconBtn: React.CSSProperties = { border: 0, background: 'transparent', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' };

export function Setup() {
  const app = useApp();
  const open = app.setupOpen;
  const [section, setSection] = useState<string | null>(null);

  // When the overlay opens from the menu with a target section (e.g. Categories),
  // jump straight to it. Adjusting state during render on an open-transition is the
  // documented React pattern (no effect needed → no cascading render).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSection(app.setupSection ?? null);
  }

  const back = () => (section ? setSection(null) : app.closeSetup());
  const spec = section && section !== 'categories' ? TABLE_SPECS[section] : null;
  const title = section === 'categories' ? 'Categories' : spec ? spec.label : 'Setup';
  const subtitle = section === 'categories'
    ? `${app.categories.length} categories · tap to edit`
    : spec ? `${spec.list(app).length} ${spec.label.toLowerCase()}` : 'Manage all your data';

  return (
    <div className={`ledger-overlay${open ? ' open' : ''}`}>
      <div className="ledger-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={back} style={{ border: 0, background: 'var(--surface)', width: 36, height: 36, borderRadius: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', boxShadow: 'var(--shadow-card)' }}>
            {section ? <Icons.chevR size={18} style={{ transform: 'rotate(180deg)' }} /> : <Icons.chevD size={18} />}
          </button>
          <div style={{ flex: 1 }}>
            <div className="h-display" style={{ fontSize: 19 }}>{title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{subtitle}</div>
          </div>
        </div>
      </div>

      <div className="ledger-scroll">
        {!section && <SetupMenu onPick={setSection} />}
        {section === 'categories' && <CategoriesPane />}
        {spec && <TableManager specId={section!} />}
      </div>
    </div>
  );
}

function SetupMenu({ onPick }: { onPick: (s: string) => void }) {
  const app = useApp();
  const rows: { id: string; label: string; sub: string; icon: string }[] = [
    { id: 'categories', label: 'Categories & subcategories', sub: `${app.categories.length} · edit tree · AI generate`, icon: 'dots' },
    ...TABLE_ORDER.map((id) => {
      const s = TABLE_SPECS[id];
      return { id, label: s.label, sub: `${s.list(app).length} ${s.label.toLowerCase()}`, icon: s.icon };
    }),
  ];
  return (
    <div style={{ margin: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => {
        const Ico = (Icons as Record<string, typeof Icons.dots>)[r.icon] || Icons.dots;
        return (
          <button key={r.id} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', border: 0, textAlign: 'left' }} onClick={() => onPick(r.id)}>
            <span className="icon-bub" style={{ background: 'var(--accent-tint)', color: 'var(--accent-deep)', width: 38, height: 38, borderRadius: 12 }}><Ico size={18} /></span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{r.label}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{r.sub}</span>
            </span>
            <Icons.chevR size={15} color="var(--muted)" />
          </button>
        );
      })}
    </div>
  );
}

// ---------------- generic table manager ----------------
function TableManager({ specId }: { specId: string }) {
  const app = useApp();
  const spec = TABLE_SPECS[specId];
  const rows = spec.list(app);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<{ rec: any | null } | null>(null);
  const [confirm, setConfirm] = useState<{ opts: ConfirmOptions; onYes: () => void } | null>(null);

  const openNew = () => setEditing({ rec: null });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openEdit = (rec: any) => {
    if (spec.editable && !spec.editable(rec)) { app.toast('Demo entry — add your own to edit'); return; }
    setEditing({ rec });
  };
  const onSave = (v: FormValues) => {
    if (!editing) return;
    if (editing.rec == null) spec.create(app, v);
    else spec.update(app, editing.rec, v);
    setEditing(null);
    app.toast(editing.rec == null ? `${spec.singular} added` : `${spec.singular} updated`);
  };
  const onDelete = () => {
    if (!editing || editing.rec == null) return;
    const rec = editing.rec;
    const ref = spec.refCount?.(app, rec);
    if (ref && ref.count > 0) {
      setEditing(null);
      setConfirm({ opts: { title: "Can't delete", blocked: true, cancelLabel: 'Got it', message: <>This {spec.singular.toLowerCase()} is used by <b>{ref.count}</b> {ref.noun}{ref.count > 1 ? 's' : ''}. Reassign or remove those first.</> }, onYes: () => {} });
      return;
    }
    setEditing(null);
    setConfirm({ opts: { title: `Delete ${spec.singular.toLowerCase()}?`, danger: true, confirmLabel: 'Delete', message: <>“{spec.primary(rec)}” will be removed. This can’t be undone.</> }, onYes: () => { spec.remove(app, rec); app.toast(`${spec.singular} deleted`); } });
  };

  return (
    <>
      <div style={{ margin: '14px 16px 0' }}>
        <button className="xp-save" style={{ width: '100%', borderRadius: 12, padding: 11 }} onClick={openNew}>+ Add {spec.singular.toLowerCase()}</button>
      </div>
      <div style={{ margin: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>Nothing yet — add your first {spec.singular.toLowerCase()}.</div>}
        {rows.map((r, i) => {
          const locked = spec.editable && !spec.editable(r);
          return (
            <button key={(r.id as string) || i} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', border: 0, textAlign: 'left', opacity: locked ? 0.6 : 1 }} onClick={() => openEdit(r)}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{spec.primary(r)}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>{spec.secondary(r, app)}</span>
              </span>
              {locked ? <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>demo</span> : <Icons.pencil size={14} color="var(--muted)" />}
            </button>
          );
        })}
      </div>

      <EditSheet
        open={!!editing}
        title={editing?.rec == null ? `Add ${spec.singular.toLowerCase()}` : `Edit ${spec.singular.toLowerCase()}`}
        fields={spec.fields(app)}
        initial={editing?.rec == null ? {} : spec.toForm(editing.rec)}
        saveLabel={editing?.rec == null ? 'Add' : 'Save'}
        onSave={onSave}
        onClose={() => setEditing(null)}
        onDelete={editing?.rec != null ? onDelete : undefined}
      />
      <ConfirmDialog open={!!confirm} opts={confirm?.opts || null} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.onYes(); setConfirm(null); }} />
    </>
  );
}

// ---------------- categories tree editor ----------------
type Editing = { kind: 'cat'; id: string } | { kind: 'sub'; catId: string; id: string } | null;

function CategoriesPane() {
  const app = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [editVal, setEditVal] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newSub, setNewSub] = useState('');
  const [gen, setGen] = useState<'idle' | 'working'>('idle');
  const [confirm, setConfirm] = useState<{ opts: ConfirmOptions; onYes: () => void } | null>(null);

  const startEdit = (kind: 'cat' | 'sub', id: string, label: string, catId?: string) => {
    setEditing(kind === 'cat' ? { kind, id } : { kind: 'sub', catId: catId!, id });
    setEditVal(label);
  };
  const commitEdit = () => {
    if (!editing) return;
    const v = editVal.trim();
    if (v) {
      if (editing.kind === 'cat') app.updateCategory(editing.id, { label: v });
      else app.updateSubcategory(editing.catId, editing.id, v);
    }
    setEditing(null);
    setEditVal('');
  };

  const askDeleteCat = (cat: CategoryNode) => {
    const used = app.categoryUsage(cat.id);
    if (used > 0) { setConfirm({ opts: { title: "Can't delete", blocked: true, cancelLabel: 'Got it', message: <>“{cat.label}” is used by <b>{used}</b> transaction{used > 1 ? 's' : ''}. Reassign or remove those first.</> }, onYes: () => {} }); return; }
    setConfirm({ opts: { title: 'Delete category?', danger: true, confirmLabel: 'Delete', message: <>Remove “{cat.label}” and its {cat.subs.length} subcategor{cat.subs.length === 1 ? 'y' : 'ies'}? This can’t be undone.</> }, onYes: () => app.removeCategory(cat.id) });
  };
  const askDeleteSub = (catId: string, subId: string, label: string) => {
    const used = app.categoryUsage(catId, subId);
    if (used > 0) { setConfirm({ opts: { title: "Can't delete", blocked: true, cancelLabel: 'Got it', message: <>“{label}” is used by <b>{used}</b> transaction{used > 1 ? 's' : ''}.</> }, onYes: () => {} }); return; }
    setConfirm({ opts: { title: 'Delete subcategory?', danger: true, confirmLabel: 'Delete', message: <>Remove “{label}”?</> }, onYes: () => app.removeSubcategory(catId, subId) });
  };

  const runGenerate = async () => {
    if (!hasAnthropicKey()) { app.toast('Add your AI key in Settings first'); return; }
    setGen('working');
    try {
      const res = await generateCategoriesDirect(`The user is in the UAE. They currently have these categories: ${app.categories.map((c) => c.label).join(', ')}.`);
      setGen('idle');
      if (!res || !res.length) { app.toast("Couldn't generate — try again"); return; }
      const tree: CategoryNode[] = res.map((c, i) => {
        const known = (CATS as Record<string, { color: string; tint: string; icon: string }>)[c.id];
        const [color, tint] = known ? [known.color, known.tint] : PALETTE[i % PALETTE.length];
        return { id: c.id || 'cat-' + i, label: c.label, color, tint, icon: known?.icon || 'dots', subs: (c.subs || []).map((s, j) => ({ id: `${c.id}:gen-${j}`, label: s })) };
      });
      setConfirm({ opts: { title: 'Replace categories?', confirmLabel: 'Use these', message: <>Penny suggested <b>{tree.length}</b> categories with subcategories. This replaces your current tree (transactions keep their tags).</> }, onYes: () => { app.setCategoryTree(tree); app.toast('Categories updated by AI'); } });
    } catch {
      setGen('idle');
      app.toast('AI generate failed');
    }
  };

  return (
    <>
      <div style={{ margin: '14px 16px 0', display: 'flex', gap: 8 }}>
        <input className="xp-input" style={{ flex: 1, width: 'auto' }} placeholder="New category…" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newCat.trim()) { app.addCategory(newCat); setNewCat(''); } }} />
        <button className="xp-save" style={{ borderRadius: 12, padding: '0 16px' }} onClick={() => { if (newCat.trim()) { app.addCategory(newCat); setNewCat(''); } }}>Add</button>
      </div>
      <div style={{ margin: '8px 16px 0' }}>
        <button className="chip-btn" style={{ width: '100%', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }} onClick={runGenerate} disabled={gen === 'working'}>{gen === 'working' ? 'Generating…' : <><Icons.spark size={15} /> Generate with AI</>}</button>
      </div>
      <div style={{ margin: '14px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {app.categories.map((cat) => {
          const isOpen = expanded === cat.id;
          const style = catStyle(cat.id);
          return (
            <div key={cat.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: style.color, flexShrink: 0 }} />
                {editing?.kind === 'cat' && editing.id === cat.id ? (
                  <input autoFocus className="xp-input" style={{ flex: 1, width: 'auto' }} value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); }} />
                ) : (
                  <button onClick={() => setExpanded(isOpen ? null : cat.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{cat.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{cat.subs.length}</span>
                  </button>
                )}
                <button onClick={() => startEdit('cat', cat.id, cat.label)} style={iconBtn} aria-label="Edit"><Icons.pencil size={15} color="var(--muted)" /></button>
                <button onClick={() => askDeleteCat(cat)} style={iconBtn} aria-label="Delete"><Icons.trash size={15} color="var(--coral-deep)" /></button>
                <button onClick={() => setExpanded(isOpen ? null : cat.id)} style={iconBtn} aria-label="Expand"><Icons.chevD size={15} color="var(--muted)" /></button>
              </div>
              {isOpen && (
                <div style={{ padding: '0 14px 12px 36px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {cat.subs.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid var(--line)' }}>
                      {editing?.kind === 'sub' && editing.id === s.id ? (
                        <input autoFocus className="xp-input" style={{ flex: 1, width: 'auto' }} value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); }} />
                      ) : (
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-soft)' }}>{s.label}</span>
                      )}
                      <button onClick={() => startEdit('sub', s.id, s.label, cat.id)} style={iconBtn} aria-label="Edit"><Icons.pencil size={13} color="var(--muted)" /></button>
                      <button onClick={() => askDeleteSub(cat.id, s.id, s.label)} style={iconBtn} aria-label="Delete"><Icons.trash size={13} color="var(--coral-deep)" /></button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <input className="xp-input" style={{ flex: 1, width: 'auto', fontSize: 12.5 }} placeholder="Add subcategory…" value={expanded === cat.id ? newSub : ''} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && newSub.trim()) { app.addSubcategory(cat.id, newSub); setNewSub(''); } }} />
                    <button className="chip-btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => { if (newSub.trim()) { app.addSubcategory(cat.id, newSub); setNewSub(''); } }}>Add</button>
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                    {PALETTE.map(([color, tint]) => (
                      <button key={color} onClick={() => app.updateCategory(cat.id, { color, tint })} aria-label="color" style={{ width: 22, height: 22, borderRadius: 11, background: color, border: cat.color === color ? '2px solid var(--ink)' : '2px solid transparent', cursor: 'pointer' }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                    {ICON_KEYS.map((ik) => {
                      const Ico = (Icons as Record<string, typeof Icons.dots>)[ik] || Icons.dots;
                      return (
                        <button key={ik} onClick={() => app.updateCategory(cat.id, { icon: ik })} aria-label={ik} style={{ width: 28, height: 28, borderRadius: 8, background: cat.icon === ik ? style.tint : 'var(--surface-2)', border: cat.icon === ik ? `1.5px solid ${style.color}` : '1.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                          <Ico size={15} color={cat.icon === ik ? style.color : 'var(--muted)'} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <ConfirmDialog open={!!confirm} opts={confirm?.opts || null} onCancel={() => setConfirm(null)} onConfirm={() => { confirm?.onYes(); setConfirm(null); }} />
    </>
  );
}
