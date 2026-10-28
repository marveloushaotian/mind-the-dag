import { useCallback, useEffect, useState } from 'react';
import CloudEditor from './CloudEditor';
import Editor from './Editor';
import Home from './Home';
import Viewer from './Viewer';
import Join from './Join';
import { createCloudMap, explain, refreshSession, useMember } from './cloud';
import { moveDraftsToCloud } from './drafts';
import { createMap, goneKey, goneTo, loadMap, saveMap } from './library';
import type { Doc } from './model';
import { decodeDoc } from './share';
import { setOpenMap, transition } from './motion';

/**
 * Routes: `#/` start page, `#/map/<id>` a map in this browser, `#/cloud/<id>` a map in the
 * cloud workspace, `#/view/<code>` a shared view-only link.
 */
type Route = { kind: 'home' } | { kind: 'join'; code: string } | { kind: 'local'; id: string } | { kind: 'cloud'; id: string } | { kind: 'view'; code: string };
function route(): Route {
  const h = window.location.hash;
  let m = h.match(/^#\/map\/([\w-]+)/);
  if (m) return { kind: 'local', id: m[1] };
  m = h.match(/^#\/(?:cloud|group)\/([\w-]+)/);
  if (m) return { kind: 'cloud', id: m[1] };
  m = h.match(/^#\/join\/([\w-]+)/);
  if (m) return { kind: 'join', code: m[1] };
  m = h.match(/^#\/view\/([\w-]+)/);
  if (m) return { kind: 'view', code: m[1] };
  return { kind: 'home' };
}

/** Section of the start page to return to (My maps, a group, …). */
export const SECTION_KEY = 'mind-the-dag:section';

export default function App() {
  const [r, setR] = useState<Route>(route);
  const member = useMember();
  const [error, setError] = useState<string | null>(null);
  // A draft open here that another tab moved to the cloud or deleted: follow it.
  const [, bump] = useState(0);
  useEffect(() => {
    void refreshSession();
    const on = () => transition(() => setR(route()));
    const onStorage = (e: StorageEvent) => {
      const cur = route();
      if (cur.kind === 'local' && e.key === goneKey(cur.id)) bump((n) => n + 1);
    };
    window.addEventListener('hashchange', on);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const goHome = () => (window.location.hash = '#/');
  const openLocal = (id: string) => (window.location.hash = `#/map/${id}`);
  const openCloud = (id: string) => (window.location.hash = `#/cloud/${id}`);

  /** New maps go to the cloud when signed in (My maps, or the group being viewed), else to this browser. */
  const create = useCallback(
    async (d: Doc, groupId: string | null = null) => {
      setError(null);
      if (member) {
        try {
          openCloud((await createCloudMap(d, groupId)).id);
        } catch (e) {
          setError(explain(e));
        }
      } else openLocal(createMap(d));
    },
    [member],
  );
  // Remember which map is open, so going back can shrink it into its card.
  useEffect(() => {
    if (r.kind === 'local' || r.kind === 'cloud') setOpenMap(r.id);
  }, [r]);
  const loadCode = useCallback(() => decodeDoc(r.kind === 'view' ? r.code : ''), [r]);

  if (r.kind === 'join')
    return (
      <Join
        code={r.code}
        onDone={(groupId) => {
          try {
            localStorage.setItem(SECTION_KEY, groupId ? `g:${groupId}` : 'mine');
          } catch {
            /* ignore */
          }
          goHome();
        }}
      />
    );
  if (r.kind === 'view') return <Viewer load={loadCode} onHome={goHome} onCopy={(d) => void create(d)} />;
  if (r.kind === 'cloud') return <CloudEditor id={r.id} onHome={goHome} onCreate={(d) => void create(d)} onOpen={openCloud} />;
  if (r.kind === 'local') {
    const id = r.id;
    const to = goneTo(id);
    // Signed in, maps live in the cloud: a draft opened here moves to My maps first.
    if (member || to !== undefined) return <LocalGone id={id} to={to} signedIn={!!member} onHome={goHome} />;
    const doc = loadMap(id);
    if (doc)
      return (
        <Editor
          key={id}
          initial={doc}
          onSave={(d) => saveMap(id, d)}
          place={{ kind: 'local', mapId: id }}
          onHome={goHome}
          onCreate={(d) => void create(d)}
        />
      );
  }
  return <Home onOpenLocal={openLocal} onOpenCloud={openCloud} onCreate={create} createError={error} />;
}

/** A draft that is (or is about to be) in the cloud: move it if needed, then open the cloud copy. */
function LocalGone({ id, to, signedIn, onHome }: { id: string; to: string | null | undefined; signedIn: boolean; onHome: () => void }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (signedIn) await moveDraftsToCloud();
      } catch (e) {
        if (live) setError(explain(e));
        return;
      }
      if (!live) return;
      const dest = goneTo(id);
      if (dest && signedIn) window.location.replace(`#/cloud/${dest}`);
      else onHome();
    })();
    return () => {
      live = false;
    };
  }, [id, to, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="loading-page">
      {error ? (
        <>
          <p>Couldn't move this map to My maps: {error}</p>
          <button onClick={onHome}>Go to the start page</button>
        </>
      ) : (
        <p>Opening the map in My maps…</p>
      )}
    </div>
  );
}
