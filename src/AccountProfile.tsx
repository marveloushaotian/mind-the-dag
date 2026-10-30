import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DISPLAY_NAME_MAX, explain, refreshSession, updateProfile, useMember, type Member } from './cloud';
import { Modal } from './dialogs';
import { IUser } from './icons';

const OpenProfile = createContext<(() => void) | null>(null);

/** One profile dialog for every route, with a reminder after session refresh. */
export function AccountProfileProvider({ children }: { children: ReactNode }) {
  const member = useMember();
  const [ready, setReady] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let live = true;
    void refreshSession().finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!member) { setOpenedFor(null); setDismissedFor(null); setSaved(false); }
  }, [member]);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2600);
    return () => window.clearTimeout(timer);
  }, [saved]);
  const open = useCallback(() => {
    if (!member) return;
    trigger.current = document.activeElement as HTMLElement | null;
    setOpenedFor(member.id);
  }, [member]);
  const close = () => {
    setOpenedFor(null);
    setDismissedFor(member?.id ?? null);
    const button = trigger.current;
    trigger.current = null;
    requestAnimationFrame(() => { if (button?.isConnected) button.focus(); });
  };
  const show = member && (openedFor === member.id || (ready && member.needsName && dismissedFor !== member.id));
  return (
    <OpenProfile.Provider value={open}>
      {children}
      {show && <ProfileDialog key={member.id} member={member} onClose={close} onSaved={() => { close(); setSaved(true); }} />}
      {saved && <div className="toast profile-toast" role="status">Display name updated</div>}
    </OpenProfile.Provider>
  );
}

/** The full name on the workspace, or a compact button on the drawing canvas. */
export function AccountProfileButton({ compact = false }: { compact?: boolean }) {
  const member = useMember();
  const open = useContext(OpenProfile);
  if (!member || !open) return null;
  return (
    <button className={`account-profile${compact ? ' compact' : ''}`} onClick={open} aria-label="Account profile" title="Account profile">
      <IUser size={18} />
      {!compact && <span className="account-name">{member.needsName ? 'Your account' : member.name}</span>}
    </button>
  );
}

export function ProfileDialog({ member, onClose, onSaved }: { member: Member; onClose: () => void; onSaved: () => void }) {
  const original = member.needsName ? '' : member.name;
  const [name, setName] = useState(original);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintId = useId();
  const field = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const dialog = field.current?.closest('[role="dialog"]');
    const trap = (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.key !== 'Tab') return;
      const items = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener('keydown', trap);
    return () => dialog?.removeEventListener('keydown', trap);
  }, []);
  return (
    <Modal title={member.needsName ? 'Add your display name' : 'Account profile'} onClose={onClose} dismissible={!busy} width={440}>
      <form className="stack profile-form" aria-busy={busy} onSubmit={async (e) => {
        e.preventDefault();
        if (saving.current || !name.trim() || name.trim() === original) return;
        saving.current = true;
        setBusy(true);
        setError(null);
        try {
          await updateProfile(name);
          if (mounted.current) onSaved();
        } catch (err) {
          if (mounted.current) setError(explain(err));
        } finally {
          saving.current = false;
          if (mounted.current) setBusy(false);
        }
      }}>
        <p className="note">{member.needsName ? 'Help your collaborators recognise you in groups and map activity.' : 'Your name in groups and map activity.'}</p>
        <label className="field">
          <span>Display name</span>
          <input ref={field} type="text" autoFocus autoComplete="name" required maxLength={DISPLAY_NAME_MAX} value={name} disabled={busy}
            aria-describedby={hintId} onChange={(e) => { setName(e.target.value); setError(null); }} />
        </label>
        <p className="note profile-hint" id={hintId}>Use a name your collaborators recognise.</p>
        <label className="field">
          <span>Account email</span>
          <input type="email" value={member.email} readOnly />
        </label>
        <p className="note profile-hint">Used to identify your account and group invitations.</p>
        {error && <p className="note warn" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onClose} disabled={busy}>{member.needsName ? 'Not now' : 'Cancel'}</button>
          <button type="submit" className="primary" disabled={busy || !name.trim() || name.trim() === original}>{busy ? 'Saving…' : 'Save name'}</button>
        </div>
      </form>
    </Modal>
  );
}
