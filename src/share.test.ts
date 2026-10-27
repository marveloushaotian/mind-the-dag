import { describe, expect, it } from 'vitest';
import { metagenomeExample } from './examples';
import { decodeDoc, encodeDoc } from './share';

describe('share links', () => {
  it('round-trips a map through the URL code', async () => {
    const d = metagenomeExample();
    const code = await encodeDoc(d);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(JSON.stringify(d).length);
    expect(await decodeDoc(code)).toEqual(d);
  });
});
