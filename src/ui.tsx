import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IChevron } from './icons';

/** Dropdown menu: a button that opens a list of actions. */
export function Menu({ label, icon, items, primary, className, ariaLabel, disabled }: {
  label: ReactNode;
  icon?: ReactNode;
  primary?: boolean;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  items: { label: string; onSelect: () => void; hint?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(0);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    buttons?.[initialFocus.current === -1 ? buttons.length - 1 : 0]?.focus();
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
    };
  }, [open]);
  return (
    <div className={`menu${className ? ` ${className}` : ''}`} ref={ref}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
      onKeyDown={(e) => {
        if (disabled) return;
        // Menu activation must not also invoke drawing shortcuts in the editor.
        if (open || e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        if (e.key === 'Escape' && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        } else if (['ArrowDown', 'ArrowUp', ...(open ? ['Home', 'End'] : [])].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          if (!open) {
            initialFocus.current = e.key === 'ArrowUp' ? -1 : 0;
            setOpen(true);
            return;
          }
          const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
            : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}>
      <button ref={trigger} className={primary ? 'primary' : ''} disabled={disabled}
        onClick={() => { initialFocus.current = 0; setOpen((o) => !o); }}
        aria-label={ariaLabel} title={ariaLabel} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}>
        {icon}
        {label}
        <IChevron size={14} />
      </button>
      {open && (
        <div ref={list} id={id} className="menu-list" role="menu" aria-label={ariaLabel}>
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
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
    window.addEventListener('pointerdown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
    };
  }, [open]);
  const toggle = () => {
    if (open) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    setPos(placement === 'top' ? { left: r.left, bottom: window.innerHeight - r.top + 8 } : { left: r.left, top: r.bottom + 6 });
  };
  return (
    <div className="popover-anchor" ref={ref} onKeyDown={(e) => {
      if (open && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setPos(null);
        btn.current?.focus();
      }
    }}>
      <button ref={btn} className="bare" onClick={toggle} aria-label={label} aria-expanded={open} title={label}>
        {trigger}
      </button>
      {pos && (
        <div className="popover" style={{ left: pos.left, top: pos.top, bottom: pos.bottom,
          maxHeight: pos.top === undefined ? 'calc(100vh - 24px)' : `calc(100vh - ${pos.top}px - 12px)` }}>
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
