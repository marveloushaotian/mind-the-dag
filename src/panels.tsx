import { IConnect, IDown, IMore, IPlus, ISection, ISelect, IStation, ITrash, IUp } from './icons';
import { changeLinePattern, changeStationKind, defaultFileBadge, pruneLines, reverseEdge, uid, usedLines, type Doc, type LabelSide, type StationKind } from './model';
import { hollowPath } from './geometry';
import { linePaint, lineStyle, paletteLines, PALETTE_IDS, tints, tokens, type LinePattern, type ThemeId } from './tokens';
import { Field, Popover, Seg, Toggle } from './ui';

type Update = (fn: (d: Doc) => void, key?: string) => void;
export type Tool = 'select' | 'station' | 'line' | 'section';

export const TOOLS: { id: Tool; label: string; key: string; Icon: () => React.ReactElement }[] = [
  { id: 'select', label: 'Select', key: 'V', Icon: () => <ISelect /> },
  { id: 'station', label: 'Station', key: 'S', Icon: () => <IStation /> },
  { id: 'line', label: 'Connect', key: 'L', Icon: () => <IConnect /> },
  { id: 'section', label: 'Section', key: 'R', Icon: () => <ISection /> },
];

export function Swatch({ doc, slot, theme, pattern, planned, size = 28 }: { doc: Doc; slot: number; theme: ThemeId; pattern?: LinePattern; planned?: boolean; size?: number }) {
  const paint = linePaint(doc.palette, slot, theme, pattern, 4);
  const stroke = { stroke: paint.color, strokeDasharray: paint.dash, strokeLinecap: paint.cap };
  return (
    <svg width={size} height="12" aria-hidden="true" className="swatch">
      {paint.pattern === 'hollow' ? (
        <path d={hollowPath([{ x: 3, y: 6 }, { x: size - 3, y: 6 }], 0, { r45: 0, r90: 0 }, 4, tokens.planned.wall * 4 / tokens.line.width)}
          fill="none" {...stroke} strokeWidth={tokens.planned.wall * 4 / tokens.line.width} />
      ) : planned ? (
        <>
          <path d={`M 3 3.5 H ${size - 3}`} {...stroke} strokeWidth={2} />
          <path d={`M 3 8.5 H ${size - 3}`} {...stroke} strokeWidth={2} />
        </>
      ) : (
        <path d={`M 3 6 H ${size - 3}`} {...stroke} strokeWidth={4} />
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ left rail
export function LeftRail({
  doc,
  update,
  tool,
  setTool,
  active,
  setActive,
  theme,
}: {
  doc: Doc;
  update: Update;
  tool: Tool;
  setTool: (t: Tool) => void;
  active: string | null;
  setActive: (id: string) => void;
  theme: ThemeId;
}) {
  const slots = paletteLines(doc.palette);
  const move = (i: number, by: number) =>
    update((d) => {
      const j = i + by;
      if (j < 0 || j >= d.lines.length) return;
      [d.lines[i], d.lines[j]] = [d.lines[j], d.lines[i]];
    });
  const addLine = () => {
    const id = uid('l');
    update((d) => {
      const taken = new Set(d.lines.map((x) => x.slot));
      const slot = paletteLines(d.palette).findIndex((_, k) => !taken.has(k));
      d.lines.push({ id, name: `Line ${d.lines.length + 1}`, slot: slot < 0 ? d.lines.length : slot });
    });
    setActive(id);
  };

  const removeLine = (id: string) =>
    update((d) => {
      d.lines = d.lines.filter((x) => x.id !== id);
      for (const e of d.edges) e.lines = e.lines.filter((x) => x !== id);
      d.edges = d.edges.filter((e) => e.lines.length);
    });
  const used = usedLines(doc);

  return (
    <>
      <nav className="tools" aria-label="Tools">
        {TOOLS.map(({ id, label, key, Icon }) => (
          <button key={id} className={`tool${tool === id ? ' on' : ''}`} onClick={() => setTool(id)} title={`${label} (${key})`} aria-pressed={tool === id}>
            <Icon />
            <span>{label}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
      </nav>

      <div className="rail-head">
        <h3>Lines</h3>
        <button className="icon" onClick={addLine} title="Add line" aria-label="Add line">
          <IPlus size={16} />
        </button>
      </div>
      <ul className="lines">
        {doc.lines.map((l, i) => (
          <li key={l.id} className={`${active === l.id ? 'active' : ''}${used.has(l.id) ? '' : ' unused'}`}>
            <button className="line-choice" onClick={() => setActive(l.id)} aria-pressed={active === l.id}
              aria-label={`Use ${l.name || 'Untitled line'}`} title={`Use ${l.name || 'Untitled line'}`}>
              <Swatch doc={doc} slot={l.slot} theme={theme} pattern={l.pattern} planned={l.planned} />
              <span className="line-name">{l.name || 'Untitled line'}</span>
              <span className="line-selected" aria-hidden="true">{active === l.id ? '✓' : ''}</span>
            </button>
            <Popover label={`Edit ${l.name || 'Untitled line'}`} trigger={<IMore />}>
              <Field label="Line name">
                <input value={l.name} onChange={(e) => update((d) => void (d.lines[i].name = e.target.value), `line-name-${l.id}`)} />
              </Field>
              <Field label="Colour" group>
                <div className="slots">
                {slots.map((s, k) => (
                  <button key={k} className={`slot${l.slot === k ? ' on' : ''}`} title={s.name} aria-label={s.name} onClick={() => update((d) => void (d.lines[i].slot = k))}>
                    <Swatch doc={doc} slot={k} theme={theme} size={22} />
                  </button>
                ))}
                </div>
              </Field>
              <Seg
                label="Pattern"
                value={l.planned ? 'hollow' : linePaint(doc.palette, l.slot, theme, l.pattern).pattern}
                onChange={(v) => update((d) => changeLinePattern(d.lines[i], v))}
                options={[
                  ['solid', <span className="pattern-choice"><Swatch doc={doc} slot={l.slot} theme={theme} pattern="solid" size={44} /><span>Solid</span></span>],
                  ['dashed', <span className="pattern-choice"><Swatch doc={doc} slot={l.slot} theme={theme} pattern="dashed" size={44} /><span>Dashed</span></span>],
                  ['dotted', <span className="pattern-choice"><Swatch doc={doc} slot={l.slot} theme={theme} pattern="dotted" size={44} /><span>Dotted</span></span>],
                  ['hollow', <span className="pattern-choice"><Swatch doc={doc} slot={l.slot} theme={theme} pattern="hollow" size={44} /><span>Hollow</span></span>],
                ]}
              />
              <div className="line-order">
                <button onClick={() => move(i, -1)} disabled={i === 0}><IUp size={14} /> Move up</button>
                <button onClick={() => move(i, 1)} disabled={i === doc.lines.length - 1}><IDown size={14} /> Move down</button>
              </div>
              <button className="danger" disabled={doc.lines.length === 1} onClick={() => removeLine(l.id)}>
                <ITrash size={16} /> Delete line
              </button>
            </Popover>
          </li>
        ))}
      </ul>
    </>
  );
}

// ------------------------------------------------------------------ inspector
const KINDS: [StationKind, string, React.ReactElement][] = [
  ['step', 'Step', <circle cx={12} cy={12} r={5.5} fill="#fff" stroke="currentColor" strokeWidth={2.2} />],
  ['merge', 'Merge', <rect x={6} y={6} width={12} height={12} rx={3} fill="currentColor" />],
  ['start', 'Start', <path d="M6 6.5 H9.5 L15.5 12 L9.5 17.5 H6 Z" fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />],
  ['stop', 'Stop', <rect x={10.5} y={5} width={3.5} height={14} rx={1.2} fill="currentColor" />],
];

function KindPicker({ value, onChange, label = 'Type' }: { value: StationKind; onChange: (k: StationKind) => void; label?: string }) {
  return (
    <>
    {value === 'junction' && <p className="inspector-note">Routing point. Choose a station type below to replace it.</p>}
    <div className="kinds" role="radiogroup" aria-label={label}>
      {KINDS.map(([k, label, glyph]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => { if (value !== k) onChange(k); }} role="radio" aria-checked={value === k} title={label}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            {glyph}
          </svg>
          <span>{label}</span>
        </button>
      ))}
    </div>
    </>
  );
}
const SIDES: LabelSide[] = ['auto', 'above', 'below', 'left', 'right'];

export function Inspector({
  doc,
  update,
  selected,
  theme,
  setTheme,
  onDelete,
  placement,
}: {
  doc: Doc;
  update: Update;
  selected: ReadonlySet<string>;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  onDelete: () => void;
  placement?: { kind: StationKind; setKind: (kind: StationKind) => void };
}) {
  const items = [...selected].filter((key) => {
    if (key.startsWith('station:')) return doc.stations.some((s) => s.id === key.slice(8));
    if (key.startsWith('edge:')) return doc.edges.some((e) => e.id === key.slice(5));
    if (key.startsWith('section:')) return doc.sections.some((s) => s.id === key.slice(8));
    return false;
  });

  if (placement) return (
    <div className="stack placement-inspector">
      <h3>Place station</h3>
      <Field label="Type" group>
        <KindPicker value={placement.kind} onChange={placement.setKind} />
      </Field>
      <p className="inspector-note">Click the canvas to place. Select an existing station to edit it here.</p>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="stack">
        <h3>Map</h3>
        <Field label="Palette" group>
          <div className="palettes">
            {PALETTE_IDS.map((p) => (
              <button key={p} className={`palette${doc.palette === p ? ' on' : ''}`} onClick={() => update((d) => void (d.palette = p))}>
                <span className="chips">
                  {[0, 1, 2, 3].map((k) => (
                    <i key={k} style={{ background: lineStyle(p, k, theme).color }} />
                  ))}
                </span>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Theme" group>
          <Seg
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]}
          />
        </Field>
        <Toggle label="Legend" checked={doc.legend.show} onChange={(v) => update((d) => void (d.legend.show = v))} />
        {doc.legend.show && (
          <Field label="Legend columns" group>
            <Seg
              label="Legend columns"
              value={String(doc.legend.cols ?? 1)}
              onChange={(v) => update((d) => void (d.legend.cols = Number(v)))}
              options={[
                ['1', '1'],
                ['2', '2'],
                ['3', '3'],
                ['4', '4'],
              ]}
            />
          </Field>
        )}
        <Toggle label="Title block" checked={doc.showTitle} onChange={(v) => update((d) => void (d.showTitle = v))} />
        {doc.showTitle && (
          <Field label="Version line">
            <input value={doc.meta} onChange={(e) => update((d) => void (d.meta = e.target.value), 'meta')} />
          </Field>
        )}
      </div>
    );
  }

  if (items.length > 1)
    return (
      <div className="stack">
        <h3>{items.length} selected</h3>
        <button className="danger" onClick={onDelete}>
          <ITrash size={16} /> Delete
        </button>
      </div>
    );

  const [kind, id] = items[0].split(':');

  if (kind === 'station') {
    const i = doc.stations.findIndex((s) => s.id === id);
    const s = doc.stations[i];
    if (!s) return null;
    const set = (fn: (st: typeof s) => void, key?: string) => update((d) => fn(d.stations[i]), key && `${key}-${s.id}`);
    return (
      <div className="stack">
        <h3>Station</h3>
        <Field label="Name">
          <textarea
            aria-label="Station name"
            rows={Math.min(5, s.label.split('\n').length)}
            value={s.label}
            onChange={(e) => set((st) => void (st.label = e.target.value), 'label')}
            title="Shift+Enter starts a detail line (for example, the tools in a group)"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
        </Field>
        <Field label="Type" group>
          <KindPicker value={s.kind} onChange={(k) => set((st) => changeStationKind(st, k))} />
        </Field>
        <Field label="Direction" group>
          <Seg
            label="Direction"
            value={s.axis}
            onChange={(v) => set((st) => { st.axis = v; delete st.laneSign; })}
            options={[
              ['h', 'Horizontal'],
              ['v', 'Vertical'],
            ]}
          />
        </Field>
        {s.label && (
          <Field label="Label position">
            <select value={s.labelSide} onChange={(e) => set((st) => void (st.labelSide = e.target.value as LabelSide))}>
              {SIDES.map((x) => (
                <option key={x} value={x}>
                  {x[0].toUpperCase() + x.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Toggle label="Optional" checked={!!s.optional} onChange={(v) => set((st) => void (st.optional = v))} />
        <Toggle label="Inactive" checked={!!s.inactive} onChange={(v) => set((st) => void (st.inactive = v))} />
        {s.kind !== 'junction' && (
          <>
            <Toggle label="File icon" checked={!!s.file} onChange={(v) => set((st) => void (st.file = v ? defaultFileBadge() : undefined))} />
            {s.file && (
              <>
                <div className="row">
                  <Field label="Format">
                    <input value={s.file.ext} onChange={(e) => set((st) => void (st.file!.ext = e.target.value.toLowerCase()), 'ext')} />
                  </Field>
                  <Field label="Files" group>
                    <Seg
                      label="Files"
                      value={String(s.file.count) as '1' | '2' | '3'}
                      onChange={(v) => set((st) => void (st.file!.count = Number(v) as 1 | 2 | 3))}
                      options={[
                        ['1', '1'],
                        ['2', '2'],
                        ['3', '3+'],
                      ]}
                    />
                  </Field>
                </div>
                <Field label="Caption">
                  <input value={s.file.caption ?? ''} onChange={(e) => set((st) => void (st.file!.caption = e.target.value || undefined), 'caption')} />
                </Field>
              </>
            )}
          </>
        )}
        <button className="danger" onClick={onDelete}>
          <ITrash size={16} /> Delete
        </button>
      </div>
    );
  }

  if (kind === 'edge') {
    const i = doc.edges.findIndex((e) => e.id === id);
    const e = doc.edges[i];
    if (!e) return null;
    const name = (sid: string) => doc.stations.find((s) => s.id === sid)?.label || '·';
    return (
      <div className="stack">
        <h3>
          {name(e.from)} → {name(e.to)}
        </h3>
        <Field label="Lines" group>
          <div className="checklist">
            {doc.lines.map((l) => (
              <label key={l.id} className="check">
                <input
                  type="checkbox"
                  checked={e.lines.includes(l.id)}
                  onChange={(ev) =>
                    update((d) => {
                      const before = usedLines(d);
                      const ed = d.edges[i];
                      if (ev.target.checked) ed.lines.push(l.id);
                      else if (ed.lines.length > 1) ed.lines = ed.lines.filter((x) => x !== l.id);
                      pruneLines(d, before);
                    })
                  }
                />
                <Swatch doc={doc} slot={l.slot} theme={theme} pattern={l.pattern} planned={l.planned} size={20} />
                {l.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Bend">
          <input type="range" min={0} max={1} step={0.05} value={e.bend} onChange={(ev) => update((d) => void (d.edges[i].bend = Number(ev.target.value)), `bend-${e.id}`)} />
        </Field>
        <button
          onClick={() =>
            update((d) => {
              reverseEdge(d.edges[i]);
            })
          }
        >
          Reverse
        </button>
        <button className="danger" onClick={onDelete}>
          <ITrash size={16} /> Delete
        </button>
      </div>
    );
  }

  if (kind === 'section') {
    const i = doc.sections.findIndex((s) => s.id === id);
    const s = doc.sections[i];
    if (!s) return null;
    const tl = tints(doc.palette, theme);
    const swap = (j: number) =>
      update((d) => {
        [d.sections[j], d.sections[i]] = [d.sections[i], d.sections[j]];
      });
    return (
      <div className="stack">
        <h3>Section {i + 1}</h3>
        <Field label="Name">
          <input value={s.name} onChange={(e) => update((d) => void (d.sections[i].name = e.target.value), `section-name-${s.id}`)} />
        </Field>
        <Field label="Tint" group>
          <div className="tints">
            {tl.map((c, k) => (
              <button key={k} className={s.tint === k ? 'on' : ''} style={{ background: c }} onClick={() => update((d) => void (d.sections[i].tint = k))} aria-label={`Tint ${k + 1}`} />
            ))}
          </div>
        </Field>
        <Field label="Order" group>
          <div className="row">
            <button className="icon" disabled={i === 0} onClick={() => swap(i - 1)} aria-label="Earlier">
              <IUp size={16} />
            </button>
            <button className="icon" disabled={i === doc.sections.length - 1} onClick={() => swap(i + 1)} aria-label="Later">
              <IDown size={16} />
            </button>
          </div>
        </Field>
        <button className="danger" onClick={onDelete}>
          <ITrash size={16} /> Delete
        </button>
      </div>
    );
  }
  return null;
}
