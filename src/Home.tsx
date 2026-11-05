import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { metagenomeExample } from './examples';
import { IDuplicate, IFile, IGroup, IPlus, ITrash, IUpload } from './icons';
import { Wordmark } from './ui';
import { importFile } from './importers';
import { backupAll, deleteMap, duplicateMap, isBackup, listMaps, loadMap, requestPersistence, restoreBackup, retireMap, type MapEntry } from './library';
import { moveDraftsToCloud } from './drafts';
import { download } from './exporters';
import { emptyDoc, type Doc } from './model';
import { docBounds, MetroMap } from './render';
import CoverBackdrop from './CoverBackdrop';
import { AccountMenu } from './AccountProfile';
import { CopyLinkField, Modal, SignInCard, SignInDialog } from './dialogs';
import {
  acceptInvitation,
  cloudEnabled,
  createCloudMap,
  createGroup,
  deleteCloudMap,
  deleteGroup,
  deleteInvitation,
  explain,
  invite,
  listGroupInvitations,
  listGroupMaps,
  listMembers,
  listMyGroups,
  listMyInvitations,
  listMyMaps,
  removeMembership,
  renameGroup,
  updatedMs,
  useMember,
  createSignupLink,
  deleteSignupLink,
  joinUrl,
  listSignupLinks,
  type SignupLink,
  type CloudMap,
  type Group,
  type GroupMember,
  type Invitation,
  type Member,
  primeCloudMap,
} from './cloud';
import { whenSynced } from './cloudSync';
import { markOpening, transition } from './motion';

const SECTION_KEY = 'mind-the-dag:section';

function ago(t: number): string {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(t).toLocaleDateString();
}

function Thumb({ doc }: { doc: Doc | null }) {
  const b = doc && docBounds(doc);
  if (!doc || !b) return <div className="thumb empty-thumb" />;
  const pad = 24;
  return (
    <svg className="thumb" viewBox={`${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <MetroMap doc={doc} exporting />
    </svg>
  );
}

/** A map card with hover actions; destructive actions ask once inline. */
const CARD_ICONS = { duplicate: IDuplicate, group: IGroup, upload: IUpload };

function Card({
  id,
  index = 0,
  doc,
  title,
  meta,
  onOpen,
  actions,
  danger,
}: {
  id: string;
  index?: number;
  doc: Doc | null;
  title: string;
  meta: ReactNode;
  onOpen: () => void;
  actions: { label: string; icon: 'duplicate' | 'group' | 'upload'; run: () => void | Promise<void> }[];
  /** `confirm` is the button in the confirmation; `warning` a line under the question. */
  danger?: { label: string; confirm: string; warning?: string; run: () => void | Promise<void> };
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="card" data-map-id={id} style={{ '--i': Math.min(index, 12) } as CSSProperties}>
      <button
        className="card-main"
        onClick={(e) => {
          markOpening(e.currentTarget.closest('li'), id);
          onOpen();
        }}
      >
        <Thumb doc={doc} />
        <span className="card-title">{title || 'Untitled'}</span>
        <span className="card-meta">{meta}</span>
      </button>
      {!confirm && (
        <div className="card-actions">
          {actions.map((a) => {
            const Icon = CARD_ICONS[a.icon];
            return (
              <button key={a.label} className="card-act" disabled={busy} onClick={() => void act(a.run)} aria-label={a.label} data-tip={a.label}>
                <Icon size={16} />
              </button>
            );
          })}
          {danger && (
            <button className="card-act danger" disabled={busy} onClick={() => setConfirm(true)} aria-label={danger.label} data-tip={danger.label}>
              <ITrash size={16} />
            </button>
          )}
        </div>
      )}
      {confirm && danger && (
        <div className="card-confirm" role="alertdialog" aria-label={`Delete ${title || 'Untitled'}?`}>
          <strong>Delete “{title || 'Untitled'}”?</strong>
          {danger.warning && <span>{danger.warning}</span>}
          <div className="card-confirm-actions">
            <button disabled={busy} onClick={() => setConfirm(false)} autoFocus>
              Keep
            </button>
            <button className="solid-danger" disabled={busy} onClick={() => void act(danger.run)}>
              {danger.confirm}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function OpenFileButton({ onDoc, onBackup }: { onDoc: (d: Doc) => void; onBackup?: (n: number, name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button className="big" onClick={() => input.current?.click()}>
        <IFile /> Open file…
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,.mmd,.txt,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            // A backup restores every draft in it (to this browser); anything else opens as one new map.
            const text = await f.text();
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(text);
            } catch {
              /* not JSON: .mmd or similar */
            }
            if (isBackup(parsed)) {
              onBackup?.(restoreBackup(parsed), f.name);
              return;
            }
            onDoc(await importFile(f));
          } catch (err) {
            setError(`Couldn't open ${f.name}: ${(err as Error).message}`);
          }
        }}
      />
      {error && <p className="home-error">{error}</p>}
    </>
  );
}

