/**
 * Share links carry the whole map in the URL fragment (deflate + base64url),
 * so nothing is uploaded anywhere: whoever has the link can view the map and
 * make their own copy. Fragments are never sent to the server.
 */
import type { Doc } from './model';

const toB64Url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
};

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeDoc(doc: Doc): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  return toB64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeDoc(code: string): Promise<Doc> {
  const json = await pipe(fromB64Url(code), new DecompressionStream('deflate-raw'));
  const d = JSON.parse(new TextDecoder().decode(json)) as Doc;
  if (!d || d.version !== 1 || !Array.isArray(d.stations)) throw new Error('not a mind-the-dag map');
  return d;
}

export async function shareUrl(doc: Doc): Promise<string> {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/view/${await encodeDoc(doc)}`;
}
