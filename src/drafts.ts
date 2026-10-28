/**
 * Signed in, nothing lives only in this browser: drafts made while signed out (or restored
 * from a backup file) move into My maps. Tabs take turns (Web Locks) so a draft moves once.
 */
import { createCloudMap, currentMember } from './cloud';
import { goneTo, listMaps, loadMap, retireMap } from './library';

let running: Promise<number> | null = null;

async function moveAll(): Promise<number> {
  let n = 0;
  for (const e of listMaps()) {
    if (!currentMember()) break;
    if (goneTo(e.id) !== undefined) continue;
    const d = loadMap(e.id);
    if (!d) continue;
    const m = await createCloudMap(d);
    retireMap(e.id, m.id);
    n += 1;
  }
  return n;
}

/** Move every draft in this browser to My maps; resolves to how many moved. Safe to call often. */
export function moveDraftsToCloud(): Promise<number> {
  if (!currentMember() || !listMaps().length) return Promise.resolve(0);
  if (running) return running;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const p = (locks ? (locks.request('mind-the-dag:drafts', moveAll) as unknown as Promise<number>) : moveAll()).finally(() => (running = null));
  running = p;
  return p;
}
