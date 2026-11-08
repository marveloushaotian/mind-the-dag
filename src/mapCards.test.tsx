// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Card } from './Home';

vi.mock('./motion', async original => ({ ...await original<typeof import('./motion')>(), reducedMotion: () => true }));
let host: HTMLDivElement;
let root: Root;
const remove = vi.fn();
const duplicate = vi.fn();
const open = vi.fn();
const button = (name: string) => [...document.querySelectorAll('button')].find(el => el.textContent?.trim() === name)!;
const click = async (name: string) => { await act(async () => { button(name).focus(); button(name).click(); }); };
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks(); remove.mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Card id="fixture" doc={null} title="Research map" meta="just now" onOpen={open}
    actions={[{ label: 'Duplicate', icon: 'duplicate', run: duplicate }]}
    danger={{ label: 'Delete', confirm: 'Delete', warning: 'Restore it from Recently deleted.', run: remove }} />));
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
it('offers named actions without opening the map', async () => {
  expect(host.querySelector('[aria-label="Actions for Research map"]')).not.toBeNull();
  expect(button('Duplicate').textContent).toBe('Duplicate');
  expect(button('Delete').textContent).toBe('Delete');
  await click('Duplicate'); expect(duplicate).toHaveBeenCalledOnce(); expect(open).not.toHaveBeenCalled();
});
it('cancels deletion with Escape and restores focus to its visible trigger', async () => {
  const trigger = button('Delete');
  // Model pointer activation in WebKit: the trigger is not already focused.
  await act(async () => trigger.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('Recently deleted');
  expect(dialog.contains(document.activeElement)).toBe(true);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger); expect(remove).not.toHaveBeenCalled();
});
it('keeps deletion failures visible inside the confirmation and allows retry', async () => {
  remove.mockRejectedValueOnce(new Error('Connection lost'));
  await click('Delete');
  const confirm = () => document.querySelector<HTMLButtonElement>('[role="dialog"] .solid-danger')!;
  await act(async () => confirm().click());
  expect(document.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain('Connection lost');
  expect(confirm().disabled).toBe(false);
  await act(async () => confirm().click());
  expect(remove).toHaveBeenCalledTimes(2); expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('prevents repeated deletion and dismissal while a request is pending', async () => {
  let resolve!: () => void;
  remove.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  await click('Delete');
  await act(async () => document.querySelector<HTMLButtonElement>('[role="dialog"] .solid-danger')!.click());
  expect(button('Deleting…').disabled).toBe(true); expect(button('Keep map').disabled).toBe(true);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => resolve()); expect(remove).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
