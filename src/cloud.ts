/**
 * Cloud workspace on the lab's server (PocketBase on CSC Rahti, see server/):
 * every member's own maps ("My maps"), groups they belong to, and invitations.
 * Signed out (or without a configured server) the app keeps maps in this browser only.
 */
import PocketBase, { ClientResponseError, LocalAuthStore, type RecordModel } from 'pocketbase';
import { useEffect, useState } from 'react';
import type { Doc } from './model';

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
}
const toMember = (r: RecordModel | null | undefined): Member | null =>
  r && r.collectionName === 'users' ? { id: r.id, name: (r.name as string) || (r.email as string) || 'Member', email: (r.email as string) || '' } : null;

export const currentMember = (): Member | null => (pb?.authStore.isValid ? toMember(pb.authStore.record) : null);

/** The signed-in member, re-rendering on sign-in and sign-out (also from other tabs). */
export function useMember(): Member | null {
  const [m, setM] = useState(currentMember);
  useEffect(() => {
    if (!pb) return;
    // LocalAuthStore also follows sign-in / sign-out in other tabs.
    return pb.authStore.onChange(() => setM(currentMember()));
  }, []);
  return m;
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

export async function signInWith(provider: Provider): Promise<void> {
  try {
    await client().collection('users').authWithOAuth2({ provider });
  } catch (e) {
    if (e instanceof ClientResponseError && e.status === 400)
      throw new Error(
        `No account or invitation matches the email of this ${PROVIDER_LABEL[provider]} account. Ask someone in your group to invite that email address.`,
      );
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
const nameOf = (r: unknown) => ((r as RecordModel | undefined)?.name as string) || null;
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

export async function getCloudMap(id: string): Promise<CloudMap> {
  return toMap(await client().collection('maps').getOne(id, { expand: 'owner,editedBy,group' }));
}

export async function createCloudMap(doc: Doc, groupId: string | null = null): Promise<CloudMap> {
  const m = me();
  const r = await client()
    .collection('maps')
    .create({ title: doc.title || 'Untitled', doc, owner: m.id, editedBy: m.id, group: groupId ?? '' }, { expand: 'owner,editedBy,group' });
  return toMap(r);
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
    name: nameOf(m.expand?.user) ?? 'Member',
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
