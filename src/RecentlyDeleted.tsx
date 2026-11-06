import { useEffect, useState } from 'react';
import { explain, listGroupMaps, listMyMaps, restoreCloudMap } from './cloud';
import { listDeletedMaps, restoreMap } from './library';
import { Modal } from './dialogs';

/** Recovery remains in the original workspace and never changes ownership. */
export function RecentlyDeleted({ cloud = false, groupId = null, userId, groupOwner = false, label = 'Recently deleted', onChange }: {
  label?: string; cloud?: boolean; groupId?: string | null; userId?: string; groupOwner?: boolean; onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; title: string; revision?: number; ownerId?: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = async () => {
    setError(null);
    try { setItems(cloud ? groupId ? await listGroupMaps(groupId, true) : await listMyMaps(true) : listDeletedMaps()); }
    catch (e) { setError(explain(e)); }
  };
  useEffect(() => { if (open) { setItems(null); setNotice(null); void refresh(); } }, [open, groupId, cloud]);
  return <>
    <button className="small recovery-entry" onClick={() => setOpen(true)}>{label}</button>
    {open && <Modal title="Recently deleted" onClose={() => setOpen(false)}>
      <p className="note">Restore a map to this workspace with its original content and access. Maps stay here until restored; no automatic deletion is scheduled.</p>
      {error && <p className="note warn" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!items && !error && <p role="status">Loading deleted maps…</p>}
      {items?.length === 0 && <p>No deleted maps in this workspace.</p>}
      <div className="stack recovery-list">{items?.map(m => <div className="callout" key={m.id}>
        <span>{m.title}</span><span className="spacer" />
        {(!cloud || !groupId || groupOwner || m.ownerId === userId) ? <button disabled={!!busy} onClick={async () => {
          setBusy(m.id); setError(null);
          try {
            if (cloud) await restoreCloudMap(m.id, m.revision!); else restoreMap(m.id);
            setNotice(`Restored “${m.title}”.`); onChange(); await refresh();
          } catch (e) { setError(explain(e)); } finally { setBusy(null); }
        }}>{busy === m.id ? 'Restoring…' : 'Restore'}</button> : <span className="note">Ask the map author or group owner to restore it.</span>}
      </div>)}</div>
      <button className="small" disabled={!!busy} onClick={() => void refresh()}>Refresh list</button>
    </Modal>}
  </>;
}
