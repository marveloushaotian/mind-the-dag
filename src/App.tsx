import { useEffect, useState } from 'react';
import Editor from './Editor';
import Home from './Home';
import Viewer from './Viewer';
import { createMap, loadMap } from './library';
import type { Doc } from './model';

/** Routes: `#/` start page, `#/map/<id>` editor, `#/view/<code>` shared view. */
function currentRoute(): string | null {
  const m = window.location.hash.match(/^#\/map\/([\w-]+)/);
  return m ? m[1] : null;
}
const viewCode = () => window.location.hash.match(/^#\/view\/([\w-]+)/)?.[1] ?? null;

export default function App() {
  const [mapId, setMapId] = useState<string | null>(currentRoute);
  const [code, setCode] = useState<string | null>(viewCode);
  useEffect(() => {
    const on = () => {
      setMapId(currentRoute());
      setCode(viewCode());
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (id: string | null) => {
    window.location.hash = id ? `#/map/${id}` : '#/';
  };
  const create = (d: Doc) => go(createMap(d));

  if (code) return <Viewer code={code} onHome={() => go(null)} onCopy={create} />;
  const doc = mapId ? loadMap(mapId) : null;
  if (!mapId || !doc) return <Home onOpen={go} onCreate={create} />;
  return <Editor key={mapId} mapId={mapId} initial={doc} onHome={() => go(null)} onCreate={create} />;
}
