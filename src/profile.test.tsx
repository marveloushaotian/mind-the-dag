import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileDialog } from './AccountProfile';
import type { Member } from './cloud';

vi.mock('./motion', () => ({ transition: (fn: () => void) => fn(), reducedMotion: () => true }));

const account: Member = { id: 'profile12345678', name: 'Alice', email: 'alice@example.test', needsName: false, admin: false };
const noop = () => undefined;
const record = (id = account.id, name = 'Alice') => ({ id, collectionId: '_pb_users_auth_', collectionName: 'users', name, email: account.email, admin: false });
const token = `test.${btoa(JSON.stringify({ exp: 4102444800 }))}.test`;

describe('account profile presentation', () => {
  it('offers one editable name and a read-only email, with no extra registration fields', () => {
    const html = renderToStaticMarkup(<ProfileDialog member={account} onClose={noop} onSaved={noop} />);
    expect(html).toContain('aria-label="Account profile"');
    expect(html).toMatch(/autocomplete="name" required=""/i);
    expect(html).toMatch(/type="email" readOnly="" value="alice@example.test"/);
    expect((html.match(/<input /g) ?? [])).toHaveLength(2);
    expect(html).toContain('>Cancel</button>');
  });

  it('prompts for a missing name without pre-filling the fallback email', () => {
    const html = renderToStaticMarkup(<ProfileDialog member={{ ...account, name: account.email, needsName: true }} onClose={noop} onSaved={noop} />);
    expect(html).toContain('Add your display name');
    expect(html).toContain('>Not now</button>');
    expect(html).toMatch(/autocomplete="name"[^>]*value=""/i);
    expect(html).toMatch(/type="submit"[^>]*disabled=""/);
  });
});

describe('profile persistence', () => {
  let cloud: typeof import('./cloud');
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_LIBRARY_URL', 'http://profile.example.test');
    cloud = await import('./cloud');
    cloud.pb!.authStore.save(token, record());
  });
  afterEach(() => {
    cloud.pb!.authStore.clear();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['', ' \t ', undefined])('recognises a missing name (%j) independently of its fallback', (name) => {
    cloud.pb!.authStore.save(token, { ...record(), name });
    expect(cloud.currentMember()).toMatchObject({ name: account.email, needsName: true });
  });

  it('trims names and saves only the current user name, updating the session immediately', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(record(account.id, '郑昊天 · Haotian')), { status: 200 }));
    await cloud.updateProfile('  郑昊天 · Haotian  ');
    expect(String(fetch.mock.calls[0][0])).toMatch(new RegExp(`/users/records/${account.id}$`));
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ name: '郑昊天 · Haotian' });
    expect(cloud.currentMember()).toMatchObject({ name: '郑昊天 · Haotian', needsName: false, email: account.email });
  });

  it.each(['   ', 'a'.repeat(121)])('rejects an invalid name before sending a request (%j)', async (name) => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(cloud.updateProfile(name)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(cloud.currentMember()?.name).toBe('Alice');
  });

  it('preserves the saved profile and exposes a failed request for retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Temporarily unavailable.' }), { status: 503 }));
    await expect(cloud.updateProfile('New name')).rejects.toThrow('Temporarily unavailable.');
    expect(cloud.currentMember()?.name).toBe('Alice');
  });

  it.each(['sign out', 'switch account'])('does not restore an old session after %s while saving', async (action) => {
    let respond!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => { respond = resolve; }));
    const saving = cloud.updateProfile('New name');
    await vi.waitFor(() => expect(respond).toBeTypeOf('function'));
    if (action === 'sign out') cloud.pb!.authStore.clear();
    else cloud.pb!.authStore.save(token, record('other1234567890', 'Bob'));
    respond(new Response(JSON.stringify(record(account.id, 'New name')), { status: 200 }));
    await saving;
    expect(cloud.currentMember()?.name ?? null).toBe(action === 'sign out' ? null : 'Bob');
  });
});
