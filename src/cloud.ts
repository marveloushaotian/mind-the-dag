/**
 * Cloud workspace on the lab's server (PocketBase on CSC Rahti, see server/):
 * every member's own maps ("My maps"), groups they belong to, and invitations.
 * Signed out (or without a configured server) the app keeps maps in this browser only.
 */
import PocketBase, { ClientResponseError, LocalAuthStore, type RecordModel } from 'pocketbase';
import { useSyncExternalStore } from 'react';
import { transition } from './motion';
import { uniqueTitle, type Doc } from './model';

export const LIBRARY_URL = ((import.meta.env.VITE_LIBRARY_URL as string | undefined) ?? '').replace(/\/+$/, '');
export const cloudEnabled = LIBRARY_URL !== '';

export const pb: PocketBase | null = cloudEnabled ? new PocketBase(LIBRARY_URL, new LocalAuthStore('mind-the-dag:pb-auth')) : null;
pb?.autoCancellation(false);

const client = (): PocketBase => {
  if (!pb) throw new Error('The cloud workspace is not configured.');
  return pb;
};

// ---------------------------------------------------------------- session
export interface Member {
  id: string;
  name: string;
  email: string;
  /** A fallback label is not a completed profile. */
  needsName: boolean;
  /** The site admin: the only one who can create invitation links for new people. */
  admin: boolean;
}
const toMember = (r: RecordModel | null | undefined): Member | null =>
  r && r.collectionName === 'users'
    ? { id: r.id, name: (r.name as string)?.trim() || (r.email as string) || 'Member', email: (r.email as string) || '',
        needsName: !((r.name as string)?.trim()), admin: !!r.admin }
    : null;

export const currentMember = (): Member | null => (pb?.authStore.isValid ? toMember(pb.authStore.record) : null);

// One snapshot for the whole app, so signing in or out changes every view in a single transition.
let memberSnapshot: Member | null = currentMember();
const memberListeners = new Set<() => void>();
pb?.authStore.onChange(() => {
  const next = currentMember();
  if (next?.id === memberSnapshot?.id && next?.name === memberSnapshot?.name && next?.email === memberSnapshot?.email && next?.needsName === memberSnapshot?.needsName && next?.admin === memberSnapshot?.admin) return;
  transition(() => {
    memberSnapshot = next;
    memberListeners.forEach((l) => l());
  });
});
const subscribeMember = (l: () => void) => {
  memberListeners.add(l);
  return () => void memberListeners.delete(l);
};

/** The signed-in member, re-rendering on sign-in and sign-out (also from other tabs). */
export function useMember(): Member | null {
  return useSyncExternalStore(subscribeMember, () => memberSnapshot);
}

export const DISPLAY_NAME_MAX = 120;

/** Update only the signed-in person's display name; email and roles stay separate. */
export async function updateProfile(name: string): Promise<void> {
  const nameValue = name.trim();
  if (!nameValue) throw new Error('Enter a display name.');
  if (nameValue.length > DISPLAY_NAME_MAX) throw new Error(`Use ${DISPLAY_NAME_MAX} characters or fewer.`);
  const who = me();
  const c = client();
  try {
    const record = await c.collection('users').update(who.id, { name: nameValue });
    if (c.authStore.isValid && c.authStore.record?.id === who.id) c.authStore.save(c.authStore.token, record);
  } catch (e) {
    throw new Error(explain(e, 'Could not save your profile. Please try again.'));
  }
}

/** Turn server errors into sentences people can act on. */
export function explain(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return "Can't reach the server. Check your connection and try again.";
    if (e.status === 401) return 'Your session has expired. Please sign in again.';
    if (e.status === 403) return (e.response?.message as string) || "You don't have permission to do that.";
    if (e.status === 404) return 'It no longer exists, or you no longer have access to it.';
    if (e.status === 429) return 'Too many attempts. Wait a few seconds and try again.';
    const fields = e.response?.data as Record<string, { message?: string }> | undefined;
    const first = fields && Object.values(fields)[0]?.message;
    return first || (e.response?.message as string) || fallback;
  }
  return (e as Error)?.message || fallback;
}

