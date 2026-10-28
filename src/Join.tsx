import { useEffect, useState } from 'react';
import { OAuthButton, SignInCard } from './dialogs';
import { acceptSignupLink, explain, listMyGroups, signInProviders, signupInfo, signUpWith, signUpWithPassword, useMember, type Provider, type SignupInfo } from './cloud';
import { Wordmark } from './ui';

/** The page an invitation link opens: create an account (GitHub or email), or join with one you have. */
export default function Join({ code, onDone }: { code: string; onDone: (groupId: string | null) => void }) {
  const member = useMember();
  const [info, setInfo] = useState<SignupInfo | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [mode, setMode] = useState<'choose' | 'email' | 'signin'>('choose');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    signupInfo(code).then(setInfo, () => setInfo({ valid: false, reason: 'unknown', inviter: '', group: '' }));
    void signInProviders().then(setProviders);
  }, [code]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(explain(e));
      setBusy(null);
    }
  };
  /** After signing up through a link with a group: open that group. */
  const finish = async () => {
    const gs = info?.group ? await listMyGroups().catch(() => []) : [];
    onDone(gs.find((g) => g.name === info?.group)?.id ?? null);
  };
  const joinNow = () =>
    run('join', async () => {
      const g = await acceptSignupLink(code);
      onDone(g || null);
    });

  const invitedTo = info?.group ? (
    <>
      mind-the-dag and the group <strong>{info.group}</strong>
    </>
  ) : (
    'mind-the-dag'
  );

  return (
    <div className="home join-page">
      <header className="topbar">
        <Wordmark />
      </header>
      <main className="join">
        {!info ? (
          <div className="signin-card join-card">
            <div className="signin-skeleton" />
            <div className="signin-skeleton short" />
          </div>
        ) : !info.valid ? (
          <div className="signin-card join-card">
            <h2>This invitation link can't be used</h2>
            <p className="signin-sub">
              {info.reason === 'used'
                ? 'All the places on it have been used.'
                : info.reason === 'expired'
                  ? 'It has expired (links work for 14 days).'
                  : 'The link is incomplete, or it was withdrawn.'}{' '}
              Ask {info.inviter || 'the admin'} for a new one.
            </p>
            <button onClick={() => onDone(null)}>Go to the start page</button>
          </div>
        ) : member ? (
          <div className="signin-card join-card">
            <h2>You're invited</h2>
            <p className="signin-sub">
              {info.inviter} invited you to {invitedTo}. You're signed in as {member.name}.
            </p>
            <button className="primary signin-submit" disabled={!!busy} onClick={() => void joinNow()}>
              {info.group ? `Join ${info.group}` : 'Continue'}
            </button>
            {error && <p className="note warn">{error}</p>}
          </div>
        ) : mode === 'signin' ? (
          <div className="join-card">
            <SignInCard title="Sign in to accept" sub={`${info.inviter} invited you${info.group ? ` to the group ${info.group}` : ''}. Sign in with the account you already have.`} foot={false} />
            <button className="link signin-alt" onClick={() => setMode('choose')}>
              Back to creating an account
            </button>
          </div>
        ) : (
          <div className="signin-card join-card">
            <h2>You're invited</h2>
            <p className="signin-sub">
              {info.inviter} invited you to {invitedTo}. Create your account with either of these:
            </p>
            <div className="join-choices">
              {providers.map((p) => (
                <OAuthButton key={p} provider={p} busy={busy === p} disabled={!!busy} onClick={() => void run(p, async () => (await signUpWith(p, code), await finish()))} label={`Sign up with ${p === 'github' ? 'GitHub' : p}`} />
              ))}
              <button className={`btn-oauth btn-email${mode === 'email' ? ' on' : ''}`} disabled={!!busy} onClick={() => setMode('email')}>
                Sign up with email
              </button>
            </div>
            {mode === 'email' && (
              <form
                className="stack tight join-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run('email', async () => (await signUpWithPassword(code, name, email, password), await finish()));
                }}
              >
                <label className="field">
                  <span>Your name</span>
                  <input autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                </label>
                <p className="note">At least 8 characters. There is no password-reset email, so keep it in your password manager.</p>
                <button type="submit" className="primary signin-submit" disabled={!!busy || !name.trim() || !email.includes('@') || password.length < 8}>
                  {busy === 'email' ? 'Creating your account…' : 'Create account'}
                </button>
              </form>
            )}
            {error && <p className="note warn">{error}</p>}
            <p className="signin-foot">
              Already have an account?{' '}
              <button className="link inline" onClick={() => setMode('signin')}>
                Sign in to accept
              </button>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
