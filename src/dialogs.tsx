import { useEffect, useState, type ReactNode } from 'react';
import { IClose } from './icons';
import type { Doc } from './model';
import { shareUrl } from './share';
import { groupEnabled, groupLink, publishMap, setGroupLink, signIn, useMember } from './group';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

export function Modal({ title, onClose, children, width = 380 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            <IClose size={16} />
          </button>
        </div>
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
      ['Line', ['L']],
      ['Section', ['R']],
    ],
  ],
  [
    'Drawing',
    [
      ['Place a station, continue the line', ['Click']],
      ['End the line', ['Esc']],
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
    <Modal title="Keyboard shortcuts" onClose={onClose} width={640}>
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

export function SignInDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Sign in to the group library" onClose={onClose} width={380}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="note warn">{error}</p>}
        <p className="note">Accounts are made by your group's admin. Your drafts stay in this browser either way.</p>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !email || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Share with the group library: creates the group copy, or updates it if this draft was shared before. */
function GroupShare({ doc, draftId }: { doc: Doc; draftId: string }) {
  const member = useMember();
  const [linked, setLinked] = useState(() => groupLink(draftId));
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  if (!groupEnabled) return null;
  const share = async () => {
    setState('busy');
    setError(null);
    try {
      const id = await publishMap(doc, linked);
      setGroupLink(draftId, id);
      setLinked(id);
      setState('done');
    } catch (e) {
      setError((e as Error).message);
      setState('idle');
    }
  };
  return (
    <div className="group-share">
      <h3>Group library</h3>
      {member ? (
        <>
          <div className="share-row">
            <button className="primary" onClick={share} disabled={state === 'busy'}>
              {state === 'busy' ? 'Sharing…' : linked ? 'Update group copy' : 'Share with group'}
            </button>
            {state === 'done' && <span className="note ok">{linked ? 'Group copy is up to date' : 'Shared'}</span>}
          </div>
          <p className="note">
            {linked
              ? 'Your group sees the copy as it was when you last shared it. Update it after you make changes.'
              : 'Everyone in your group can view it and make their own copy. Only you can update or remove it.'}
          </p>
        </>
      ) : (
        <>
          <button onClick={() => setSigningIn(true)}>Sign in to share with your group</button>
          {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
        </>
      )}
      {error && <p className="note warn">{error}</p>}
    </div>
  );
}

export function ShareDialog({ doc, draftId, onClose }: { doc: Doc; draftId: string; onClose: () => void }) {
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
    <Modal title="Share" onClose={onClose} width={440}>
      <GroupShare doc={doc} draftId={draftId} />
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
