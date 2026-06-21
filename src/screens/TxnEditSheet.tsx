// Penny — global transaction editor. Tapping any transaction (Activity, Ledger,
// account view) opens this sheet to edit or delete it, schema-driven.
import { TABLE_SPECS } from '../lib/schema';
import { EditSheet, type FormValues } from '../components/EditSheet';
import { useApp } from '../state/AppContext';

export function TxnEditSheet() {
  const app = useApp();
  const spec = TABLE_SPECS.transactions;
  const txn = app.editTxnId ? app.txns.find((t) => t.id === app.editTxnId) : null;
  const open = !!txn;

  return (
    <EditSheet
      open={open}
      title="Edit transaction"
      fields={spec.fields(app)}
      initial={txn ? spec.toForm(txn) : {}}
      saveLabel="Save"
      onSave={(v: FormValues) => {
        if (txn) spec.update(app, txn, v);
        app.toast('Transaction updated');
        app.closeTxnEditor();
      }}
      onClose={app.closeTxnEditor}
      onDelete={txn ? () => { spec.remove(app, txn); app.toast('Transaction deleted'); app.closeTxnEditor(); } : undefined}
    />
  );
}