export async function signIn(email: string, password: string): Promise<void> {
  try {
    await client().collection('users').authWithPassword(email.trim(), password);
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 400) throw new Error('Wrong email or password.');
    throw new Error(explain(e));
  }
}

export type Provider = 'github' | 'google';
export const PROVIDER_LABEL: Record<Provider, string> = { github: 'GitHub', google: 'Google' };

/** OAuth providers the admin has switched on (GitHub, Google). */
export async function signInProviders(): Promise<Provider[]> {
  if (!pb) return [];
  try {
    const m = await pb.collection('users').listAuthMethods();
    return m.oauth2.enabled ? m.oauth2.providers.map((p) => p.name).filter((n): n is Provider => n === 'github' || n === 'google') : [];
  } catch {
    return [];
  }
}

/** "GitHub", "GitHub or Google", … for instructions shown to people. */
export const providerNames = (p: Provider[]) => p.map((x) => PROVIDER_LABEL[x]).join(' or ') || 'GitHub';

export async function signInWith(provider: Provider): Promise<void> {
  try {
    await client().collection('users').authWithOAuth2({ provider });
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 400)
      throw new Error(`No account is linked to this ${PROVIDER_LABEL[provider]} account yet. New people join through an invitation link from the admin.`);
    if (e instanceof ClientResponseError && e.isAbort) throw new Error('Sign-in was cancelled.');
    throw new Error(explain(e));
  }
}

export function signOut(): void {
  pb?.authStore.clear();
}

/** Renew the session on start; an expired session signs out quietly. */
export async function refreshSession(): Promise<void> {
  if (!pb?.authStore.isValid) {
    pb?.authStore.clear();
    return;
  }
  try {
    await pb.collection('users').authRefresh();
  } catch (e) {
    if (e instanceof ClientResponseError && (e.status === 401 || e.status === 403 || e.status === 404)) pb.authStore.clear();
  }
}

// ---------------------------------------------------------------- maps
export interface CloudMap {
  id: string;
  title: string;
  doc: Doc;
  ownerId: string;
  ownerName: string;
  groupId: string | null;
  groupName: string | null;
  updated: string;
  editedByName: string | null;
}
const nameOf = (r: unknown) => ((r as RecordModel | undefined)?.name as string)?.trim() || null;
const toMap = (r: RecordModel): CloudMap => ({
  id: r.id,
  title: (r.title as string) || 'Untitled',
  doc: r.doc as Doc,
  ownerId: r.owner as string,
  ownerName: nameOf(r.expand?.owner) ?? 'Former member',
  groupId: (r.group as string) || null,
  groupName: nameOf(r.expand?.group),
  updated: r.updated as string,
  editedByName: nameOf(r.expand?.editedBy),
});
export const updatedMs = (s: string) => Date.parse(s.replace(' ', 'T')) || 0;

const me = () => {
  const m = currentMember();
  if (!m) throw new Error('Please sign in first.');
  return m;
};

export async function listMyMaps(): Promise<CloudMap[]> {
  const items = await client()
    .collection('maps')
    .getFullList({ filter: client().filter('group = "" && owner = {:me}', { me: me().id }), sort: '-updated', expand: 'owner' });
  return items.map(toMap);
}

export async function listGroupMaps(groupId: string): Promise<CloudMap[]> {
  const items = await client()
    .collection('maps')
    .getFullList({ filter: client().filter('group = {:g}', { g: groupId }), sort: '-updated', expand: 'owner,editedBy,group' });
  return items.map(toMap);
}

/** Maps listed on the start page, so opening one shows it at once (then refreshes). */
const primed = new Map<string, CloudMap>();
export const primeCloudMap = (m: CloudMap) => void primed.set(m.id, m);
export const primedCloudMap = (id: string) => primed.get(id) ?? null;

export async function getCloudMap(id: string): Promise<CloudMap> {
  return toMap(await client().collection('maps').getOne(id, { expand: 'owner,editedBy,group' }));
}

