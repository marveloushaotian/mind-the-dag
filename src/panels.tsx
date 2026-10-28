import { IConnect, IDown, IPlus, ISection, ISelect, ITrash, IUp } from './icons';
import { uid, type Doc, type LabelSide, type StationKind } from './model';
import { lineStyle, paletteLines, PALETTE_IDS, tints, type ThemeId } from './tokens';
import { Field, Popover, Seg, Toggle } from './ui';

type Update = (fn: (d: Doc) => void, key?: string) => void;
export type Tool = 'select' | 'line' | 'section';

export const TOOLS: { id: Tool; label: string; key: string; Icon: () => React.ReactElement }[] = [
  { id: 'select', label: 'Select', key: 'V', Icon: () => <ISelect /> },
  { id: 'line', label: 'Line', key: 'L', Icon: () => <IConnect /> },
  { id: 'section', label: 'Section', key: 'R', Icon: () => <ISection /> },
];

function Swatch({ doc, slot, theme, pattern, planned, size = 28 }: { doc: Doc; slot: number; theme: ThemeId; pattern?: 'dashed' | 'dotted'; planned?: boolean; size?: number }) {
  const base = lineStyle(doc.palette, slot, theme);
  const p = pattern ?? base.pattern;
  const dash = p === 'dashed' ? '6 4' : p === 'dotted' ? '1 5' : undefined;
  return (
    <svg width={size} height="12" aria-hidden="true" className="swatch">
      {planned ? (
        <>
          <path d={`M 1 3.5 H ${size - 1}`} stroke={base.color} strokeWidth={2} />
          <path d={`M 1 8.5 H ${size - 1}`} stroke={base.color} strokeWidth={2} />
        </>
      ) : (
        <path d={`M 1 6 H ${size - 1}`} stroke={base.color} strokeWidth={6} strokeDasharray={dash} strokeLinecap={p === 'dotted' ? 'round' : 'butt'} />
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
          <li key={l.id} className={active === l.id ? 'active' : ''} onPointerDown={() => setActive(l.id)}>
            <Popover label="Line style" trigger={<Swatch doc={doc} slot={l.slot} theme={theme} pattern={l.pattern} planned={l.planned} />}>
              <div className="slots">
                {slots.map((s, k) => (
                  <button key={k} className={`slot${l.slot === k ? ' on' : ''}`} title={s.name} aria-label={s.name} onClick={() => update((d) => void (d.lines[i].slot = k))}>
                    <Swatch doc={doc} slot={k} theme={theme} size={22} />
                  </button>
                ))}
              </div>
              <Seg
                label="Pattern"
                value={l.pattern ?? 'solid'}
                onChange={(v) => update((d) => void (d.lines[i].pattern = v === 'solid' ? undefined : (v as 'dashed' | 'dotted')))}
                options={[
                  ['solid', 'Solid'],
                  ['dashed', 'Dashed'],
                  ['dotted', 'Dotted'],
                ]}
              />
              <Toggle label="Planned" checked={!!l.planned} onChange={(v) => update((d) => void (d.lines[i].planned = v))} />
              <button
                className="danger"
                disabled={doc.lines.length === 1}
                onClick={() =>
                  update((d) => {
                    d.lines.splice(i, 1);
                    for (const e of d.edges) e.lines = e.lines.filter((x) => x !== l.id);
                    d.edges = d.edges.filter((e) => e.lines.length);
                  })
                }
              >
                <ITrash size={16} /> Delete line
              </button>
            </Popover>
            <input className="bare-input" value={l.name} onChange={(e) => update((d) => void (d.lines[i].name = e.target.value), `line-name-${l.id}`)} aria-label="Line name" />
            <span className="reorder">
              <button className="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                <IUp size={14} />
              </button>
              <button className="icon" onClick={() => move(i, 1)} disabled={i === doc.lines.length - 1} aria-label="Move down" title="Move down">
                <IDown size={14} />
              </button>
            </span>
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
  ['junction', 'Branch', <path d="M3 12 H12 M12 12 L20 6 M12 12 L20 18" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />],
  ['start', 'Start', <path d="M6 6.5 H9.5 L15.5 12 L9.5 17.5 H6 Z" fill="currentColor" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />],
  ['stop', 'Stop', <rect x={10.5} y={5} width={3.5} height={14} rx={1.2} fill="currentColor" />],
];

function KindPicker({ value, onChange }: { value: StationKind; onChange: (k: StationKind) => void }) {
  return (
    <div className="kinds" role="radiogroup" aria-label="Type">
      {KINDS.map(([k, label, glyph]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)} role="radio" aria-checked={value === k} title={label}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            {glyph}
          </svg>
          <span>{label}</span>
        </button>
      ))}
    </div>
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
}: {
  doc: Doc;
  update: Update;
  selected: ReadonlySet<string>;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  onDelete: () => void;
}) {
  const items = [...selected].filter((k) => !k.startsWith('legend') && !k.startsWith('title'));

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
          <KindPicker value={s.kind} onChange={(k) => set((st) => void (st.kind = k))} />
        </Field>
        <Field label="Direction" group>
          <Seg
            label="Direction"
            value={s.axis}
            onChange={(v) => set((st) => void (st.axis = v))}
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
            <Toggle label="File icon" checked={!!s.file} onChange={(v) => set((st) => void (st.file = v ? { ext: 'fastq', count: 1 } : undefined))} />
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
                      const ed = d.edges[i];
                      if (ev.target.checked) ed.lines.push(l.id);
                      else if (ed.lines.length > 1) ed.lines = ed.lines.filter((x) => x !== l.id);
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
              const ed = d.edges[i];
              [ed.from, ed.to] = [ed.to, ed.from];
              ed.bend = 1 - ed.bend;
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
