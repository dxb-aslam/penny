// Penny — reusable confirmation / blocked-action modal. Used for delete
// confirmations and "can't delete — data depends on it" warnings across CRUD.
import type { ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the action is blocked: only an acknowledge button is shown. */
  blocked?: boolean;
}

export function ConfirmDialog({
  open,
  opts,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  opts: ConfirmOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!opts) return null;
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: 'absolute', inset: 0, background: 'rgba(20,18,14,0.38)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s', zIndex: 60,
        }}
      />
      <div
        style={{
          position: 'absolute', left: '50%', top: '50%',
          transform: `translate(-50%, -50%) scale(${open ? 1 : 0.96})`,
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s, transform 0.2s', zIndex: 61,
          width: 'min(340px, 88%)', background: 'var(--surface)', borderRadius: 18,
          padding: 20, boxShadow: 'var(--shadow-card)',
        }}
      >
        <div className="h-display" style={{ fontSize: 17, marginBottom: 8 }}>{opts.title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{opts.message}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          {opts.blocked ? (
            <button className="xp-save" style={{ borderRadius: 12, flex: 1, padding: 11 }} onClick={onCancel}>
              {opts.cancelLabel || 'OK'}
            </button>
          ) : (
            <>
              <button className="chip-btn" style={{ flex: 1, padding: 11 }} onClick={onCancel}>
                {opts.cancelLabel || 'Cancel'}
              </button>
              <button
                className="xp-save"
                style={{ borderRadius: 12, flex: 1, padding: 11, ...(opts.danger ? { background: 'var(--coral-deep)' } : {}) }}
                onClick={onConfirm}
              >
                {opts.confirmLabel || 'Confirm'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
