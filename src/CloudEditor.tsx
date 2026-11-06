import { useEffect, useRef, useState } from 'react';
import Editor from './Editor';
import { createCloudMap, explain, freeTitle, getCloudMap, primedCloudMap, updatedMs, type CloudMap } from './cloud';
import { pendingEdits, useCloudSync } from './cloudSync';
import { download, slug } from './exporters';
import type { Doc } from './model';
import { Wordmark } from './ui';

const timeOf = (s: string) => new Date(updatedMs(s)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Opens a map from the cloud workspace (My maps or a group) and keeps it saved there. */
export default function CloudEditor({ id, onHome, onCreate, onOpen }: { id: string; onHome: () => void; onCreate: (d: Doc) => void; onOpen: (id: string) => void }) {
  // A map opened from the start page shows at once; the server copy replaces it if it is newer.
  const [map, setMap] = useState<CloudMap | null>(() => primedCloudMap(id));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    getCloudMap(id).then(
      (fresh) =>
        setMap((cur) => {
          if (!cur) return fresh;
          if ((cur.revision === fresh.revision && cur.updated === fresh.updated) || pendingEdits(id, cur.updated)) return cur;
          return fresh;
        }),
      (e) => setError(explain(e)),
    );
  }, [id]);
  if (error)
    return (
      <div className="loading-page">
        <Wordmark />
        <p>{error}</p>
        <button onClick={onHome}>Back to all maps</button>
      </div>
    );
  if (!map) return <EditorSkeleton />;
  if (map.deletedAt && !pendingEdits(id)) return <div className="loading-page"><Wordmark /><p>This map is in Recently deleted. Restore it from its workspace to edit it.</p><button onClick={onHome}>Back to all maps</button></div>;
  return <Synced key={`${map.id}:${map.revision}:${map.updated}`} map={map} onHome={onHome} onCreate={onCreate} onOpen={onOpen} />;
}

function Synced({ map, onHome, onCreate, onOpen }: { map: CloudMap; onHome: () => void; onCreate: (d: Doc) => void; onOpen: (id: string) => void }) {
  const sync = useCloudSync(map);
  const [current, setCurrent] = useState(() => ({ doc: pendingEdits(map.id, map.updated) ?? map.doc, v: 0 }));
  const latest = useRef<Doc>(current.doc);
  // Saves from an editor being replaced (their version loaded, or left for a copy) are ignored.
  const live = useRef(current.v);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const groupHintKey = `mind-the-dag:group-hint:${map.groupId}`;
  const [hint, setHint] = useState(() => {
    try {
      return !!map.groupId && !sessionStorage.getItem(groupHintKey);
    } catch {
      return !!map.groupId;
    }
  });

  const label = {
    saved: 'Saved',
    saving: 'Saving…',
    offline: sync.durable ? 'Offline · kept in this browser' : 'Not saved',
    error: sync.durable ? 'Cloud save failed · kept in this browser' : 'Not saved',
    conflict: 'Not saved',
  }[sync.state];

  const saveCopy = () => download(`${slug(latest.current.title)}.json`, new Blob([JSON.stringify(latest.current, null, 2)], { type: 'application/json' }));
  const banner =
    (sync.state === 'offline' || sync.state === 'error' || (!sync.durable && sync.state !== 'saved' && sync.state !== 'conflict')) ? (
      <div className="banner warn" role="alert"><span>{sync.error ?? 'Browser storage is unavailable.'} {sync.durable ? 'Your changes are kept in this browser until they reach the cloud.' : 'Keep this tab open or download your changes.'}</span>
      <button onClick={() => void sync.flush()}>Retry saving</button><button onClick={saveCopy}>Download map file</button></div>
    ) :
    sync.state === 'conflict' && sync.theirs ? (
      <div className="banner warn" role="alert">
        <span>
          {sync.theirs.deletedAt ? 'This map was moved to Recently deleted.' : `${sync.theirs.editedByName ?? 'Someone'} saved a newer version at ${timeOf(sync.theirs.updated)}.`} Your changes are not saved to the cloud. {!sync.durable && 'Browser storage is also unavailable; download your changes before leaving.'}
        </span>
        <span className="spacer" />
        {!sync.theirs.deletedAt && <button
          onClick={() => {
            const theirs = sync.takeTheirs();
            if (theirs) {
              latest.current = theirs;
              live.current = current.v + 1;
              setCurrent({ doc: theirs, v: current.v + 1 });
            }
          }}
        >
          Use their version
        </button>}
        <button onClick={saveCopy}>Download map file</button>
        <button
          className="primary"
          disabled={copying}
          onClick={async () => {
            setCopying(true);
            setCopyError(null);
            try {
              const mine = { ...latest.current, title: `${latest.current.title || 'Untitled'} (my version)` };
              const copy = await createCloudMap(mine, map.groupId);
              live.current = -1;
              sync.dropMine();
              onOpen(copy.id);
            } catch (e) {
              setCopyError(explain(e));
              setCopying(false);
            }
          }}
        >
          {copying ? 'Saving…' : 'Save mine as a copy'}
        </button>
        {copyError && <span className="banner-error">{copyError}</span>}
      </div>
    ) : hint ? (
      <div className="banner info">
        <span>
          This map is shared with <strong>{map.groupName ?? 'your group'}</strong>: everyone there can edit it. If two people edit at the same time, the later save is held
          back and you choose which version to keep.
        </span>
        <span className="spacer" />
        <button
          className="small"
          onClick={() => {
            setHint(false);
            try {
              sessionStorage.setItem(groupHintKey, '1');
            } catch {
              /* ignore */
            }
          }}
        >
          Got it
        </button>
      </div>
    ) : null;

  return (
    <Editor
      key={current.v}
      initial={current.doc}
      onSave={(d) => {
        if (live.current !== current.v) return;
        latest.current = d;
        sync.queue(d);
      }}
      place={{ kind: 'cloud', mapId: map.id, groupId: map.groupId, groupName: map.groupName }}
      checkTitle={(t) => freeTitle(map.id, map.groupId, t)}
      saveState={
        <span key={sync.state} className={`save-state${sync.state === 'conflict' || sync.state === 'offline' || sync.state === 'error' ? ' warn' : ''}`} title={map.groupId ? 'Saved to the group' : 'Saved to My maps'}>
          {label}
        </span>
      }
      banner={banner}
      onHome={() => {
        if (!sync.durable && sync.state !== 'saved' && !window.confirm('Your changes are not saved. Leave this map?')) return;
        void sync.flush();
        onHome();
      }}
      onCreate={onCreate}
    />
  );
}

/** Shown while a map loads: the editor's frame, so nothing jumps when it arrives. */
function EditorSkeleton() {
  return (
    <div className="app skeleton-app" aria-busy="true" aria-label="Opening map">
      <header className="topbar">
        <Wordmark />
        <span className="sk-line" style={{ width: 160 }} />
      </header>
      <div className="body">
        <aside className="panel left" />
        <main className="stage" />
        <aside className="panel right" />
      </div>
    </div>
  );
}
