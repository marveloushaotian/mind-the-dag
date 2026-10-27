import { useEffect, useRef, useState } from 'react';
import type { Doc } from './model';
import type { ThemeId } from './tokens';

export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slug(s: string) {
  return (s || 'map').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'map';
}

export function ExportMenu({ doc, onMessage }: { doc: Doc; theme: ThemeId; onMessage: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  const run = async (fn: () => Promise<void> | void) => {
    setOpen(false);
    try {
      await fn();
    } catch (err) {
      onMessage(`Export failed: ${(err as Error).message}`);
    }
  };
  return (
    <div className="menu" ref={ref}>
      <button className="primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Export ▾
      </button>
      {open && (
        <div className="menu-list" role="menu">
          <button role="menuitem" onClick={() => run(() => download(`${slug(doc.title)}.json`, new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })))}>
            Map file (.json)
          </button>
        </div>
      )}
    </div>
  );
}
