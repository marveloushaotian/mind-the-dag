import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { metagenomeExample } from './examples';
import { IFile, IPlus } from './icons';
import { Wordmark } from './ui';
import { importFile } from './importers';
import { backupAll, deleteMap, duplicateMap, isBackup, listMaps, loadMap, requestPersistence, restoreBackup, type MapEntry } from './library';
import { download } from './exporters';
import { emptyDoc, type Doc } from './model';
import { docBounds, MetroMap } from './render';
import { Modal, SignInCard, SignInDialog } from './dialogs';
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
  signOut,
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
  actions: { label: string; run: () => void | Promise<void> }[];
  danger?: { label: string; confirm: string; run: () => void | Promise<void> };
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
      <div className="card-actions">
        {confirm && danger ? (
          <>
            <button className="danger" disabled={busy} onClick={() => void act(danger.run)}>
              {danger.confirm}
            </button>
            <button onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <>
            {actions.map((a) => (
              <button key={a.label} disabled={busy} onClick={() => void act(a.run)}>
                {a.label}
              </button>
            ))}
            {danger && (
              <button className="danger" onClick={() => setConfirm(true)}>
                {danger.label}
              </button>
            )}
          </>
        )}
      </div>
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
    <div className="account">
      <span className="account-name" title={member.email}>
        {member.name}
      </span>
      <button className="small" onClick={signOut}>
        Sign out
      </button>
    </div>
  ) : (
    <>
      <button className="small" onClick={() => setSigningIn(true)}>
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
        <Wordmark size={17} />
        <span className="spacer" />
        {member && <Account member={member} />}
      </header>
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
          <span>Try it without an account</span>
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
          Example map
        </button>
      </div>
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
                ? [{ label: 'Move to My maps', run: () => onMove(m.id) }]
                : [
                    {
                      label: 'Duplicate',
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
  const setSection = (s: Section) => {
    transition(() => {
      setSectionState(s);
      setMaps(listCache.get(s) ?? null);
    });
    try {
      localStorage.setItem(SECTION_KEY, s);
    } catch {
      /* ignore */
    }
  };
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
  const [managing, setManaging] = useState(false);
  const [copying, setCopying] = useState<CloudMap | null>(null);
  const [links, setLinks] = useState<{ group: string | null } | null>(null);

  const groupId = section.startsWith('g:') ? section.slice(2) : null;
  const group = groups?.find((g) => g.id === groupId) ?? null;

  const loadSide = useCallback(async () => {
    try {
      const [g, i] = await Promise.all([listMyGroups(), listMyInvitations()]);
      setGroups(g);
      setInvites(i);
    } catch (e) {
      setError(explain(e));
      setGroups([]);
    }
    setLocal(listMaps());
  }, []);
  const loadMaps = useCallback(async () => {
    if (section === 'local' || section === 'invites') return;
    try {
      await whenSynced();
      const fresh = section === 'mine' ? await listMyMaps() : await listGroupMaps(section.slice(2));
      listCache.set(section, fresh);
      setMaps(fresh);
    } catch (e) {
      setError(explain(e));
      setMaps([]);
    }
  }, [section]);
  useEffect(() => {
    void loadSide();
  }, [loadSide]);
  useEffect(() => {
    setError(null);
    void loadMaps();
  }, [loadMaps]);
  // A remembered group you have since left: fall back to My maps.
  useEffect(() => {
    if (groups && groupId && !group) setSection('mine');
    if (section === 'invites' && groups && !invites.length) setSection('mine');
    if (section === 'local' && !local.length) setSection('mine');
  }, [groups, groupId, group, section, invites.length, local.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveLocal = async (id: string) => {
    const d = loadMap(id);
    if (!d) return;
    try {
      await createCloudMap(d);
      deleteMap(id);
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
        await createCloudMap(d);
        deleteMap(m.id);
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

  const title = section === 'mine' ? 'My maps' : section === 'local' ? 'On this browser' : section === 'invites' ? 'Invitations' : (group?.name ?? '');
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
          <button className="icon small" onClick={() => setNewGroup(true)} aria-label="New group" title="New group">
            <IPlus size={14} />
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
        {invites.length > 0 && (
          <button className={`side-item${section === 'invites' ? ' on' : ''}`} onClick={() => setSection('invites')}>
            Invitations <span className="count">{invites.length}</span>
          </button>
        )}
        {local.length > 0 && (
          <button className={`side-item muted${section === 'local' ? ' on' : ''}`} onClick={() => setSection('local')}>
            On this browser <span className="count">{local.length}</span>
          </button>
        )}
        {member.admin && (
          <>
            <span className="spacer" />
            <button className="side-item side-invite" onClick={() => setLinks({ group: null })}>
              <IPlus size={14} /> Invite people
            </button>
          </>
        )}
      </nav>

      <main className="home-main">
        <div className="home-title-row">
          <h1 className="home-title">{title}</h1>
          {hint && <span className="home-hint">{hint}</span>}
          <span className="spacer" />
          {group && <button onClick={() => setManaging(true)}>Members{group.role === 'owner' ? ' & settings' : ''}</button>}
        </div>

        {(section === 'mine' || groupId) && (
          <div className="home-actions">
            <button className="primary big" onClick={() => onCreate(emptyDoc(), groupId)}>
              <IPlus /> New map
            </button>
            <OpenFileButton
              onDoc={(d) => onCreate(d, groupId)}
              onBackup={(n, name) => {
                setLocal(listMaps());
                setNotice(`Restored ${n} draft${n === 1 ? '' : 's'} from ${name} to this browser (see On this browser).`);
              }}
            />
            <button className="link" onClick={() => onCreate(metagenomeExample(), groupId)}>
              Example map
            </button>
          </div>
        )}
        {createError && <p className="home-error">{createError}</p>}
        {error && <p className="home-error">{error}</p>}
        {notice && <p className="home-notice">{notice}</p>}
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
          <ul className="invites">
            {invites.map((i) => (
              <InviteRow
                key={i.id}
                inv={i}
                onDone={async (joined) => {
                  await loadSide();
                  if (joined) setSection(`g:${joined}`);
                }}
                onError={setError}
              />
            ))}
          </ul>
        )}

        {(section === 'mine' || groupId) &&
          (maps === null ? (
            <ul className="cards" aria-busy="true" aria-label="Loading maps">
              {[0, 1, 2].map((i) => (
                <li key={i} className="card skeleton" style={{ '--i': i } as CSSProperties}>
                  <div className="thumb" />
                  <span className="sk-line" />
                  <span className="sk-line short" />
                </li>
              ))}
            </ul>
          ) : maps.length === 0 ? (
            <p className="home-hint pad">
              {section === 'mine' ? 'No maps yet. Start a new one above.' : 'No maps in this group yet. Make one here, or copy one in from My maps.'}
            </p>
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
                              run: async () => {
                                await createCloudMap({ ...m.doc, title: m.title }).catch((e) => setError(explain(e)));
                                setNotice(`Copied “${m.title}” to My maps.`);
                              },
                            },
                          ]
                        : [
                            {
                              label: 'Duplicate',
                              run: async () => {
                                await createCloudMap({ ...m.doc, title: `${m.title} copy` }).catch((e) => setError(explain(e)));
                                await loadMaps();
                              },
                            },
                            ...(groups?.length ? [{ label: 'Copy to group', run: () => setCopying(m) }] : []),
                          ]
                    }
                    danger={
                      canDelete
                        ? {
                            label: 'Delete',
                            confirm: groupId ? 'Delete for everyone' : 'Delete',
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
            await loadSide();
            setSection(`g:${id}`);
            setManaging(true);
          }}
        />
      )}
      {managing && group && (
        <GroupDialog
          group={group}
          member={member}
          onClose={() => setManaging(false)}
          onChanged={loadSide}
          onGone={async () => {
            setManaging(false);
            await loadSide();
            setSection('mine');
          }}
          onNewLink={() => {
            setManaging(false);
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
    <Modal title="New group" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
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
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vatanen lab" maxLength={120} />
        </label>
        <p className="note">You can invite people right after.</p>
        {error && <p className="note warn">{error}</p>}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim()}>
            Create group
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
    <Modal title="Copy to group" onClose={onClose}>
      <div className="stack">
        <label className="field">
          <span>Group</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
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
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={busy || !target}
            onClick={async () => {
              setBusy(true);
              try {
                await createCloudMap({ ...map.doc, title: map.title }, target);
                onDone(groups.find((g) => g.id === target)?.name ?? 'the group');
              } catch (e) {
                setError(explain(e));
                setBusy(false);
              }
            }}
          >
            Copy
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GroupDialog({
  group,
  member,
  onClose,
  onChanged,
  onGone,
  onNewLink,
}: {
  group: Group;
  member: Member;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onGone: () => Promise<void>;
  onNewLink?: () => void;
}) {
  const owner = group.role === 'owner';
  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [pending, setPending] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([listMembers(group.id), listGroupInvitations(group.id)]);
      setMembers(m);
      setPending(p);
    } catch (e) {
      setError(explain(e));
    }
  }, [group.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(explain(e));
    }
  };

  return (
    <Modal title={group.name} onClose={onClose} width={480}>
      <div className="stack">
        <h3>Members</h3>
        <ul className="member-list">
          {members?.map((m) => (
            <li key={m.membershipId}>
              <span>
                {m.name}
                {m.userId === member.id ? ' (you)' : ''}
              </span>
              <span className="home-hint">{m.role === 'owner' ? 'Owner' : 'Member'}</span>
              <span className="spacer" />
              {owner && m.userId !== member.id && (
                <button className="small" onClick={() => void run(async () => (await removeMembership(m.membershipId), await load()))}>
                  Remove
                </button>
              )}
              {!owner && m.userId === member.id && (
                <button className="small danger" onClick={() => void run(async () => (await removeMembership(m.membershipId), await onGone()))}>
                  Leave group
                </button>
              )}
            </li>
          ))}
        </ul>

        <h3>Invite someone with an account</h3>
        <form
          className="share-row"
          onSubmit={(e) => {
            e.preventDefault();
            const to = email.trim();
            void run(async () => {
              await invite(group.id, to);
              setEmail('');
              setNotice(`Invited ${to.toLowerCase()}. They'll find the invitation on their start page (no email is sent).`);
              await load();
            });
          }}
        >
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.org" aria-label="Email address to invite" />
          <button type="submit" className="primary" disabled={!email.includes('@')}>
            Invite
          </button>
        </form>
        {notice && <p className="note ok">{notice}</p>}
        <p className="note">
          {member.admin ? (
            <>
              Someone new?{' '}
              <button className="link inline" onClick={() => onNewLink?.()}>
                Create an invitation link for this group
              </button>
              .
            </>
          ) : (
            'Someone new needs an invitation link from the admin first.'
          )}
        </p>
        {pending.length > 0 && (
          <ul className="member-list">
            {pending.map((i) => (
              <li key={i.id}>
                <span>{i.email}</span>
                <span className="home-hint">invited by {i.invitedByName}</span>
                <span className="spacer" />
                {(owner || i.invitedById === member.id) && (
                  <button className="small" onClick={() => void run(async () => (await deleteInvitation(i.id), await load()))}>
                    Withdraw
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {owner && (
          <>
            <h3>Group</h3>
            <form
              className="share-row"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await renameGroup(group.id, name);
                  await onChanged();
                  setNotice('Renamed.');
                });
              }}
            >
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Group name" maxLength={120} />
              <button type="submit" disabled={!name.trim() || name.trim() === group.name}>
                Rename
              </button>
            </form>
            {confirmDelete ? (
              <div className="share-row">
                <span className="note warn grow">Delete the group? Its maps go back to their authors' My maps.</span>
                <button onClick={() => setConfirmDelete(false)}>Keep</button>
                <button className="danger" onClick={() => void run(async () => (await deleteGroup(group.id), await onGone()))}>
                  Delete group
                </button>
              </div>
            ) : (
              <button className="danger align-start" onClick={() => setConfirmDelete(true)}>
                Delete group…
              </button>
            )}
          </>
        )}
        {error && <p className="note warn">{error}</p>}
      </div>
    </Modal>
  );
}

/** Admin only: invitation links for new people, optionally straight into one of your groups. */
function InviteLinksDialog({ groups, initialGroup, onClose }: { groups: Group[]; initialGroup: string | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [group, setGroup] = useState(initialGroup ?? '');
  const [uses, setUses] = useState(20);
  const [links, setLinks] = useState<SignupLink[] | null>(null);
  const [fresh, setFresh] = useState<SignupLink | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => listSignupLinks().then(setLinks, (e) => setError(explain(e))), []);
  useEffect(() => void load(), [load]);
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(joinUrl(code));
      setCopied(code);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked: the field stays selectable */
    }
  };
  const full = (l: SignupLink) => l.usedByNames.length >= l.maxUses;
  const expired = (l: SignupLink) => updatedMs(l.expires) < Date.now();
  const live = (l: SignupLink) => !full(l) && !expired(l);
  const status = (l: SignupLink) => {
    const who = l.usedByNames.length ? `used by ${l.usedByNames.join(', ')}` : 'not used yet';
    const count = l.maxUses > 1 ? ` (${l.usedByNames.length} of ${l.maxUses})` : '';
    const until = expired(l) ? 'expired' : full(l) ? 'all places used' : `until ${new Date(updatedMs(l.expires)).toLocaleDateString()}`;
    return `${who}${count} · ${until}`;
  };
  return (
    <Modal title="Invite people" onClose={onClose} width={520}>
      <div className="stack">
        <p className="note">People sign up through the link with GitHub or with email and password. A link works for 14 days and can be withdrawn at any time. No email is sent: share it however you like.</p>
        <form
          className="stack tight"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const l = await createSignupLink(note, group || null, uses);
              setFresh(l);
              setNote('');
              await load();
              void copy(l.code);
            } catch (err) {
              setError(explain(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            <span>Label (only you see it)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Lab meeting" maxLength={120} />
          </label>
          <div className="share-row">
            <label className="field">
              <span>Who can use it</span>
              <select value={uses} onChange={(e) => setUses(Number(e.target.value))}>
                <option value={20}>Up to 20 people</option>
                <option value={1}>One person</option>
              </select>
            </label>
            <label className="field">
              <span>Also join group</span>
              <select value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="primary align-start" disabled={busy}>
            {busy ? 'Creating…' : 'Create invitation link'}
          </button>
        </form>
        {fresh && (
          <div className="share-row">
            <input readOnly value={joinUrl(fresh.code)} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
            <button className="primary" onClick={() => void copy(fresh.code)}>
              {copied === fresh.code ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
        {error && <p className="note warn">{error}</p>}
        {links && links.length > 0 && (
          <>
            <h3>Your links</h3>
            <ul className="member-list">
              {links.map((l) => (
                <li key={l.id}>
                  <span>{l.note || 'Invitation'}</span>
                  <span className="home-hint">
                    {l.groupName ? `${l.groupName} · ` : ''}
                    {status(l)}
                  </span>
                  <span className="spacer" />
                  {live(l) && (
                    <button className="small" onClick={() => void copy(l.code)}>
                      {copied === l.code ? 'Copied' : 'Copy link'}
                    </button>
                  )}
                  <button className="small" onClick={async () => (await deleteSignupLink(l.id).catch((e) => setError(explain(e))), await load())}>
                    {live(l) ? 'Withdraw' : 'Remove'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Modal>
  );
}
