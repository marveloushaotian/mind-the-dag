import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { metagenomeExample } from './examples';
import { MetroMap } from './render';
import { writeFileSync, mkdirSync } from 'node:fs';

describe('render', () => {
  it('renders the example map', () => {
    const svg = renderToStaticMarkup(<MetroMap doc={metagenomeExample()} exporting />);
    expect(svg).toContain('MetaPhlAn 4');
    expect((svg.match(/stroke-width="10"/g) ?? []).length).toBeGreaterThan(10);
    if (process.env.DUMP_SVG) {
      mkdirSync('tmp', { recursive: true });
      writeFileSync('tmp/example.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="500" viewBox="0 0 1160 500" style="background:#fff">${svg}</svg>`);
    }
  });
});