/** New map in My maps or a group. A title already used there gets a number ("Untitled pipeline 2"). */
export async function createCloudMap(doc: Doc, groupId: string | null = null): Promise<CloudMap> {
  const m = me();
  const there = await client()
    .collection('maps')
    .getFullList({ fields: 'title', filter: groupId ? client().filter('group = {:g}', { g: groupId }) : client().filter('group = "" && owner = {:me}', { me: m.id }) })
    .catch(() => []);
  const title = uniqueTitle(doc.title, there.map((r) => String(r.title ?? '')));
  const r = await client()
    .collection('maps')
    .create({ title, doc: { ...doc, title }, owner: m.id, editedBy: m.id, group: groupId ?? '' }, { expand: 'owner,editedBy,group' });
  return toMap(r);
}

/** `title`, or the next free numbered version of it if another map in the same place has it. */
export async function freeTitle(mapId: string, groupId: string | null, title: string): Promise<string> {
  const m = me();
  const place = groupId ? client().filter('group = {:g}', { g: groupId }) : client().filter('group = "" && owner = {:me}', { me: m.id });
  const there = await client()
    .collection('maps')
    .getFullList({ fields: 'title', filter: `${place} && id != ${client().filter('{:id}', { id: mapId })}` });
  return uniqueTitle(title, there.map((r) => String(r.title ?? '')));
}

export type SaveResult = { ok: true; updated: string } | { ok: false; theirs: CloudMap };

/**
 * Save unless someone else saved since `base` (the version this editor last loaded or saved).
 * On a conflict nothing is written and their version is returned.
 */
export async function saveCloudMap(id: string, doc: Doc, base: string): Promise<SaveResult> {
  const now = await client().collection('maps').getOne(id, { fields: 'id,updated' });
  if (now.updated !== base) return { ok: false, theirs: await getCloudMap(id) };
  const r = await client()
    .collection('maps')
    .update(id, { title: doc.title || 'Untitled', doc, editedBy: me().id }, { fields: 'id,updated' });
  return { ok: true, updated: r.updated as string };
}

export async function deleteCloudMap(id: string): Promise<void> {
  await client().collection('maps').delete(id);
}

// ---------------------------------------------------------------- groups
export interface Group {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'member';
  membershipId: string;
}
export interface GroupMember {
  membershipId: string;
  userId: string;
  name: string;
  role: 'owner' | 'member';
}
export interface Invitation {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
  invitedById: string;
  invitedByName: string;
}

