import type { ReactNode } from 'react';
import type { Doc, Line, Station, StationKind } from './model';
import { Swatch, TOOLS, type Tool } from './panels';
import type { ThemeId } from './tokens';

/** Compact controls own the same actions as the desktop rails, without hiding them behind a keyboard. */
export function CompactTools({ doc, tool, active, theme, stationKind, setTool, setStationKind, onLines, onProperties, propertiesOpen, saveState }: {
  doc: Doc; tool: Tool; active: Line | null; theme: ThemeId; stationKind: StationKind;
  setTool: (tool: Tool) => void; setStationKind: (kind: StationKind) => void;
  onLines: () => void; onProperties: () => void; propertiesOpen: boolean; saveState: ReactNode;
}) {
  return <div className="compact-tools">
    <nav className="compact-tool-choices" aria-label="Drawing tools">
      {TOOLS.map(({ id, label, Icon }) => <button key={id} className={tool === id ? 'on' : ''} aria-pressed={tool === id} onClick={() => setTool(id)}>
        <Icon /><span>{label}</span>
      </button>)}
    </nav>
    <div className="compact-tool-details">
      <button className="compact-lines" onClick={onLines} aria-label="Lines and colours">
        {active && <Swatch doc={doc} slot={active.slot} theme={theme} pattern={active.pattern} planned={active.planned} colour={active.colour} size={24} />}
        <span>Lines{active ? ` · ${active.name || 'Untitled'}` : ''}</span>
      </button>
      <button onClick={onProperties} aria-label="Open properties">Properties</button>
    </div>
    <div className="compact-tool-footer">
      {tool === 'station' && !propertiesOpen && <label className="compact-kind"><span>New station</span>
        <select aria-label="New station type" value={stationKind} onChange={(e) => setStationKind(e.target.value as StationKind)}>
          <option value="step">Step</option><option value="merge">Merge</option><option value="start">Start</option><option value="stop">Stop</option>
        </select>
      </label>}
      <span className="touch-hint">Two fingers to move &amp; zoom</span>
      <span className="compact-save">{saveState}</span>
    </div>
  </div>;
}

/** Contextual next actions are derived from the drawing; no tour state is saved in the map. */
export function DrawingGuidance({ doc, tool, selected, source, target, active, compact, onTool, onExample }: {
  doc: Doc; tool: Tool; selected: ReadonlySet<string>; source: Station | null;
  target: 'none' | 'connect' | 'already'; active: Line | null; compact: boolean;
  onTool: (tool: Tool) => void; onExample: () => void;
}) {
  const count = doc.stations.length;
  const choose = compact ? 'Tap' : 'Click';
  if (!count && !doc.sections.length && tool === 'select') return <section className="editor-start" aria-label="Start drawing">
    <strong>Draw your first workflow</strong>
    <p>Add stations for your steps, then connect them with a line.</p>
    <div className="editor-start-actions"><button className="primary" onClick={() => onTool('station')}>Add stations</button><button onClick={onExample}>Use an example</button></div>
    <span>Changes save automatically as you work.</span>
  </section>;

  let message: string;
  let next: { label: string; tool: Tool } | null = null;
  if (tool === 'station') {
    message = !count ? `${choose} the canvas to add your first station.`
      : count === 1 ? 'Add another station, then connect your steps.'
      : !doc.edges.length ? 'Your stations are ready. Connect them to show the workflow.' : `${choose} the canvas to add a station.`;
    next = count >= 2 && !doc.edges.length ? { label: 'Connect stations', tool: 'line' } : { label: 'Done', tool: 'select' };
  } else if (tool === 'line') {
    if (count < 2) { message = 'Add at least two stations to connect your steps.'; next = { label: 'Add stations', tool: 'station' }; }
    else if (!active) { message = 'Add a line in Lines, then connect your stations.'; next = { label: 'Done', tool: 'select' }; }
    else {
      message = source
        ? target === 'connect' ? `${choose} to connect on ${active.name || 'this line'}.`
          : target === 'already' ? 'Already connected. Choose another station, or finish.'
          : `${choose} the next station to connect from ${source.label || 'the selected station'}.`
        : `${choose} the first station, then the next one to connect them.`;
      next = { label: 'Done', tool: 'select' };
    }
  } else if (tool === 'section') {
    message = 'Drag around steps to add a section. Select the section to name it or change its fill.';
    next = { label: 'Done', tool: 'select' };
  } else if (selected.size) {
    message = compact ? 'Open Properties to name or change your selection.' : 'Edit the name and appearance in the properties panel.';
  } else if (count === 1) {
    message = 'Add another station to continue your workflow.'; next = { label: 'Add stations', tool: 'station' };
  } else if (count >= 2 && !doc.edges.length) {
    message = 'Connect your stations to show the order of your steps.'; next = { label: 'Connect stations', tool: 'line' };
  } else if (doc.stations.some((station) => !station.label.trim())) {
    message = compact ? 'Select a station, then open Properties to give it a name.' : 'Select a station to give it a name in the properties panel.';
  } else {
    message = compact ? 'Drag blank canvas to pan. Pinch with two fingers to zoom.' : 'Select a station, connection or section to edit its properties.';
  }
  return <div className="drawing-guidance" aria-label="Drawing guidance">
    <span role="status">{message}</span>
    {next && <button className="small" onClick={() => onTool(next.tool)}>{next.label}</button>}
  </div>;
}
