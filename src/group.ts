/**
 * Group library: maps shared with the group on the lab's server (PocketBase on
 * CSC Rahti). Members sign in with an account the admin created; every member
 * can read every shared map, and only its owner can update or remove it.
 * Without a configured server (or signed out) the app works exactly as before.
 */
import { useEffect, useState } from 'react';
import type { Doc } from './model';

export const LIBRARY_URL = ((import.meta.env.VITE_LIBRARY_URL as string | undefined) ?? '').replace(/\/+$/, '');
export const groupEnabled = LIBRARY_URL !== '';

const AUTH_KEY = 'mind-the-dag:auth';
const LINKS_KEY = 'mind-the-dag:group-links';
const EVENT = 'mind-the-dag:auth';

export interface Member {
  id: string;
  name: string;
  email: string;
}
interface Auth {
  token: string;
  user: Member;
}
export interface GroupMap {
  id: string;
  title: string;
  doc: Doc;
  owner: { id: string; name: string };
  updated: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

let auth: Auth | null = readJson<Auth>(AUTH_KEY);
const setAuth = (a: Auth | null) => {
  auth = a;
  writeJson(AUTH_KEY, a);
  window.dispatchEvent(new Event(EVENT));
};

export const currentMember = (): Member | null => auth?.user ?? null;

/** The signed-in member, re-rendering on sign-in and sign-out. */
export function useMember(): Member | null {
  const [m, setM] = useState(currentMember);
  useEffect(() => {
    const on = () => setM(currentMember());
    window.addEventListener(EVENT, on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return m;
}

class GroupError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth.token;
  let res: Response;
  try {
    res = await fetch(`${LIBRARY_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  } catch {
    throw new GroupError(0, "Can't reach the group library. Check your connection and try again.");
  }
  if (res.status === 401) setAuth(null);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) msg = body.message;
    } catch {
      /* not JSON */
    }
    throw new GroupError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

interface UserRecord {
  id: string;
  name?: string;
  email?: string;
}
const toMember = (u: UserRecord, fallbackEmail = ''): Member => ({ id: u.id, name: u.name || u.email || fallbackEmail, email: u.email || fallbackEmail });

export async function signIn(email: string, password: string): Promise<Member> {
  const r = await api<{ token: string; record: UserRecord }>('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: email.trim(), password }),
  }).catch((e: GroupError) => {
    throw e.status === 400 ? new GroupError(400, 'Wrong email or password.') : e;
  });
  const user = toMember(r.record, email.trim());
  setAuth({ token: r.token, user });
  return user;
}

export function signOut(): void {
  setAuth(null);
}

/** Renew the session token (called on start); signs out silently if it has expired. */
export async function refreshSession(): Promise<void> {
  if (!groupEnabled || !auth) return;
  try {
    const r = await api<{ token: string; record: UserRecord }>('/api/collections/users/auth-refresh', { method: 'POST' });
    setAuth({ token: r.token, user: toMember(r.record, auth?.user.email) });
  } catch {
    /* offline: keep the old token until it is rejected */
  }
}

interface MapRecord {
  id: string;
  title: string;
  doc: Doc;
  owner: string;
  updated: string;
  expand?: { owner?: UserRecord };
}
const toGroupMap = (r: MapRecord): GroupMap => ({
  id: r.id,
  title: r.title,
  doc: r.doc,
  owner: { id: r.owner, name: r.expand?.owner?.name || r.expand?.owner?.email || 'Unknown' },
  updated: Date.parse(r.updated.replace(' ', 'T')) || Date.now(),
});

export async function listGroupMaps(): Promise<GroupMap[]> {
  const out: GroupMap[] = [];
  for (let page = 1; page < 50; page++) {
    const r = await api<{ items: MapRecord[]; totalPages: number }>(`/api/collections/maps/records?sort=-updated&expand=owner&perPage=200&page=${page}`);
    out.push(...r.items.map(toGroupMap));
    if (page >= r.totalPages) break;
  }
  return out;
}

export async function getGroupMap(id: string): Promise<GroupMap> {
  return toGroupMap(await api<MapRecord>(`/api/collections/maps/records/${encodeURIComponent(id)}?expand=owner`));
}

/** Share a draft with the group, or update the copy it was shared as before. Returns the group id. */
export async function publishMap(doc: Doc, groupId?: string | null): Promise<string> {
  if (!auth) throw new GroupError(401, 'Sign in to share with your group.');
  const body = { title: doc.title || 'Untitled', doc };
  if (groupId) {
    try {
      const r = await api<MapRecord>(`/api/collections/maps/records/${encodeURIComponent(groupId)}`, { method: 'PATCH', body: JSON.stringify(body) });
      return r.id;
    } catch (e) {
      // Removed from the group (or never ours): share it as a new map instead.
      if ((e as GroupError).status !== 404) throw e;
    }
  }
  const r = await api<MapRecord>('/api/collections/maps/records', { method: 'POST', body: JSON.stringify({ ...body, owner: auth.user.id }) });
  return r.id;
}

export async function removeGroupMap(id: string): Promise<void> {
  await api<void>(`/api/collections/maps/records/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- draft ↔ group links
/** Which group map a local draft was shared as, so sharing again updates it. */
export function groupLink(draftId: string): string | null {
  return readJson<Record<string, string>>(LINKS_KEY)?.[draftId] ?? null;
}
export function setGroupLink(draftId: string, groupId: string | null): void {
  const links = readJson<Record<string, string>>(LINKS_KEY) ?? {};
  if (groupId) links[draftId] = groupId;
  else delete links[draftId];
  writeJson(LINKS_KEY, links);
}
