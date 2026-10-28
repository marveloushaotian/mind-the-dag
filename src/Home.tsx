import { useEffect, useRef, useState } from 'react';
import { metagenomeExample } from './examples';
import { IFile, IPlus } from './icons';
import { Wordmark } from './ui';
import { importFile } from './importers';
import { backupAll, deleteMap, duplicateMap, isBackup, listMaps, loadMap, requestPersistence, restoreBackup, type MapEntry } from './library';
import { download } from './exporters';
import { emptyDoc, type Doc } from './model';
import { docBounds, MetroMap } from './render';
import { SignInDialog } from './dialogs';
import { groupEnabled, groupLink, listGroupMaps, removeGroupMap, setGroupLink, signOut, useMember, type GroupMap } from './group';

function ago(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

function Thumb({ id, doc: given }: { id?: string; doc?: Doc }) {
  const doc = given ?? (id ? loadMap(id) : null);
  const b = doc && docBounds(doc);
  if (!doc || !b) return <div className="thumb empty-thumb" />;
  const pad = 24;
  return (
    <svg className="thumb" viewBox={`${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <MetroMap doc={doc} exporting />
    </svg>
  );
}

function Card({ entry, onOpen, onChange }: { entry: MapEntry; onOpen: () => void; onChange: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="card">
      <button className="card-main" onClick={onOpen}>
        <Thumb id={entry.id} />
        <span className="card-title">{entry.title || 'Untitled'}</span>
        <span className="card-meta">
          {ago(entry.updated)}
          {groupLink(entry.id) && <span className="pill">In group library</span>}
        </span>
      </button>
      <div className="card-actions">
        {confirm ? (
          <>
            <button
              className="danger"
              onClick={() => {
                deleteMap(entry.id);
                setGroupLink(entry.id, null);
                onChange();
              }}
            >
              Delete
            </button>
            <button onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <>
            <button
              onClick={() => {
                duplicateMap(entry.id);
                onChange();
              }}
            >
              Duplicate
            </button>
            <button className="danger" onClick={() => setConfirm(true)}>
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function GroupCard({ map, mine, onOpen, onCopy, onRemoved }: { map: GroupMap; mine: boolean; onOpen: () => void; onCopy: () => void; onRemoved: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(false);
  return (
    <li className="card">
      <button className="card-main" onClick={onOpen}>
        <Thumb doc={map.doc} />
        <span className="card-title">{map.title || 'Untitled'}</span>
        <span className="card-meta">
          {mine ? 'You' : map.owner.name} · {ago(map.updated)}
        </span>
      </button>
      <div className="card-actions">
        {confirm ? (
          <>
            <button
              className="danger"
              onClick={() =>
                removeGroupMap(map.id).then(onRemoved, () => {
                  setError(true);
                  setConfirm(false);
                })
              }
            >
              Remove
            </button>
            <button onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <>
            <button onClick={onCopy}>Make a copy</button>
            {mine && (
              <button className="danger" onClick={() => setConfirm(true)} title="Remove from the group library (your draft stays)">
                {error ? 'Retry remove' : 'Remove'}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function GroupLibrary({ onCreate }: { onCreate: (d: Doc) => void }) {
  const member = useMember();
  const [maps, setMaps] = useState<GroupMap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const load = () => {
    setError(null);
    listGroupMaps()
      .then(setMaps)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(() => {
    if (member) load();
    else setMaps(null);
  }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!groupEnabled) return null;
  return (
    <>
      <div className="home-h-row">
        <h2 className="home-h">Group library</h2>
        <span className="home-hint">{member ? 'Shared by your group · open to view, make a copy to edit' : 'Maps your group has shared'}</span>
        <span className="spacer" />
        {member && (
          <button className="small" onClick={load}>
            Refresh
          </button>
        )}
      </div>
      {!member ? (
        <div className="group-empty">
          <button onClick={() => setSigningIn(true)}>Sign in to see the group library</button>
          {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
        </div>
      ) : error ? (
        <p className="home-error">{error}</p>
      ) : maps === null ? (
        <p className="home-hint">Loading…</p>
      ) : maps.length === 0 ? (
        <p className="home-hint">Nothing shared yet. Open a draft and use Share › Share with group.</p>
      ) : (
        <ul className="cards">
          {maps.map((m) => (
            <GroupCard
              key={m.id}
              map={m}
              mine={m.owner.id === member.id}
              onOpen={() => (window.location.hash = `#/group/${m.id}`)}
              onCopy={() => onCreate({ ...structuredClone(m.doc), title: m.doc.title })}
              onRemoved={load}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function Account() {
  const member = useMember();
  const [signingIn, setSigningIn] = useState(false);
  if (!groupEnabled) return null;
  return member ? (
    <div className="account">
      <span className="account-name" title={member.email}>
        {member.name}
      </span>
      <button className="small" onClick={signOut}>
        Sign out
      </button>
    </div>
  ) : (
    <>
      <button className="small" onClick={() => setSigningIn(true)}>
        Sign in
      </button>
      {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
    </>
  );
}

export default function Home({ onOpen, onCreate }: { onOpen: (id: string) => void; onCreate: (d: Doc) => void }) {
  const [maps, setMaps] = useState(listMaps);
  // Re-read after mount: an editor that just closed saves its last changes during unmount.
  useEffect(() => {
    setMaps(listMaps());
    requestPersistence();
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="home">
      <header className="topbar">
        <Wordmark size={17} />
        <span className="spacer" />
        <Account />
      </header>
      <main className="home-main">
        <div className="home-actions">
          <button className="primary big" onClick={() => onCreate(emptyDoc())}>
            <IPlus /> New map
          </button>
          <button className="big" onClick={() => fileInput.current?.click()}>
            <IFile /> Open file…
          </button>
          <button className="link" onClick={() => onCreate(metagenomeExample())}>
            Example map
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.mmd,.txt,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                // A backup restores every draft in it; anything else opens as one new map.
                const text = await f.text();
                let parsed: unknown = null;
                try {
                  parsed = JSON.parse(text);
                } catch {
                  /* not JSON: .mmd or similar */
                }
                if (isBackup(parsed)) {
                  const n = restoreBackup(parsed);
                  setMaps(listMaps());
                  setError(null);
                  setNotice(`Restored ${n} draft${n === 1 ? '' : 's'} from ${f.name}`);
                  return;
                }
                onCreate(await importFile(f));
              } catch (err) {
                setError(`Couldn't open ${f.name}: ${(err as Error).message}`);
              }
            }}
          />
        </div>
        {error && <p className="home-error">{error}</p>}
        {notice && <p className="home-notice">{notice}</p>}
        {maps.length > 0 && (
          <>
            <div className="home-h-row">
              <h2 className="home-h">Drafts</h2>
              <span className="home-hint">Kept in this browser only</span>
              <span className="spacer" />
              <button
                className="small"
                onClick={() => {
                  const stamp = new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local date
                  download(`mind-the-dag-drafts-${stamp}.json`, new Blob([JSON.stringify(backupAll(), null, 1)], { type: 'application/json' }));
                }}
                title="Download every draft as one file; open it here (or on another computer) to restore"
              >
                Back up all drafts
              </button>
            </div>
            <ul className="cards">
              {maps.map((m) => (
                <Card key={m.id} entry={m} onOpen={() => onOpen(m.id)} onChange={() => setMaps(listMaps())} />
              ))}
            </ul>
          </>
        )}
        <GroupLibrary onCreate={onCreate} />
      </main>
    </div>
  );
}
