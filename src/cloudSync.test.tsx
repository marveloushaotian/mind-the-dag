// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emptyDoc } from './model';
import type { CloudMap } from './cloud';
import { useCloudSync } from './cloudSync';
const save = vi.hoisted(() => vi.fn());
vi.mock('./cloud', () => ({ saveCloudMap: save, explain: (e: Error) => e.message }));
let root: Root; let host: HTMLDivElement;
let sync: ReturnType<typeof useCloudSync>;
let map: CloudMap;
function Harness() { sync = useCloudSync(map); return <span>{sync.state}/{String(sync.durable)}</span>; }
async function mount() { await act(async () => root.render(<Harness />)); }
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear(); save.mockReset();
  map = { id: crypto.randomUUID(), title: 'Map', doc: emptyDoc(), revision: 0, deletedAt: '', updated: '2026-11-06 12:00:00Z', ownerId: 'a', ownerName: 'A', groupId: null, groupName: null, editedByName: null };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); await advance(10);
  host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});
it('does not write an unchanged map merely by opening it', async () => {
  await mount(); await advance(2000); expect(save).not.toHaveBeenCalled();
});
it('retains failed cloud edits and retries using the same revision', async () => {
  save.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue({ ok: true, revision: 1, updated: 'new' });
  await mount();
  const doc = { ...map.doc, title: 'Offline work' };
  await act(async () => sync.queue(doc)); await advance(1300);
  expect(sync.state).toBe('error'); expect(sync.durable).toBe(true);
  expect(Object.values(localStorage).join()).toContain('Offline work');
  await act(async () => { await sync.flush(); });
  expect(save.mock.calls.map(c => c[2])).toEqual([0, 0]);
  expect(sync.state).toBe('saved');
  expect(Object.keys(localStorage).filter(k => k.startsWith('mind-the-dag:cloud-pending:'))).toHaveLength(0);
});
it('does not claim browser protection when both storage and the network fail', async () => {
  save.mockRejectedValue(new Error('No connection'));
  const storage = localStorage;
  vi.stubGlobal('localStorage', { getItem: storage.getItem.bind(storage), removeItem: storage.removeItem.bind(storage), setItem: () => { throw new Error('Quota'); } });
  await mount(); await act(async () => sync.queue({ ...map.doc, title: 'Memory only' })); await advance(1300);
  expect(sync.durable).toBe(false); expect(sync.state).toBe('error');
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
it('recovers offline edits after the server version advanced, then shows a conflict', async () => {
  const doc = { ...map.doc, title: 'Recovered offline work' };
  localStorage.setItem(`mind-the-dag:cloud-pending:${map.id}:old-tab`, JSON.stringify({ doc, base: 2 }));
  map.revision = 3;
  save.mockResolvedValue({ ok: false, theirs: map });
  await mount(); await advance(350);
  expect(save).toHaveBeenCalledWith(map.id, doc, 2);
  expect(sync.state).toBe('conflict');
  await act(async () => sync.queue({ ...doc, title: 'Still editing' })); await advance(6000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(Object.values(localStorage).join()).toContain('Still editing');
  await act(async () => { sync.takeTheirs(); });
  expect(sync.state).toBe('saved');
});
it('sends edits made during a request with the newly confirmed revision', async () => {
  let finish!: (r: unknown) => void;
  save.mockImplementationOnce(() => new Promise(r => { finish = r; })).mockResolvedValue({ ok: true, revision: 2, updated: 'later' });
  await mount(); await act(async () => sync.queue({ ...map.doc, title: 'First' })); await advance(1250);
  await act(async () => sync.queue({ ...map.doc, title: 'Second' }));
  await act(async () => finish({ ok: true, revision: 1, updated: 'first' })); await advance(450);
  expect(save.mock.calls[1][1].title).toBe('Second'); expect(save.mock.calls[1][2]).toBe(1);
  expect(sync.state).toBe('saved');
});
it('keeps each open editor draft separate when a different editor finishes saving', async () => {
  let left!: ReturnType<typeof useCloudSync>;
  let right!: ReturnType<typeof useCloudSync>;
  function Left() { left = useCloudSync(map); return null; }
  function Right() { right = useCloudSync(map); return null; }
  await act(async () => root.render(<><Left /><Right /></>));
  await act(async () => {
    left.queue({ ...map.doc, title: 'Left draft' });
    right.queue({ ...map.doc, title: 'Right draft' });
  });
  expect(Object.keys(localStorage).filter(k => k.includes(map.id))).toHaveLength(2);
  save.mockResolvedValueOnce({ ok: true, revision: 1, updated: 'new' }).mockResolvedValue({ ok: false, theirs: { ...map, revision: 1 } });
  await act(async () => { await left.flush(); });
  expect(Object.values(localStorage).join()).toContain('Right draft');
  expect(Object.values(localStorage).join()).not.toContain('Left draft');
  await act(async () => { await right.flush(); });
  expect(right.state).toBe('conflict');
});