export async function listMyGroups(): Promise<Group[]> {
  const items = await client()
    .collection('memberships')
    .getFullList({ filter: client().filter('user = {:me}', { me: me().id }), expand: 'group' });
  return items
    .filter((m) => m.expand?.group)
    .map((m) => {
      const g = m.expand!.group as RecordModel;
      return { id: g.id, name: g.name as string, ownerId: g.owner as string, role: m.role as Group['role'], membershipId: m.id };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createGroup(name: string): Promise<string> {
  const r = await client().collection('groups').create({ name: name.trim(), owner: me().id });
  return r.id;
}
export async function renameGroup(id: string, name: string): Promise<void> {
  await client().collection('groups').update(id, { name: name.trim() });
}
export async function deleteGroup(id: string): Promise<void> {
  await client().collection('groups').delete(id);
}

export async function listMembers(groupId: string): Promise<GroupMember[]> {
  const items = await client()
    .collection('memberships')
    .getFullList({ filter: client().filter('group = {:g}', { g: groupId }), expand: 'user', sort: 'created' });
  return items.map((m) => ({
    membershipId: m.id,
    userId: m.user as string,
    name: nameOf(m.expand?.user) ?? 'Name not set',
    role: m.role as GroupMember['role'],
  }));
}
/** Leave a group (own membership) or, as its owner, remove someone. */
export async function removeMembership(membershipId: string): Promise<void> {
  await client().collection('memberships').delete(membershipId);
}

export async function invite(groupId: string, email: string): Promise<void> {
  await client().collection('invitations').create({ group: groupId, email: email.trim().toLowerCase(), invitedBy: me().id });
}
const toInvitation = (r: RecordModel): Invitation => ({
  id: r.id,
  groupId: r.group as string,
  groupName: nameOf(r.expand?.group) ?? 'A group',
  email: r.email as string,
  invitedById: r.invitedBy as string,
  invitedByName: nameOf(r.expand?.invitedBy) ?? 'Someone',
});
export async function listGroupInvitations(groupId: string): Promise<Invitation[]> {
  const items = await client()
    .collection('invitations')
    .getFullList({ filter: client().filter('group = {:g}', { g: groupId }), expand: 'group,invitedBy', sort: 'created' });
  return items.map(toInvitation);
}
export async function listMyInvitations(): Promise<Invitation[]> {
  const items = await client()
    .collection('invitations')
    .getFullList({ filter: client().filter('email = {:e}', { e: me().email.toLowerCase() }), expand: 'group,invitedBy', sort: 'created' });
  return items.map(toInvitation);
}
export async function acceptInvitation(id: string): Promise<string> {
  const r = await client().send<{ group: string }>(`/api/mtd/invitations/${encodeURIComponent(id)}/accept`, { method: 'POST' });
  return r.group;
}
/** Decline (invitee) or withdraw (inviter / group owner). */
export async function deleteInvitation(id: string): Promise<void> {
  await client().collection('invitations').delete(id);
}

// ---------------------------------------------------------------- invitation links (new people)
export interface SignupLink {
  id: string;
  code: string;
  note: string;
  groupId: string | null;
  groupName: string | null;
  expires: string;
  maxUses: number;
  usedByNames: string[];
}
export interface SignupInfo {
  valid: boolean;
  reason: '' | 'used' | 'expired' | 'unknown';
  inviter: string;
  group: string;
  /** The link was made by whoever is signed in; then also how many places are used. */
  mine?: boolean;
  uses?: number;
  maxUses?: number;
}
const toLink = (r: RecordModel): SignupLink => ({
  id: r.id,
  code: r.code as string,
  note: (r.note as string) || '',
  groupId: (r.group as string) || null,
  groupName: nameOf(r.expand?.group),
  expires: r.expires as string,
  maxUses: Math.max(1, (r.maxUses as number) || 1),
  usedByNames: ((r.expand?.usedBy as RecordModel[] | undefined) ?? []).map((u) => (u.name as string) || 'someone'),
});
export const joinUrl = (code: string) => `${window.location.origin}${window.location.pathname}#/join/${code}`;

export async function createSignupLink(note: string, groupId: string | null, maxUses: number): Promise<SignupLink> {
  const r = await client()
    .collection('signups')
    .create({ note: note.trim(), group: groupId ?? '', maxUses, createdBy: me().id }, { expand: 'group,usedBy' });
  return toLink(r);
}
export async function listSignupLinks(): Promise<SignupLink[]> {
  const items = await client().collection('signups').getFullList({ sort: '-created', expand: 'group,usedBy' });
  return items.map(toLink);
}
export async function deleteSignupLink(id: string): Promise<void> {
  await client().collection('signups').delete(id);
}
export async function signupInfo(code: string): Promise<SignupInfo> {
  return client().send<SignupInfo>(`/api/mtd/signups/${encodeURIComponent(code)}`, { method: 'GET' });
}
/** An existing member uses a link: joins its group (if any). Returns the group id or ''. */
export async function acceptSignupLink(code: string): Promise<string> {
  const r = await client().send<{ group: string }>(`/api/mtd/signups/${encodeURIComponent(code)}/accept`, { method: 'POST' });
  return r.group;
}
export async function signUpWithPassword(code: string, name: string, email: string, password: string): Promise<void> {
  try {
    await client()
      .collection('users')
      .create({ name: name.trim(), email: email.trim(), password, passwordConfirm: password, inviteCode: code });
  } catch (e) {
    throw new Error(explain(e, 'Could not create the account.'));
  }
  await signIn(email, password);
}
/** Sign up (or, with an existing account, sign in and join) through GitHub. */
export async function signUpWith(provider: Provider, code: string): Promise<void> {
  let isNew = false;
  try {
    const r = await client().collection('users').authWithOAuth2({ provider, createData: { inviteCode: code } });
    isNew = !!(r.meta as { isNew?: boolean } | undefined)?.isNew;
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 400) throw new Error('This invitation link is no longer valid. Ask the admin for a new one.');
    if (e instanceof ClientResponseError && e.isAbort) throw new Error('Sign-in was cancelled.');
    throw new Error(explain(e));
  }
  if (!isNew) await acceptSignupLink(code).catch(() => undefined);
}
