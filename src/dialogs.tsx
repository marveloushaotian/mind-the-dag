import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { reducedMotion } from './motion';
import { IClose } from './icons';
import type { Doc } from './model';
import { shareUrl } from './share';
import { cloudEnabled, createCloudMap, explain, listMyGroups, PROVIDER_LABEL, signIn, signInProviders, signInWith, useMember, type Group, type Provider } from './cloud';
import type { Place } from './Editor';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

export function Modal({ title, onClose, children, width = 420, bare }: { title: string; onClose: () => void; children: ReactNode; width?: number; bare?: boolean }) {
  // Closing plays a short fade-out first (skipped with "reduce motion").
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    if (reducedMotion()) return onClose();
    setClosing(true);
    window.setTimeout(onClose, 140);
  }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
  return (
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`modal${bare ? ' bare' : ''}`} role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        {bare ? (
          <button className="icon modal-x" onClick={close} aria-label="Close">
            <IClose size={16} />
          </button>
        ) : (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon" onClick={close} aria-label="Close">
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

// Official marks dropped into src/brand/ (see README there) are used on the sign-in buttons.
const BRAND = import.meta.glob<string>('./brand/*.svg', { eager: true, query: '?url', import: 'default' });
const markFor = (p: Provider) => BRAND[`./brand/${p}-mark-white.svg`];

/** Sign-in options side by side in weight: GitHub, or the email and password of your account. */
export function SignInCard({ onDone, autoFocus, title = 'Sign in', sub = 'Your maps in the cloud, and the groups you work in.', foot = true }: { onDone?: () => void; autoFocus?: boolean; title?: string; sub?: string; foot?: boolean }) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void signInProviders().then(setProviders);
  }, []);
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
      {providers?.map((p) => (
        <OAuthButton key={p} provider={p} busy={busy === p} disabled={!!busy} onClick={() => void run(p, () => signInWith(p))} />
      ))}
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
      {error && <p className="note warn">{error}</p>}
      {foot && (
        <p className="signin-foot">
          <strong>Invite only.</strong> New here? Ask the admin for an invitation link.
        </p>
      )}
    </div>
  );
}

export function OAuthButton({ provider, busy, disabled, onClick, label }: { provider: Provider; busy?: boolean; disabled?: boolean; onClick: () => void; label?: string }) {
  const mark = markFor(provider);
  return (
    <button className={`btn-oauth btn-${provider}`} disabled={disabled} onClick={onClick}>
      {mark && <img src={mark} alt="" width={20} height={20} />}
      {busy ? `Waiting for ${PROVIDER_LABEL[provider]}…` : (label ?? `Continue with ${PROVIDER_LABEL[provider]}`)}
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
function CopyToGroup({ doc, place }: { doc: Doc; place: Place }) {
  const member = useMember();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [target, setTarget] = useState('');
  const [state, setState] = useState<{ busy?: boolean; done?: { id: string; name: string }; error?: string }>({});
  useEffect(() => {
    if (!member) return;
    listMyGroups()
      .then((g) => {
        const others = g.filter((x) => place.kind !== 'cloud' || x.id !== place.groupId);
        setGroups(others);
        setTarget(others[0]?.id ?? '');
      })
      .catch((e) => setState({ error: explain(e) }));
  }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!member || !groups) return null;
  if (!groups.length) return <p className="note">Make a group on the start page to share maps with others.</p>;
  const copy = async () => {
    setState({ busy: true });
    try {
      const m = await createCloudMap(doc, target);
      setState({ done: { id: m.id, name: groups.find((g) => g.id === target)?.name ?? 'the group' } });
    } catch (e) {
      setState({ error: explain(e) });
    }
  };
  return (
    <>
      <div className="share-row">
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Group">
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button className="primary" onClick={copy} disabled={state.busy || !target}>
          {state.busy ? 'Copying…' : 'Copy to group'}
        </button>
      </div>
      {state.done ? (
        <p className="note ok">
          Copied to {state.done.name}.{' '}
          <a href={`#/cloud/${state.done.id}`} onClick={() => undefined}>
            Open the group copy
          </a>
        </p>
      ) : (
        <p className="note">The group gets its own copy that every member can edit; this map stays as it is.</p>
      )}
      {state.error && <p className="note warn">{state.error}</p>}
    </>
  );
}

export function ShareDialog({ doc, place, onClose, onMoveToCloud }: { doc: Doc; place: Place; onClose: () => void; onMoveToCloud?: () => Promise<void> }) {
  const member = useMember();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    shareUrl(doc).then(setUrl).catch(() => setUrl(null));
  }, [doc]);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the field stays selectable */
    }
  };
  return (
    <Modal title="Share" onClose={onClose} width={500}>
      {cloudEnabled && (
        <div className="group-share">
          <h3>With a group</h3>
          {!member ? (
            <>
              <p className="note">Sign in to keep your maps in the cloud and share them with a group.</p>
              <button onClick={() => setSigningIn(true)}>Sign in</button>
              {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
            </>
          ) : (
            <>
              {place.kind === 'cloud' && place.groupName && (
                <p className="note">This map is in {place.groupName}: everyone in the group can view and edit it.</p>
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
                        setMoving(false);
                      }
                    }}
                  >
                    Move it to My maps
                  </button>{' '}
                  to open it anywhere.
                </p>
              )}
              {moveError && <p className="note warn">{moveError}</p>}
              <CopyToGroup doc={doc} place={place} />
            </>
          )}
        </div>
      )}
      <h3>View-only link</h3>
      <div className="share-row">
        <input readOnly value={url ?? 'Preparing…'} onFocus={(e) => e.target.select()} aria-label="Link" />
        <button className="primary" onClick={copy} disabled={!url}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="note">The map is stored inside the link itself; nothing is uploaded. Anyone with it can view the map and save their own copy.</p>
      {url && url.length > 8000 && <p className="note warn">This link is long; some chat apps may cut it. Sending the .json map file is safer.</p>}
    </Modal>
  );
}
