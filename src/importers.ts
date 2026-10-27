import type { Doc } from './model';
import { parseMmd } from './mmd';

function validate(d: unknown): Doc {
  const x = d as Doc;
  if (!x || x.version !== 1 || !Array.isArray(x.stations) || !Array.isArray(x.edges) || !Array.isArray(x.lines)) {
    throw new Error('not a mind-the-dag map (version 1)');
  }
  return x;
}

export async function importFile(f: File): Promise<Doc> {
  const text = await f.text();
  if (/\.mmd$/i.test(f.name) || /^\s*(%%metro|graph\s|flowchart\s)/m.test(text)) {
    return parseMmd(text);
  }
  return validate(JSON.parse(text));
}
