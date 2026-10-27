import { useEffect, useState, type ReactNode } from 'react';
import { IClose } from './icons';
import type { Doc } from './model';
import { shareUrl } from './share';

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

export function ShareDialog({ doc, onClose }: { doc: Doc; onClose: () => void }) {
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
    <Modal title="Share a view-only link" onClose={onClose} width={440}>
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