function Account({ member }: { member: Member | null }) {
  const [signingIn, setSigningIn] = useState(false);
  if (!cloudEnabled) return null;
  return member ? (
    <AccountMenu />
  ) : (
    <>
      <button onClick={() => setSigningIn(true)}>
        Sign in
      </button>
      {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
    </>
  );
}

export default function Home({
  onOpenLocal,
  onOpenCloud,
  onCreate,
  createError,
}: {
  onOpenLocal: (id: string) => void;
  onOpenCloud: (id: string) => void;
  onCreate: (d: Doc, groupId?: string | null) => void;
  createError: string | null;
}) {
  const member = useMember();
  useEffect(() => requestPersistence(), []);
  // Signed out: the start page is the sign-in page, with a way to try the editor without an account.
  const [tryLocal, setTryLocalState] = useState(() => {
    try {
      return sessionStorage.getItem(LOCAL_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setTryLocal = (v: boolean) => {
    setTryLocalState(v);
    try {
      if (v) sessionStorage.setItem(LOCAL_MODE_KEY, '1');
      else sessionStorage.removeItem(LOCAL_MODE_KEY);
    } catch {
      /* ignore */
    }
  };
  const landing = cloudEnabled && !member && !tryLocal;
  return (
    <div className={`home${landing ? ' landing-page' : ''}`}>
      <header className="topbar">
        <Wordmark />
        <span className="spacer" />
        {member && <Account member={member} />}
      </header>
      {landing && <CoverBackdrop />}
      {member ? (
        <Workspace key={member.id} member={member} onOpenLocal={onOpenLocal} onOpenCloud={onOpenCloud} onCreate={onCreate} createError={createError} />
      ) : landing ? (
        <Landing onTry={() => setTryLocal(true)} />
      ) : (
        <LocalHome onOpen={onOpenLocal} onCreate={(d) => onCreate(d)} onBack={cloudEnabled ? () => setTryLocal(false) : undefined} />
      )}
    </div>
  );
}

const LOCAL_MODE_KEY = 'mind-the-dag:try-local';

// ------------------------------------------------------------------ signed out: sign-in first
function Landing({ onTry }: { onTry: () => void }) {
  const example = useMemo(() => metagenomeExample(), []);
  const b = docBounds(example);
  const drafts = listMaps().length;
  return (
    <main className="landing">
      <section className="landing-intro">
        <h1>Metro maps for your pipelines</h1>
        <p>
          Draw workflow diagrams in the nf-core metro-map style, export them for papers, and keep them in the cloud to work on with your group.
        </p>
        {b && (
          <div className="landing-preview" aria-hidden="true">
            <svg viewBox={`${b.x0 - 24} ${b.y0 - 24} ${b.x1 - b.x0 + 48} ${b.y1 - b.y0 + 48}`} preserveAspectRatio="xMidYMid meet">
              <MetroMap doc={example} exporting />
            </svg>
          </div>
        )}
      </section>
      <section className="landing-side">
        <SignInCard />
        <button className="landing-try" onClick={onTry}>
          <span>Try it without an account →</span>
          <span className="home-hint">{drafts ? `${drafts} map${drafts === 1 ? '' : 's'} saved in this browser` : 'Maps stay in this browser only'}</span>
        </button>
      </section>
    </main>
  );
}

// ------------------------------------------------------------------ signed out: this browser only
function LocalHome({ onOpen, onCreate, onBack }: { onOpen: (id: string) => void; onCreate: (d: Doc) => void; onBack?: () => void }) {
  const [maps, setMaps] = useState(listMaps);
  // Re-read after mount: an editor that just closed saves its last changes during unmount.
  useEffect(() => setMaps(listMaps()), []);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <main className="home-main">
      {onBack && (
        <div className="callout local-banner">
          <span>
            <strong>Not signed in.</strong> Maps you make now are kept in this browser only.
          </span>
          <span className="spacer" />
          <button className="small primary" onClick={onBack}>
            Sign in
          </button>
        </div>
      )}
      <div className="home-actions">
        <button className="primary big" onClick={() => onCreate(emptyDoc())}>
          <IPlus /> New map
        </button>
        <OpenFileButton
          onDoc={onCreate}
          onBackup={(n, name) => {
            setMaps(listMaps());
            setNotice(`Restored ${n} draft${n === 1 ? '' : 's'} from ${name}`);
          }}
        />
        <button className="link" onClick={() => onCreate(metagenomeExample())}>
          Try an editable example
        </button>
      </div>
      {!maps.length && <div className="home-empty-intro"><h1>No maps yet</h1><p>Choose New map to start from a blank canvas, or try an example you can change. Your work saves automatically in this browser.</p></div>}
      {notice && <p className="home-notice">{notice}</p>}
      {maps.length > 0 && <LocalDrafts maps={maps} onOpen={onOpen} onChange={() => setMaps(listMaps())} />}
    </main>
  );
}

function LocalDrafts({
  maps,
  onOpen,
  onChange,
  onMove,
}: {
  maps: MapEntry[];
  onOpen: (id: string) => void;
  onChange: () => void;
  onMove?: (id: string) => Promise<void>;
}) {
  return (
    <>
      <div className="home-h-row">
        <h2 className="home-h">{onMove ? 'On this browser' : 'Drafts'}</h2>
        <span className="home-hint">Kept in this browser only</span>
        <span className="spacer" />
        <button
          className="small"
          onClick={() => {
            const stamp = new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local date
            download(`mind-the-dag-drafts-${stamp}.json`, new Blob([JSON.stringify(backupAll(), null, 1)], { type: 'application/json' }));
          }}
          title="Download every draft as one file; open it here (or on another computer) to restore"
        >
          Back up all drafts
        </button>
      </div>
      <ul className="cards">
        {maps.map((m) => (
          <Card
            key={m.id}
            id={m.id}
            index={maps.indexOf(m)}
            doc={loadMap(m.id)}
            title={m.title}
            meta={ago(m.updated)}
            onOpen={() => onOpen(m.id)}
            actions={
              onMove
                ? [{ label: 'Move to My maps', icon: 'upload', run: () => onMove(m.id) }]
                : [
                    {
                      label: 'Duplicate',
                      icon: 'duplicate',
                      run: () => {
                        duplicateMap(m.id);
                        onChange();
                      },
                    },
                  ]
            }
            danger={{
              label: 'Delete',
              confirm: 'Delete',
              warning: 'It is only in this browser, so it is gone for good.',
              run: () => {
                deleteMap(m.id);
                onChange();
              },
            }}
          />
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ signed in: cloud workspace
const listCache = new Map<string, CloudMap[]>();
const sideCache: { groups: Group[] | null; invites: Invitation[] } = { groups: null, invites: [] };
let cacheOwner: string | null = null;
/** Forget cached lists when someone else signs in on this browser. */
function cacheFor(memberId: string) {
  if (cacheOwner === memberId) return;
  cacheOwner = memberId;
  listCache.clear();
  sideCache.groups = null;
  sideCache.invites = [];
}
type Section = 'mine' | 'local' | 'invites' | `g:${string}`;

function Workspace({
  member,
  onOpenLocal,
  onOpenCloud,
  onCreate,
  createError,
}: {
  member: Member;
  onOpenLocal: (id: string) => void;
  onOpenCloud: (id: string) => void;
  onCreate: (d: Doc, groupId?: string | null) => void;
  createError: string | null;
}) {
  cacheFor(member.id);
  const [section, setSectionState] = useState<Section>(() => {
    try {
      return (localStorage.getItem(SECTION_KEY) as Section) || 'mine';
    } catch {
      return 'mine';
    }
  });
  // `also` lands in the same render, so the fallback below never sees a half-updated sidebar.
  const setSection = (s: Section, also?: () => void) => {
    transition(() => {
      also?.();
      setSectionState(s);
      setMaps(listCache.get(s) ?? null);
    });
    try {
      localStorage.setItem(SECTION_KEY, s);
    } catch {
      /* ignore */
    }
  };
  const setSectionRef = useRef(setSection);
  setSectionRef.current = setSection;
  const [groups, setGroupsState] = useState<Group[] | null>(sideCache.groups);
  const [invites, setInvitesState] = useState<Invitation[]>(sideCache.invites);
  const setGroups = (g: Group[]) => setGroupsState((sideCache.groups = g));
  const setInvites = (i: Invitation[]) => setInvitesState((sideCache.invites = i));
  const [local, setLocal] = useState<MapEntry[]>(listMaps);
  // Lists from the last visit show at once and refresh in place.
  const [maps, setMaps] = useState<CloudMap[] | null>(() => listCache.get(section) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState(false);
  const [managing, setManaging] = useState<'invite' | 'members' | null>(null);
  const [copying, setCopying] = useState<CloudMap | null>(null);
  const [links, setLinks] = useState<{ group: string | null } | null>(null);

  const groupId = section.startsWith('g:') ? section.slice(2) : null;
  const group = groups?.find((g) => g.id === groupId) ?? null;

  /** Reload groups and invitations; with `next`, switch to that section in the same update. */
  const loadSide = useCallback(async (next?: Section) => {
    try {
      const [g, i] = await Promise.all([listMyGroups(), listMyInvitations()]);
      const apply = () => {
        setGroups(g);
        setInvites(i);
      };
      if (next) setSectionRef.current(next, apply);
      else apply();
    } catch (e) {
      setError(explain(e));
    }
    setLocal(listMaps());
  }, []);
  const loadMaps = useCallback(async () => {
    if (section === 'local' || section === 'invites') return;
    try {
      await whenSynced();
      // Signed in, nothing stays only in this browser: drafts move into My maps first.
      const moved = await moveDraftsToCloud().catch((e) => (setError(explain(e)), 0));
      if (moved) {
        setLocal(listMaps());
        setNotice(`Moved ${moved} map${moved === 1 ? '' : 's'} from this browser into My maps.`);
      }
      const fresh = section === 'mine' ? await listMyMaps() : await listGroupMaps(section.slice(2));
      listCache.set(section, fresh);
      setMaps(fresh);
    } catch (e) {
      setError(explain(e));
    }
  }, [section]);
  useEffect(() => {
    void loadSide();
    const refresh = () => { if (document.visibilityState === 'visible') void loadSide(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [loadSide]);
  useEffect(() => {
    setError(null);
    void loadMaps();
  }, [loadMaps]);
  // A remembered group you have since left: fall back to My maps.
  useEffect(() => {
    if (groups && groupId && !group) setSection('mine');
    if (section === 'local' && !local.length) setSection('mine');
  }, [groups, groupId, group, section, invites.length, local.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveLocal = async (id: string) => {
    const d = loadMap(id);
    if (!d) return;
    try {
      retireMap(id, (await createCloudMap(d)).id);
      setLocal(listMaps());
      setNotice(`Moved “${d.title || 'Untitled'}” to My maps.`);
      if (section === 'mine') await loadMaps();
    } catch (e) {
      setError(explain(e));
    }
  };
  const moveAllLocal = async () => {
    let n = 0;
    for (const m of listMaps()) {
      const d = loadMap(m.id);
      if (!d) continue;
      try {
        retireMap(m.id, (await createCloudMap(d)).id);
        n += 1;
      } catch (e) {
        setError(explain(e));
        break;
      }
    }
    setLocal(listMaps());
    setNotice(`Moved ${n} map${n === 1 ? '' : 's'} to My maps.`);
    if (section === 'mine') await loadMaps();
    else setSection('mine');
  };

  const title = section === 'mine' ? 'My maps' : section === 'local' ? 'On this browser' : section === 'invites' ? 'Group invitations' : (group?.name ?? '');
  const hint =
    section === 'mine'
      ? 'Only you can see these'
      : section === 'local'
        ? 'Not in the cloud yet; move them to open them anywhere'
        : section === 'invites'
          ? ''
          : 'Everyone in this group can view and edit these';

  return (
    <div className="workspace">
      <nav className="side" aria-label="Workspace">
        <button className={`side-item${section === 'mine' ? ' on' : ''}`} onClick={() => setSection('mine')}>
          My maps
        </button>
        <div className="side-h">
          <span>Groups</span>
          <button className="small" onClick={() => setNewGroup(true)} aria-label="New group" title="New group">
            <IPlus size={14} /> New group
          </button>
        </div>
        {groups?.map((g) => (
          <button key={g.id} className={`side-item${section === `g:${g.id}` ? ' on' : ''}`} onClick={() => setSection(`g:${g.id}`)}>
            {g.name}
          </button>
        ))}
        {groups && !groups.length && (
          <button className="side-empty" onClick={() => setNewGroup(true)}>
            Start a group to share maps
          </button>
        )}
        <button className={`side-item${section === 'invites' ? ' on' : ''}`} onClick={() => setSection('invites')}>
          Group invitations {invites.length > 0 && <span className="count">{invites.length}</span>}
        </button>
        {local.length > 0 && (
          <button className={`side-item muted${section === 'local' ? ' on' : ''}`} onClick={() => setSection('local')}>
            On this browser <span className="count">{local.length}</span>
          </button>
        )}
        {member.admin && (
          <>
            <span className="spacer" />
            <button className="side-item side-invite" onClick={() => setLinks({ group: null })}>
              <IPlus size={14} /> Invite to mind-the-dag
            </button>
          </>
        )}
      </nav>

      <main className="home-main">
        <div className="home-title-row">
          <h1 className="home-title">{title}</h1>
          {hint && <span className="home-hint">{hint}</span>}
          {group && (
            <div className="group-title-actions">
              <button className="primary small" onClick={() => setManaging('invite')}><IPlus size={15} /> Invite members</button>
              <button className="small" onClick={() => setManaging('members')}><IGroup size={15} /> Members{group.role === 'owner' ? ' & settings' : ''}</button>
            </div>
          )}
        </div>

        {(section === 'mine' || groupId) && (
          <div className="home-actions">
            <button className="primary big" onClick={() => onCreate(emptyDoc(), groupId)}>
              <IPlus /> New map
            </button>
            <OpenFileButton
              onDoc={(d) => onCreate(d, groupId)}
              onBackup={async (n, name) => {
                const moved = await moveDraftsToCloud().catch((e) => (setError(explain(e)), 0));
                setLocal(listMaps());
                setNotice(`Restored ${n} map${n === 1 ? '' : 's'} from ${name}${moved ? ' into My maps' : ''}.`);
                if (section === 'mine') await loadMaps();
              }}
            />
            <button className="link" onClick={() => onCreate(metagenomeExample(), groupId)}>
              Try an editable example
            </button>
          </div>
        )}
        {createError && <p className="home-error">{createError}</p>}
        {error && <div className="callout" role="alert"><p className="home-error">{error}</p><button className="small" onClick={() => { setError(null); void loadSide(); void loadMaps(); }}>Refresh workspace</button></div>}
        {notice && <p className="home-notice" role="status">{notice}</p>}
        {section === 'mine' && local.length > 0 && (
          <div className="callout">
            <span>
              {local.length} map{local.length === 1 ? ' is' : 's are'} still only in this browser.
            </span>
            <button className="small" onClick={() => void moveAllLocal()}>
              Move {local.length === 1 ? 'it' : 'them'} to My maps
            </button>
          </div>
        )}

        {section === 'local' && <LocalDrafts maps={local} onOpen={onOpenLocal} onChange={() => setLocal(listMaps())} onMove={moveLocal} />}

        {section === 'invites' && (
          <div className="stack">
          <p className="home-hint">Accept an invitation to view and edit that group's maps. Invitations appear here; no email is sent.</p>
          <button className="align-start small" onClick={() => void loadSide()}>Refresh invitations</button>
          {!invites.length && <p className="home-hint">No pending invitations. Ask a group member to invite the email shown in your Account profile.</p>}
          <ul className="invites">
            {invites.map((i) => (
              <InviteRow
                key={i.id}
                inv={i}
                onDone={async (joined) => {
                  await loadSide(joined ? `g:${joined}` : undefined);
                }}
                onError={setError}
              />
            ))}
          </ul>
          </div>
        )}

        {(section === 'mine' || groupId) &&
          (maps === null ? (error ? null : (
            <ul className="cards" aria-busy="true" aria-label="Loading maps">
              {[0, 1, 2].map((i) => (
                <li key={i} className="card skeleton" style={{ '--i': i } as CSSProperties}>
                  <div className="thumb" />
                  <span className="sk-line" />
                  <span className="sk-line short" />
                </li>
              ))}
            </ul>
          )) : maps.length === 0 ? (
            <div className="home-empty-intro">
              <h2>{section === 'mine' ? 'No maps yet' : 'No maps in this group yet'}</h2>
              <p>{section === 'mine' ? 'Choose New map to start from a blank canvas, or try an example you can change. Your work saves automatically and stays private in My maps.' : 'Create a map here, or copy one from My maps. Everyone in this group can view and edit the group copy.'}</p>
              {section === 'mine' && <p>Working with colleagues? Choose New group beside Groups to start a shared workspace.</p>}
            </div>
          ) : (
            <ul className="cards">
              {maps.map((m) => {
                const mine = m.ownerId === member.id;
                const canDelete = !groupId || mine || group?.role === 'owner';
                const edited = ago(updatedMs(m.updated));
                return (
                  <Card
                    key={m.id}
                    id={m.id}
                    index={maps.indexOf(m)}
                    doc={m.doc}
                    title={m.title}
                    meta={
                      groupId ? (
                        <>
                          {mine ? 'You' : m.ownerName} · edited {edited}
                          {m.editedByName && m.editedByName !== m.ownerName ? ` by ${m.editedByName}` : ''}
                        </>
                      ) : (
                        `edited ${edited}`
                      )
                    }
                    onOpen={() => {
                      primeCloudMap(m);
                      onOpenCloud(m.id);
                    }}
                    actions={
                      groupId
                        ? [
                            {
                              label: 'Copy to My maps',
                              icon: 'duplicate',
                              run: async () => {
                                try {
                                  await createCloudMap({ ...m.doc, title: m.title });
                                  setNotice(`Copied “${m.title}” to My maps.`);
                                } catch (e) { setNotice(null); setError(explain(e)); }
                              },
                            },
                          ]
                        : [
                            {
                              label: 'Duplicate',
                              icon: 'duplicate',
                              run: async () => {
                                await createCloudMap({ ...m.doc, title: `${m.title} copy` }).catch((e) => setError(explain(e)));
                                await loadMaps();
                              },
                            },
                            ...(groups?.length ? [{ label: 'Copy to a group', icon: 'group' as const, run: () => setCopying(m) }] : []),
                          ]
                    }
                    danger={
                      canDelete
                        ? {
                            label: 'Delete',
                            confirm: 'Delete',
                            warning: groupId ? 'Everyone in the group loses it.' : undefined,
                            run: async () => {
                              try {
                                await deleteCloudMap(m.id);
                              } catch (e) {
                                setError(explain(e));
                              }
                              await loadMaps();
                            },
                          }
                        : undefined
                    }
                  />
                );
              })}
            </ul>
          ))}
      </main>

      {newGroup && (
        <NewGroupDialog
          onClose={() => setNewGroup(false)}
          onCreated={async (id) => {
            setNewGroup(false);
            await loadSide(`g:${id}`);
            setManaging('invite');
          }}
        />
      )}
      {managing && group && (
        <GroupDialog
          group={group}
          member={member}
          initialPage={managing}
          onClose={() => setManaging(null)}
          onChanged={() => loadSide()}
          onGone={async () => {
            setManaging(null);
            await loadSide('mine');
          }}
          onNewLink={() => {
            setManaging(null);
            setLinks({ group: group.id });
          }}
        />
      )}
      {links && <InviteLinksDialog groups={groups ?? []} initialGroup={links.group} onClose={() => setLinks(null)} />}
      {copying && groups && (
        <CopyDialog
          map={copying}
          groups={groups}
          onClose={() => setCopying(null)}
          onDone={(name) => {
            setCopying(null);
            setNotice(`Copied “${copying.title}” to ${name}.`);
          }}
        />
      )}
    </div>
  );
}

function InviteRow({ inv, onDone, onError }: { inv: Invitation; onDone: (joinedGroup: string | null) => Promise<void>; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    try {
      await onDone(await fn());
    } catch (e) {
      onError(explain(e));
      setBusy(false);
    }
  };
  return (
    <li className="invite">
      <div>
        <strong>{inv.groupName}</strong>
        <span className="home-hint"> · invited by {inv.invitedByName}</span>
      </div>
      <span className="spacer" />
      <button disabled={busy} onClick={() => void run(async () => (await deleteInvitation(inv.id), null))}>
        Decline
      </button>
      <button className="primary" disabled={busy} onClick={() => void run(() => acceptInvitation(inv.id))}>
        Join group
      </button>
    </li>
  );
}

function NewGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="New group" onClose={onClose} dismissible={!busy}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          try {
            onCreated(await createGroup(name));
          } catch (err) {
            setError(explain(err));
            setBusy(false);
          }
        }}
      >
        <label className="field">
          <span>Name</span>
          <input autoFocus disabled={busy} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vatanen lab" maxLength={120} />
        </label>
        <p className="note">Everyone in the group can view and edit its maps. After creating it, invite colleagues who have a mind-the-dag account.</p>
        {error && <p className="note warn" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CopyDialog({ map, groups, onClose, onDone }: { map: CloudMap; groups: Group[]; onClose: () => void; onDone: (groupName: string) => void }) {
  const [target, setTarget] = useState(groups[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Copy to group" onClose={onClose} dismissible={!busy}>
      <div className="stack">
        <label className="field">
          <span>Group</span>
          <select disabled={busy} value={target} onChange={(e) => setTarget(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <p className="note">The group gets its own copy that every member can edit; “{map.title}” stays in My maps as it is.</p>
        {error && <p className="note warn">{error}</p>}
        <div className="actions">
          <button disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={busy || !target}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await createCloudMap({ ...map.doc, title: map.title }, target);
                onDone(groups.find((g) => g.id === target)?.name ?? 'the group');
              } catch (e) {
                setError(explain(e));
                setBusy(false);
              }
            }}
          >
            {busy ? 'Copying…' : 'Copy'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function GroupDialog({
  group,
  member,
  initialPage = 'members',
  onClose,
  onChanged,
  onGone,
  onNewLink,
}: {
  group: Group;
  member: Member;
  initialPage?: 'invite' | 'members';
  onClose: () => void;
  onChanged: () => Promise<void>;
  onGone: () => Promise<void>;
  onNewLink?: () => void;
}) {
  const owner = group.role === 'owner';
  const [page, setPage] = useState<'invite' | 'members' | 'settings'>(initialPage);
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [pending, setPending] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState<GroupMember | null>(null);
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [m, p] = await Promise.all([listMembers(group.id), listGroupInvitations(group.id)]);
      setMembers(m);
      setPending(p);
    } catch (e) {
      setLoadError(explain(e));
    }
  }, [group.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={group.name} onClose={onClose} width={520} dismissible={!busy}>
      <div className="seg" role="group" aria-label="Group management">
        {(['invite', 'members', ...(owner ? ['settings'] : [])] as const).map((value) => (
          <button
            key={value}
            className={page === value ? 'on' : ''}
            aria-pressed={page === value}
            disabled={busy}
            onClick={() => {
              setPage(value as typeof page);
              setError(null);
              setNotice(null);
              setRemoving(null);
              setConfirmDelete(false);
            }}
          >
            {value === 'invite' ? 'Invite members' : value === 'members' ? 'Members' : 'Settings'}
          </button>
        ))}
      </div>
      {error && (
        <p className="note warn" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note ok" role="status">
          {notice}
        </p>
      )}
      {page !== 'settings' && loadError && (
        <div role="alert">
          <p className="note warn">{loadError}</p>
          <button disabled={busy} onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}
      {page === 'invite' && (
        <div className="stack">
          <p className="note">Invite a colleague who already has a mind-the-dag account. They will be able to view and edit all maps in {group.name}.</p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const to = email.trim().toLowerCase();
              void run(async () => {
                await invite(group.id, to);
                setEmail('');
                setNotice(`Invitation added for ${to}. Ask them to open My maps → Group invitations and choose Join group. No email was sent.`);
                await load();
              });
            }}
          >
            <label className="field">
              <span>Account email</span>
              <input
                autoFocus
                type="email"
                required
                value={email}
                disabled={busy}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.org"
                aria-label="Email address to invite"
                aria-describedby="invite-email-hint"
              />
            </label>
            <p id="invite-email-hint" className="note">
              Use the email shown in their Account profile. Their GitHub or Google account may use a different email from their work address.
            </p>
            <button type="submit" className="primary align-start" disabled={busy || !email.trim()}>
              {busy ? 'Inviting…' : 'Invite'}
            </button>
          </form>
          <div className="workflow-result">
            <strong>What happens next?</strong>
            <p className="note">They accept under Group invitations on their start page. Invitations appear in the app; no email is sent.</p>
          </div>
          <p className="note">
            {member.admin ? (
              <>
                New to mind-the-dag?{' '}
                <button className="link inline" disabled={busy} onClick={onNewLink}>
                  Create a sign-up link for this group
                </button>
                .
              </>
            ) : (
              'New to mind-the-dag? Ask the site admin for a sign-up link first, then invite them here.'
            )}
          </p>
          {pending.length > 0 && (
            <>
              <h3>Pending invitations · {pending.length}</h3>
              <ul className="member-list">
                {pending.map((i) => (
                  <li key={i.id}>
                    <span>{i.email}</span>
                    <span className="home-hint">Awaiting acceptance</span>
                    <span className="spacer" />
                    {(owner || i.invitedById === member.id) && (
                      <button
                        className="small"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await deleteInvitation(i.id);
                            await load();
                            setNotice(`Invitation for ${i.email} withdrawn.`);
                          })
                        }
                      >
                        Withdraw
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {page === 'members' && (
        <div className="stack">
          <p className="note">All members can view and edit this group's maps and invite existing account holders.</p>
          {!members && !loadError && (
            <p className="note" role="status">
              Loading members…
            </p>
          )}
          {members && (
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.membershipId}>
                  <span>
                    {m.name}
                    {m.userId === member.id ? ' (you)' : ''}
                  </span>
                  <span className="home-hint">{m.role === 'owner' ? 'Owner' : 'Member'}</span>
                  <span className="spacer" />
                  {owner && m.userId !== member.id && (
                    <button className="small" disabled={busy} onClick={() => setRemoving(m)}>
                      Remove
                    </button>
                  )}
                  {!owner && m.userId === member.id && (
                    <button className="small danger" disabled={busy} onClick={() => setRemoving(m)}>
                      Leave group
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {removing && (
            <div className="confirm-box" role="group" aria-label="Confirm membership change">
              <strong>{removing.userId === member.id ? `Leave ${group.name}?` : `Remove ${removing.name} from ${group.name}?`}</strong>
              <p className="note">
                {removing.userId === member.id
                  ? 'You will lose access to the group maps. A member can invite you back.'
                  : 'They will lose access to the group maps. You can invite them back later.'}
              </p>
              <div className="confirm-actions">
                <button autoFocus disabled={busy} onClick={() => setRemoving(null)}>
                  Cancel
                </button>
                <button
                  className="solid-danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await removeMembership(removing.membershipId);
                      if (removing.userId === member.id) await onGone();
                      else {
                        setRemoving(null);
                        await load();
                      }
                    })
                  }
                >
                  {busy ? 'Updating…' : removing.userId === member.id ? 'Leave group' : 'Remove member'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {page === 'settings' && owner && (
        <div className="stack">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await renameGroup(group.id, name.trim());
                await onChanged();
                setNotice('Group name updated.');
              });
            }}
          >
            <label className="field">
              <span>Group name</span>
              <input value={name} disabled={busy} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </label>
            <button className="align-start" type="submit" disabled={busy || !name.trim() || name.trim() === group.name}>
              {busy ? 'Saving…' : 'Save name'}
            </button>
          </form>
          {confirmDelete ? (
            <div className="confirm-box">
              <strong>Delete {group.name}?</strong>
              <span className="note">Members lose access to this group. Its maps return to the people who made them, in My maps.</span>
              <div className="confirm-actions">
                <button disabled={busy} onClick={() => setConfirmDelete(false)}>
                  Keep group
                </button>
                <button
                  className="solid-danger"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await deleteGroup(group.id);
                      await onGone();
                    })
                  }
                >
                  {busy ? 'Deleting…' : 'Delete group'}
                </button>
              </div>
            </div>
          ) : (
            <button className="danger flush align-start" onClick={() => setConfirmDelete(true)}>
              <ITrash size={15} /> Delete group…
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

export function InviteLinksDialog({ groups, initialGroup, onClose }: { groups: Group[]; initialGroup: string | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [group, setGroup] = useState(initialGroup ?? '');
  const [uses, setUses] = useState('20');
  const [links, setLinks] = useState<SignupLink[] | null>(null);
  const [fresh, setFresh] = useState<SignupLink | null>(null);
  const receipt = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState<SignupLink | null>(null);
  const load = useCallback(() => listSignupLinks().then(setLinks, (e) => setError(explain(e))), []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (fresh) receipt.current?.focus();
  }, [fresh]);
  const full = (l: SignupLink) => l.usedByNames.length >= l.maxUses;
  const expired = (l: SignupLink) => updatedMs(l.expires) <= Date.now();
  const live = (l: SignupLink) => !full(l) && !expired(l);
  const day = (iso: string) =>
    new Date(updatedMs(iso)).toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  const status = (l: SignupLink) => `${l.usedByNames.length} of ${l.maxUses} used · ${expired(l) ? 'Expired' : full(l) ? 'Full' : `Expires ${day(l.expires)}`}`;
  return (
    <Modal title="Invite to mind-the-dag" onClose={onClose} width={560} dismissible={!busy}>
      <div className="stack">
        <p className="note">
          Give new users access to mind-the-dag. They can register with GitHub, Google or email. To invite existing users into a group, use Invite members in
          that group.
        </p>
        {fresh ? (
          <div ref={receipt} tabIndex={-1} className="workflow-result">
            <strong>Invitation link ready</strong>
            <p className="note">
              {fresh.note || 'Invitation link'} · {status(fresh)}
            </p>
            <p className="note">
              {fresh.groupName
                ? `Recipients also join ${fresh.groupName} and can edit its maps.`
                : 'Recipients create their own private workspace and can start their own group.'}
            </p>
            <CopyLinkField key={fresh.code} url={joinUrl(fresh.code)} label="Invitation link" />
            <p className="note">
              Share this link yourself. No email has been sent. Withdrawing it prevents future registrations; registered accounts keep their access.
            </p>
            <button
              className="align-start"
              disabled={busy}
              onClick={() => {
                setFresh(null);
                setError(null);
              }}
            >
              Create another link
            </button>
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError(null);
              try {
                const l = await createSignupLink(note, group || null, Number(uses));
                setFresh(l);
                setNote('');
                await load();
              } catch (err) {
                setError(explain(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Label (only you see it)</span>
              <input disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Presentation · 9 November" maxLength={120} />
            </label>
            <div className="share-row">
              <label className="field">
                <span>Number of people</span>
                <input type="number" min={1} max={20} step={1} required disabled={busy} value={uses} onChange={(e) => setUses(e.target.value)} />
              </label>
              <label className="field">
                <span>Also join group</span>
                <select disabled={busy} value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="note">
              Valid for 14 days, for up to {uses || '20'} new users (maximum 20).{' '}
              {group ? 'Recipients can edit all maps in the selected group.' : 'Recipients can create their own groups.'} No email is sent.
            </p>
            <button type="submit" className="primary align-start" disabled={busy || !Number.isInteger(Number(uses)) || Number(uses) < 1 || Number(uses) > 20}>
              {busy ? 'Creating…' : 'Create invitation link'}
            </button>
          </form>
        )}
        {error && (
          <p className="note warn" role="alert">
            {error}
          </p>
        )}
        {!links && !error && (
          <p className="note" role="status">
            Loading invitation links…
          </p>
        )}
        {!links && error && (
          <button
            onClick={() => {
              setError(null);
              void load();
            }}
          >
            Try again
          </button>
        )}
        {links && links.length > 0 && (
          <>
            <h3>Your links</h3>
            <ul className="link-list">
              {links.map((l) => (
                <li key={l.id} className={live(l) ? '' : 'dead'}>
                  <div className="link-main">
                    <div className="link-title">
                      <strong>{l.note || 'Invitation link'}</strong>
                      {l.groupName && <span className="pill">{l.groupName}</span>}
                    </div>
                    <div className="link-meta" title={l.usedByNames.length ? `Used by ${l.usedByNames.join(', ')}` : undefined}>
                      {status(l)}
                    </div>
                  </div>
                  {live(l) && (
                    <button
                      className="small"
                      disabled={busy}
                      onClick={() => {
                        setFresh(l);
                        setError(null);
                      }}
                    >
                      Get link
                    </button>
                  )}
                  <button className="small subtle" disabled={busy} onClick={() => setWithdrawing(l)}>
                    {live(l) ? 'Withdraw' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {withdrawing && (
          <div className="confirm-box" role="group" aria-label="Confirm invitation removal">
            <strong>
              {live(withdrawing) ? 'Withdraw' : 'Remove'} “{withdrawing.note || 'Invitation link'}”?
            </strong>
            <p className="note">This link will stop working for new registrations. People who already registered keep their accounts and group access.</p>
            <div className="confirm-actions">
              <button autoFocus disabled={busy} onClick={() => setWithdrawing(null)}>
                Keep link
              </button>
              <button
                className="solid-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    await deleteSignupLink(withdrawing.id);
                    if (fresh?.id === withdrawing.id) setFresh(null);
                    setWithdrawing(null);
                    await load();
                  } catch (e) {
                    setError(explain(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Removing…' : 'Remove link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
