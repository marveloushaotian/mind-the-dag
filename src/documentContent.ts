import type { Doc } from './model';

/** Compare persisted content, independent of object identity and JSON key order. */
export function documentContent(doc: Doc): string {
  return JSON.stringify(doc, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}
export const sameDocument = (a: Doc, b: Doc) => a === b || documentContent(a) === documentContent(b);
