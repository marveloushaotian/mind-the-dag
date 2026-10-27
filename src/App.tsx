import { useEffect, useState } from 'react';
import Editor from './Editor';
import Home from './Home';
import { createMap, loadMap } from './library';
import type { Doc } from './model';

/** Routes: `#/` start page, `#/map/<id>` editor. */
function currentRoute(): string | null {
  const m = window.location.hash.match(/^#\/map\/([\w-]+)/);
  return m ? m[1] : null;
}

export default function App() {
  const [mapId, setMapId] = useState<string | null>(currentRoute);
  useEffect(() => {
    const on = () => setMapId(currentRoute());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (id: string | null) => {
    window.location.hash = id ? `#/map/${id}` : '#/';
  };
  const create = (d: Doc) => go(createMap(d));

  const doc = mapId ? loadMap(mapId) : null;
  if (!mapId || !doc) return <Home onOpen={go} onCreate={create} />;
  return <Editor key={mapId} mapId={mapId} initial={doc} onHome={() => go(null)} onCreate={create} />;
}
