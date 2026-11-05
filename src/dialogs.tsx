import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { reducedMotion } from './motion';
import { IClose } from './icons';
import type { Doc } from './model';
import { shareUrl } from './share';
import { cancelSocialSignIn, cloudEnabled, createCloudMap, explain, listMyGroups, PROVIDER_LABEL, signIn, signInWith, useMember, useSignInProviders, type Group, type Provider } from './cloud';
import type { Place } from './Editor';
import githubMark from './brand/github-mark-white.svg';
import googleMark from './brand/google-mark.png';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

// Only the top dialog owns keyboard input, including nested sign-in dialogs.
const modalStack: HTMLElement[] = [];

export function Modal({ title, onClose, children, width = 420, bare, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; width?: number; bare?: boolean; dismissible?: boolean }) {
  // Closing plays a short fade-out first (skipped with "reduce motion").
  const [closing, setClosing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [opener] = useState(() => typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  const close = useCallback(() => {
    if (!dismissible) return;
    if (reducedMotion()) return onClose();
    if (closeTimer.current !== undefined) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 140);
  }, [onClose, dismissible]);
  const closeRef = useRef(close);
  closeRef.current = close;
  useLayoutEffect(() => {
    const dialog = root.current!;
    const child = modalStack.findIndex((el) => dialog.contains(el));
    if (child < 0) modalStack.push(dialog);
    else modalStack.splice(child, 0, dialog);
    if (!dialog.contains(document.activeElement)) dialog.focus();
    const k = (e: KeyboardEvent) => {
      if (modalStack.at(-1) !== dialog) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      } else if (e.key === 'Tab') {
        const targets = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
          .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled, [hidden]') && el.getClientRects().length);
        const first = targets[0];
        const last = targets.at(-1);
        if (!first || (e.shiftKey ? document.activeElement === first || document.activeElement === dialog : document.activeElement === last || document.activeElement === dialog)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
      }
    };
    const contain = (e: FocusEvent) => {
      if (modalStack.at(-1) === dialog && !dialog.contains(e.target as Node)) dialog.focus();
    };
    window.addEventListener('keydown', k);
    document.addEventListener('focusin', contain);
    return () => {
      window.removeEventListener('keydown', k);
      document.removeEventListener('focusin', contain);
      const wasTop = modalStack.at(-1) === dialog;
      modalStack.splice(modalStack.indexOf(dialog), 1);
      window.clearTimeout(closeTimer.current);
      if (wasTop && opener?.isConnected) opener.focus();
    };
  }, [opener]);
  return (
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={root} tabIndex={-1} className={`modal${bare ? ' bare' : ''}`} role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        {bare ? (
          <button className="icon modal-x" onClick={close} aria-label="Close" disabled={!dismissible}>
            <IClose size={16} />
          </button>
        ) : (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon" onClick={close} aria-label="Close" disabled={!dismissible}>
              <IClose size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const Keys = ({ keys }: { keys: string[] }) => (
  <span className="keys-combo">
    {keys.map((k, i) =>
      k === '/' ? (
        <span key={i} className="or">
          or
        </span>
      ) : (
        <kbd key={i} className="key">
          {k}
        </kbd>
      ),
    )}
  </span>
);

const GROUPS: [string, [string, string[]][]][] = [
  [
    'Tools',
    [
      ['Select', ['V']],
      ['Station', ['S']],
      ['Connect', ['C']],
      ['Section', ['R']],
    ],
  ],
  [
    'Drawing',
    [
      ['Place a station (Station tool)', ['Click']],
      ['Connect stations (Connect tool)', ['Click A', 'Click B']],
      ['Finish connecting / leave Station tool', ['Esc']],
      ['Rename a station', ['Double-click', '/', 'Enter']],
      ['Move a section with its stations', ['Alt', 'Drag']],
      ['Slide a bend along a connection', ['Drag the handle']],
      ['Temporarily skip alignment', [MOD, 'Drag']],
    ],
  ],
  [
    'Editing',
    [
      ['Undo', [MOD, 'Z']],
      ['Redo', ['⇧', MOD, 'Z']],
      ['Select an area', ['Drag on empty canvas']],
      ['Add to selection', ['⇧', 'Click']],
      ['Select all', [MOD, 'A']],
      ['Copy, cut, paste', [MOD, 'C', '/', 'X', '/', 'V']],
      ['Duplicate', [MOD, 'D']],
      ['Delete', ['⌫']],
      ['Nudge', ['←', '↑', '→', '↓']],
    ],
  ],
  [
    'View',
    [
      ['Zoom', ['Pinch', '/', MOD, 'Scroll']],
      ['Zoom in, out', ['+', '−']],
      ['Actual size', ['0']],
      ['Fit to screen', ['F']],
      ['Pan', ['Scroll', '/', 'Space', 'Drag']],
    ],
  ],
  [
    'File',
    [
      ['Open a file', [MOD, 'O']],
      ['Show this list', ['?']],
    ],
  ],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={840}>
      <div className="shortcut-grid">
        {GROUPS.map(([g, rows]) => (
          <section key={g}>
            <h3>{g}</h3>
            {rows.map(([label, keys]) => (
              <div key={label} className="shortcut">
                <span>{label}</span>
                <Keys keys={keys} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  );
}

// Official marks are bundled locally; missing assets fail the build.
const PROVIDER_MARK: Record<Provider, string> = { github: githubMark, google: googleMark };
const invitationEmail = `mailto:haotian.zheng@helsinki.fi?${new URLSearchParams({
  subject: 'Mind the DAG — Invitation request',
  body: 'Hello Haotian,\r\n\r\nI would like to request an invitation to Mind the DAG.\r\n\r\nName: \r\nInstitution / affiliation: \r\nIntended use: \r\n\r\nThank you!',
}).toString().replace(/\+/g, '%20')}`;

/** Offer every configured social provider alongside the account's email/password. */
export function SignInCard({ onDone, autoFocus, title = 'Sign in', sub = 'Your maps in the cloud, and the groups you work in.', foot = true }: { onDone?: () => void; autoFocus?: boolean; title?: string; sub?: string; foot?: boolean }) {
  const { providers, error: providerError, retry: retryProviders } = useSignInProviders();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => cancelSocialSignIn(), []);
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };
  return (
    <div className="signin-card">
      <h2>{title}</h2>
      {sub && <p className="signin-sub">{sub}</p>}
      {providers === null && <div className="signin-skeleton" aria-hidden="true" />}
      {providerError && <p className="note warn" role="alert">{providerError}{' '}
        <button type="button" className="link inline" onClick={retryProviders}>Reload sign-in options</button></p>}
      {providers?.map((p) => (
        <OAuthButton key={p} provider={p} busy={busy === p} disabled={!!busy} onClick={() => void run(p, () => signInWith(p))} />
      ))}
      {busy && busy !== 'password' && <button type="button" className="link signin-alt" onClick={cancelSocialSignIn}>Cancel sign-in</button>}
      {!!providers?.length && (
        <div className="signin-or" role="separator">
          <span>or</span>
        </div>
      )}
      <form
        className="stack tight"
        onSubmit={(e) => {
          e.preventDefault();
          void run('password', () => signIn(email, password));
        }}
      >
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" autoFocus={autoFocus && providers !== null && !providers.length} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button type="submit" className="primary signin-submit" disabled={!!busy || !email || !password}>
          {busy === 'password' ? 'Signing in…' : 'Sign in with email'}
        </button>
      </form>
      {error && <p className="note warn" role="alert">{error}</p>}
      {foot && (
        <p className="signin-foot">
          <strong>Invite only.</strong> New here?{' '}
          <a href={invitationEmail}>Request an invitation</a>.
        </p>
      )}
      <PrivacyLink />
    </div>
  );
}

export function PrivacyLink() {
  return <p className="signin-privacy"><a href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noopener">Privacy notice</a></p>;
}

export function OAuthButton({ provider, busy, disabled, onClick, label }: { provider: Provider; busy?: boolean; disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className={`btn-oauth btn-${provider}`} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}>
      <img className="oauth-mark" src={PROVIDER_MARK[provider]} alt="" width={20} height={20} aria-hidden="true" />
      <span>{busy ? `Waiting for ${PROVIDER_LABEL[provider]}…` : (label ?? `Continue with ${PROVIDER_LABEL[provider]}`)}</span>
    </button>
  );
}

export function SignInDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Sign in" onClose={onClose} width={400} bare>
      <SignInCard onDone={onClose} autoFocus />
    </Modal>
  );
}

/** Copy the open map into one of your groups. */
function CopyToGroup({ doc, place, onBusyChange }: { doc: Doc; place: Place; onBusyChange: (busy: boolean) => void }) {
  const member = useMember();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [target, setTarget] = useState('');
  const [state, setState] = useState<{ busy?: boolean; done?: { id: string; name: string }; error?: string }>({});
  const load = useCallback(() => {
    if (!member) return;
    setState({});
    listMyGroups()
      .then((g) => {
        const others = g.filter((x) => place.kind !== 'cloud' || x.id !== place.groupId);
        setGroups(others);
        setTarget(others[0]?.id ?? '');
      })
      .catch((e) => setState({ error: explain(e) }));
  }, [member?.id, place.kind, place.kind === 'cloud' ? place.groupId : null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  if (!member) return null;
  if (!groups) return state.error
    ? <div role="alert"><p className="note warn">{state.error}</p><button onClick={load}>Try again</button></div>
    : <p className="note" role="status">Loading your groups…</p>;
  if (!groups.length) return place.kind === 'cloud' && place.groupId ? null : <p className="note">No groups yet. <a href="#/">Go to My maps</a> and choose New group beside Groups.</p>;
  const copy = async () => {
    setState({ busy: true });
    onBusyChange(true);
    try {
      const m = await createCloudMap(doc, target);
      setState({ done: { id: m.id, name: groups.find((g) => g.id === target)?.name ?? 'the group' } });
    } catch (e) {
      setState({ error: explain(e) });
    } finally { onBusyChange(false); }
  };
  return (
    <>
      {state.done ? (
        <div className="workflow-result" role="status">
          <strong>Group copy created in {state.done.name}</strong>
          <p className="note">Continue editing the group copy so your colleagues see your changes.</p>
          <a href={`#/cloud/${state.done.id}`}>Open the group copy →</a>
        </div>
      ) : <><div className="field"><span>Copy to a group</span><div className="share-row">
        <select disabled={state.busy} value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Group">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={copy} disabled={state.busy || !target}>
          {state.busy ? 'Copying…' : 'Copy to group'}
        </button>
      </div></div>
      <p className="note">All group members can edit the new copy. Changes to these two copies stay separate.</p></>}
      {state.error && <p className="note warn" role="alert">{state.error}</p>}
    </>
  );
}

/** A selectable link remains usable when browser clipboard permission is unavailable. */
export function CopyLinkField({ url, label = 'Link', buttonLabel = 'Copy link' }: { url: string; label?: string; buttonLabel?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  useEffect(() => setStatus('idle'), [url]);
  return <div className="stack tight">
    <div className="share-row">
      <input ref={input} readOnly value={url} aria-label={label} onFocus={(e) => e.target.select()} />
      <button className="primary" onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setStatus('copied');
        } catch {
          input.current?.focus();
          input.current?.select();
          setStatus('manual');
        }
      }}>{status === 'copied' ? 'Copied' : buttonLabel}</button>
    </div>
    <span className="note" role="status">{status === 'manual' ? `Copying is unavailable. The link is selected; press ${MOD}+C to copy it.` : status === 'copied' ? 'Link copied. Share it with your recipients.' : ''}</span>
  </div>;
}

export function ShareDialog({ doc, place, onClose, onMoveToCloud }: { doc: Doc; place: Place; onClose: () => void; onMoveToCloud?: () => Promise<void> }) {
  const member = useMember();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<'snapshot' | 'group'>(place.kind === 'cloud' && place.groupId ? 'group' : 'snapshot');
  useEffect(() => {
    let live = true;
    setUrl(null);
    setLinkError(null);
    shareUrl(doc).then((value) => { if (live) setUrl(value); }).catch(() => { if (live) setLinkError('Could not prepare the snapshot link. Try again.'); });
    return () => { live = false; };
  }, [doc, attempt]);
  return (
    <Modal title="Share" onClose={onClose} width={500} dismissible={!moving && !copying}>
      {cloudEnabled && <div className="seg" role="group" aria-label="Sharing purpose">
        <button disabled={moving || copying} aria-pressed={mode === 'snapshot'} className={mode === 'snapshot' ? 'on' : ''} onClick={() => setMode('snapshot')}>Send a snapshot</button>
        <button disabled={moving || copying} aria-pressed={mode === 'group'} className={mode === 'group' ? 'on' : ''} onClick={() => setMode('group')}>Collaborate with a group</button>
      </div>}
      {cloudEnabled && mode === 'group' && (
        <div className="group-share">
          <h3>Work on a shared map</h3>
          {!member ? (
            <>
              <p className="note">Sign in to keep your maps in the cloud and share them with a group.</p>
              <button onClick={() => setSigningIn(true)}>Sign in</button>
              {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
            </>
          ) : (
            <>
              {place.kind === 'cloud' && place.groupName && (
                <div className="workflow-result">
                  <strong>{place.groupName} · Members can edit</strong>
                  <p className="note">This link opens the shared map, including future changes. Only members of this group can open it.</p>
                  <CopyLinkField url={new URL(`#/cloud/${place.mapId}`, window.location.href).href} label="Group map link" />
                </div>
              )}
              {place.kind === 'local' && onMoveToCloud && (
                <p className="note">
                  This map is only in this browser.{' '}
                  <button
                    className="link inline"
                    disabled={moving}
                    onClick={async () => {
                      setMoving(true);
                      setMoveError(null);
                      try {
                        await onMoveToCloud();
                      } catch (e) {
                        setMoveError(explain(e));
                      } finally { setMoving(false); }
                    }}
                  >
                    {moving ? 'Moving…' : 'Move it to My maps'}
                  </button>{' '}
                  to open it anywhere.
                </p>
              )}
              {moveError && <p className="note warn">{moveError}</p>}
              <CopyToGroup doc={doc} place={place} onBusyChange={setCopying} />
            </>
          )}
        </div>
      )}
      {mode === 'snapshot' && <>
        <h3>Anyone with the link · View only</h3>
        <p className="note">Send the map as it looks now. Recipients can view it without an account and make their own copy.</p>
        <p className="note">Later edits will not update this snapshot. It cannot be withdrawn after sharing.</p>
        {url ? <CopyLinkField url={url} label="Snapshot link" /> : linkError ? <div role="alert"><p className="note warn">{linkError}</p><button onClick={() => setAttempt((n) => n + 1)}>Try again</button></div> : <p role="status" className="note">Preparing snapshot…</p>}
        {url && url.length > 8000 && <p className="note warn">This link is long; some chat apps may cut it. Use Export → Map file (.json) to send an editable file instead.</p>}
      </>}
    </Modal>
  );
}
