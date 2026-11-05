import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthButton } from './dialogs';
import { ClientResponseError } from 'pocketbase';

vi.mock('./motion', () => ({ transition: (fn: () => void) => fn(), reducedMotion: () => true }));

describe('social sign-in buttons', () => {
  it.each(['github', 'google'] as const)('bundles the %s mark beside its accessible text label', (provider) => {
    const html = renderToStaticMarkup(<OAuthButton provider={provider} onClick={() => undefined} />);
    expect(html).toContain(provider === 'github' ? 'Continue with GitHub' : 'Continue with Google');
    expect(html).toContain(`btn-${provider}`);
    expect(html).toMatch(/<img[^>]+alt=""[^>]+aria-hidden="true"/);
    expect(html).toMatch(provider === 'github'
      ? /src="(?:data:image\/svg\+xml,|[^"]+\.svg)/
      : /src="(?:data:image\/png|[^"]+\.png)/);
    expect(html).toContain('type="button"');
  });

  it('prevents duplicate requests while waiting and retains the provider mark', () => {
    const html = renderToStaticMarkup(<OAuthButton provider="google" busy onClick={() => undefined} />);
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Waiting for Google…');
    expect(html).toContain('google-mark.png');
  });
});

describe('configured social providers and invitations', () => {
  let cloud: typeof import('./cloud');
  const token = `test.${btoa(JSON.stringify({ exp: 4102444800 }))}.test`;
  const record = { id: 'oauth1234567890', collectionName: 'users', collectionId: '_pb_users_auth_', name: 'Member', email: 'member@example.test' };
  const result = { token, record, meta: { isNew: false } };
  let popup: { closed: boolean; location: { href: string }; close: ReturnType<typeof vi.fn> };
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_LIBRARY_URL', 'https://oauth.example.test');
    cloud = await import('./cloud');
    popup = { closed: false, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal('window', { open: vi.fn(() => popup) });
  });
  afterEach(() => {
    cloud.pb!.authStore.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('shows only enabled providers in a stable order, without duplicating buttons', async () => {
    vi.spyOn(cloud.pb!.collection('users'), 'listAuthMethods').mockResolvedValue({
      oauth2: { enabled: true, providers: [{ name: 'google' }, { name: 'microsoft' }, { name: 'github' }, { name: 'google' }] },
    } as never);
    expect(await cloud.signInProviders()).toEqual(['github', 'google']);
  });

  it('does not advertise Google before the server has configured it', async () => {
    vi.spyOn(cloud.pb!.collection('users'), 'listAuthMethods').mockResolvedValue({
      oauth2: { enabled: true, providers: [{ name: 'github' }] },
    } as never);
    expect(await cloud.signInProviders()).toEqual(['github']);
  });

  it('honours the server-wide OAuth switch', async () => {
    vi.spyOn(cloud.pb!.collection('users'), 'listAuthMethods').mockResolvedValue({
      oauth2: { enabled: false, providers: [{ name: 'google' }] },
    } as never);
    expect(await cloud.signInProviders()).toEqual([]);
  });

  it('passes Google sign-in to the existing PocketBase OAuth flow', async () => {
    const auth = vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2').mockResolvedValue(result as never);
    await cloud.signInWith('google');
    expect(auth).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ provider: 'google', requestKey: 'social-sign-in', urlCallback: expect.any(Function) }));
    expect(cloud.currentMember()?.id).toBe(record.id);
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('includes the invitation code when Google creates a new account', async () => {
    const auth = vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2').mockResolvedValue({ ...result, meta: { isNew: true } } as never);
    const send = vi.spyOn(cloud.pb!, 'send');
    await cloud.signUpWith('google', 'invitation-code');
    expect(auth).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ provider: 'google', createData: { inviteCode: 'invitation-code' } }));
    expect(send).not.toHaveBeenCalled();
  });

  it('applies the invitation to an existing Google member after sign-in', async () => {
    vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2').mockResolvedValue(result as never);
    const send = vi.spyOn(cloud.pb!, 'send').mockResolvedValue({ group: 'group-id' });
    await cloud.signUpWith('google', 'invitation-code');
    expect(send).toHaveBeenCalledExactlyOnceWith('/api/mtd/signups/invitation-code/accept', { method: 'POST' });
  });

  it('explains a cancelled Google sign-in without creating an account', async () => {
    vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2').mockRejectedValue(new ClientResponseError({ isAbort: true, status: 0 }));
    await expect(cloud.signInWith('google')).rejects.toThrow('Sign-in was cancelled.');
  });

  it('reports discovery failure so the screen can offer a retry', async () => {
    const discovery = vi.spyOn(cloud.pb!.collection('users'), 'listAuthMethods')
      .mockRejectedValueOnce(new ClientResponseError({ status: 0 }))
      .mockResolvedValueOnce({ oauth2: { enabled: true, providers: [{ name: 'google' }] } } as never);
    await expect(cloud.signInProviders()).rejects.toThrow("Can't reach the server");
    expect(await cloud.signInProviders()).toEqual(['google']);
    expect(discovery).toHaveBeenCalledTimes(2);
  });

  it('explains blocked popups before starting authentication', async () => {
    vi.mocked(window.open).mockReturnValue(null);
    const auth = vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2');
    await expect(cloud.signInWith('google')).rejects.toThrow('Allow pop-ups');
    expect(auth).not.toHaveBeenCalled();
  });

  it('treats Google consent denial as cancellation, including on an invitation', async () => {
    vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2')
      .mockRejectedValue(new ClientResponseError(new Error('OAuth2 redirect error or missing code: access_denied')));
    await expect(cloud.signInWith('google')).rejects.toThrow('Sign-in was cancelled');
    await expect(cloud.signUpWith('google', 'code')).rejects.toThrow('Sign-in was cancelled');
    expect(cloud.currentMember()).toBeNull();
  });

  it('does not report every OAuth server failure as an invalid invitation', async () => {
    vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2')
      .mockRejectedValue(new ClientResponseError({ status: 400, response: { message: 'Failed to fetch OAuth2 token.' } }));
    await expect(cloud.signInWith('google')).rejects.toThrow('Google sign-in could not be completed');
    await expect(cloud.signUpWith('google', 'code')).rejects.toThrow('Google sign-up could not be completed');
  });

  it('keeps invitation acceptance errors visible after existing-member authentication', async () => {
    vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2').mockResolvedValue(result as never);
    vi.spyOn(cloud.pb!, 'send').mockRejectedValue(new Error('Invitation has expired.'));
    await expect(cloud.signUpWith('google', 'code')).rejects.toThrow('Invitation has expired');
  });

  it('never implicitly connects a provider to an already signed-in member', async () => {
    cloud.pb!.authStore.save(token, record);
    const auth = vi.spyOn(Object.getPrototypeOf(cloud.pb!.collection('users')), 'authWithOAuth2');
    await expect(cloud.signInWith('google')).rejects.toThrow('You are already signed in');
    expect(auth).not.toHaveBeenCalled();
    expect(cloud.currentMember()?.id).toBe(record.id);
  });

  it('cancels a pending popup and permits a fresh attempt', async () => {
    let rejectPending!: (error: unknown) => void;
    const service = Object.getPrototypeOf(cloud.pb!.collection('users'));
    vi.spyOn(service, 'authWithOAuth2').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPending = reject; }))
      .mockResolvedValueOnce(result as never);
    const cancel = vi.spyOn(Object.getPrototypeOf(cloud.pb!), 'cancelRequest').mockImplementation(function () {
      rejectPending(new ClientResponseError({ isAbort: true }));
      return this;
    });
    const pending = cloud.signInWith('google');
    const rejected = expect(pending).rejects.toThrow('Sign-in was cancelled');
    cloud.cancelSocialSignIn();
    await rejected;
    expect(cancel).toHaveBeenCalledWith('social-sign-in');
    expect(cloud.currentMember()).toBeNull();
    await cloud.signInWith('google');
    expect(cloud.currentMember()?.id).toBe(record.id);
  });

});
