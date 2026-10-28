import { useCallback, useEffect, useState } from 'react';
import Editor from './Editor';
import Home from './Home';
import Viewer from './Viewer';
import { createMap, loadMap } from './library';
import { getGroupMap, refreshSession, removeGroupMap, useMember } from './group';
import { decodeDoc } from './share';
import type { Doc } from './model';

/** Routes: `#/` start page, `#/map/<id>` editor, `#/view/<code>` shared view. */
function currentRoute(): string | null {
  const m = window.location.hash.match(/^#\/map\/([\w-]+)/);
  return m ? m[1] : null;
}
const viewCode = () => window.location.hash.match(/^#\/view\/([\w-]+)/)?.[1] ?? null;
const groupRoute = () => window.location.hash.match(/^#\/group\/([\w-]+)/)?.[1] ?? null;

function GroupViewer({ id, onHome, onCopy }: { id: string; onHome: () => void; onCopy: (d: Doc) => void }) {
  const member = useMember();
  const [owner, setOwner] = useState<{ id: string; name: string } | null>(null);
  const load = useCallback(() => getGroupMap(id).then((m) => (setOwner(m.owner), m.doc)), [id]);
  const mine = !!member && owner?.id === member.id;
  return (
    <Viewer
      key={`${id}:${member?.id ?? ''}`}
      load={load}
      onHome={onHome}
      onCopy={onCopy}
      byline={owner ? `Shared by ${mine ? 'you' : owner.name}` : undefined}
      errorText={member ? 'This map is no longer in the group library.' : 'Sign in on the start page to see the group library.'}
      actions={
        mine ? (
          <button
            className="danger"
            onClick={() => {
              if (window.confirm('Remove this map from the group library? Your own draft is not affected.')) void removeGroupMap(id).then(onHome);
            }}
          >
            Remove from group
          </button>
        ) : undefined
      }
    />
  );
}

export default function App() {
  const [mapId, setMapId] = useState<string | null>(currentRoute);
  const [code, setCode] = useState<string | null>(viewCode);
  const [groupId, setGroupId] = useState<string | null>(groupRoute);
  useEffect(() => {
    void refreshSession();
  }, []);
  const loadCode = useCallback(() => decodeDoc(code ?? ''), [code]);
  useEffect(() => {
    const on = () => {
      setMapId(currentRoute());
      setCode(viewCode());
      setGroupId(groupRoute());
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (id: string | null) => {
    window.location.hash = id ? `#/map/${id}` : '#/';
  };
  const create = (d: Doc) => go(createMap(d));

  if (code) return <Viewer load={loadCode} onHome={() => go(null)} onCopy={create} />;
  if (groupId) return <GroupViewer id={groupId} onHome={() => go(null)} onCopy={create} />;
  const doc = mapId ? loadMap(mapId) : null;
  if (!mapId || !doc) return <Home onOpen={go} onCreate={create} />;
  return <Editor key={mapId} mapId={mapId} initial={doc} onHome={() => go(null)} onCreate={create} />;
}
