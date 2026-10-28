import { useCallback, useEffect, useRef, useState } from 'react';
import CloudEditor from './CloudEditor';
import Editor from './Editor';
import Home from './Home';
import Viewer from './Viewer';
import Join from './Join';
import { createCloudMap, explain, refreshSession, useMember } from './cloud';
import { createMap, deleteMap, loadMap, saveMap } from './library';
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
  // Drafts moved to the cloud: the closing editor must not save them back into this browser.
  const moved = useRef(new Set<string>());
  useEffect(() => {
    void refreshSession();
    const on = () => transition(() => setR(route()));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
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
  const doc = r.kind === 'local' ? loadMap(r.id) : null;
  if (r.kind === 'local' && doc) {
    const id = r.id;
    return (
      <Editor
        key={id}
        initial={doc}
        onSave={(d) => !moved.current.has(id) && saveMap(id, d)}
        place={{ kind: 'local', mapId: id }}
        onHome={goHome}
        onCreate={(d) => void create(d)}
        onMoveToCloud={
          member
            ? async () => {
                const m = await createCloudMap(loadMap(id) ?? doc);
                moved.current.add(id);
                deleteMap(id);
                openCloud(m.id);
              }
            : undefined
        }
      />
    );
  }
  return <Home onOpenLocal={openLocal} onOpenCloud={openCloud} onCreate={create} createError={error} />;
}
