import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { emptyDoc } from './model';
import { Inspector, LeftRail } from './panels';

const noop = () => undefined;
const doc = emptyDoc();
doc.lines.push({ id: 'second', name: 'Second line', slot: 1 });
doc.stations.push({ id: 'station', x: 0, y: 0, kind: 'step', axis: 'h', label: '', labelSide: 'auto' });

describe('editor control ownership', () => {
  it('returns to map properties when undo removes the inspected station', () => {
    const markup = renderToStaticMarkup(<Inspector doc={doc} update={noop} selected={new Set(['station:removed'])}
      theme="light" setTheme={noop} onDelete={noop} />);
    expect(markup).toContain('<h3>Map</h3>');
    expect(markup).not.toContain('Station name');
  });

  it.each([true, false])('offers exactly one station type picker when placing=%s', (placing) => {
    const markup = renderToStaticMarkup(<>
      <LeftRail doc={doc} update={noop} tool={placing ? 'station' : 'select'} setTool={noop} active="l1" setActive={noop} theme="light" />
      <Inspector doc={doc} update={noop} selected={new Set(placing ? [] : ['station:station'])}
        theme="light" setTheme={noop} onDelete={noop} placement={placing ? { kind: 'step', setKind: noop } : undefined} />
    </>);
    expect((markup.match(/role="radiogroup" aria-label="Type"/g) ?? [])).toHaveLength(1);
    expect(markup).not.toContain('title="Branch"');
    expect(markup).toContain('title="Start"');
    expect(markup).toContain('title="Stop"');
    expect(markup).toContain(placing ? 'Place station' : '<h3>Station</h3>');
  });

  it('explains an existing routing point without offering Branch as a new type', () => {
    const legacy = { ...doc, stations: [{ ...doc.stations[0], kind: 'junction' as const }] };
    const markup = renderToStaticMarkup(<Inspector doc={legacy} update={noop} selected={new Set(['station:station'])}
      theme="light" setTheme={noop} onDelete={noop} />);
    expect(markup).toContain('Routing point.');
    expect(markup).not.toContain('title="Branch"');
    expect(legacy.stations[0].kind).toBe('junction');
  });

  it('separates the large line selection button from its edit button', () => {
    const markup = renderToStaticMarkup(<LeftRail doc={doc} update={noop} tool="line" setTool={noop}
      active="second" setActive={noop} theme="light" />);
    expect(markup).toContain('aria-label="Use Second line"');
    expect(markup).toContain('aria-label="Edit Second line"');
    expect(markup).toMatch(/class="line-choice" aria-pressed="true" aria-label="Use Second line"/);
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('aria-label="Line style"');
  });
});
