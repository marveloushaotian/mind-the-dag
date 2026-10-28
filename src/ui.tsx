import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IChevron } from './icons';

/** Dropdown menu: a button that opens a list of actions. */
export function Menu({ label, icon, items, primary }: { label: string; icon?: ReactNode; primary?: boolean; items: { label: string; onSelect: () => void; hint?: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className={primary ? 'primary' : ''} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {icon}
        {label}
        <IChevron size={14} />
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
              {it.hint && <kbd>{it.hint}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A small popover attached to its trigger; fixed-positioned so scrolling panels don't clip it. */
export function Popover({ trigger, children, label, placement = 'bottom' }: { trigger: ReactNode; children: ReactNode; label: string; placement?: 'bottom' | 'top' }) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const open = pos !== null;
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setPos(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setPos(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const toggle = () => {
    if (open) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    setPos(placement === 'top' ? { left: r.left, bottom: window.innerHeight - r.top + 8 } : { left: r.left, top: r.bottom + 6 });
  };
  return (
    <div className="popover-anchor" ref={ref}>
      <button ref={btn} className="bare" onClick={toggle} aria-label={label} aria-expanded={open} title={label}>
        {trigger}
      </button>
      {pos && (
        <div className="popover" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, ReactNode][]; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)} role="radio" aria-checked={value === v}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** A labelled control. Use `group` for button groups, which must not sit inside a <label>. */
export const Field = ({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) =>
  group ? (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      {children}
    </div>
  ) : (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** The mind-the-dag wordmark: "mind-the-" in nf-core green, "dag" in ink. */
export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="wm-green">mind-the-</span>
      <span className="wm-ink">dag</span>
    </span>
  );
}
