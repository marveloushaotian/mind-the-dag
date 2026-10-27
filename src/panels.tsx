import type { ReactNode } from 'react';
import { uid, type Doc, type LabelSide, type StationKind } from './model';
import { lineStyle, paletteLines, PALETTE_IDS, tints, type ThemeId } from './tokens';

type Update = (fn: (d: Doc) => void, key?: string) => void;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);

function Swatch({ doc, slot, theme, pattern }: { doc: Doc; slot: number; theme: ThemeId; pattern?: 'dashed' | 'dotted' }) {
  const base = lineStyle(doc.palette, slot, theme);
  const st = pattern ? { ...base, pattern } : base;
  const dash = st.pattern === 'dashed' ? '6 4' : st.pattern === 'dotted' ? '1 5' : undefined;
  return (
    <svg width="28" height="12" aria-hidden="true">
      <path d="M 1 6 H 27" stroke={st.color} strokeWidth={6} strokeDasharray={dash} strokeLinecap={st.pattern === 'dotted' ? 'round' : 'butt'} />
    </svg>
  );
}

export function LinesPanel({
  doc,
  update,
  active,
  setActive,
  theme,
  setTheme,
}: {
  doc: Doc;
  update: Update;
  active: string | null;
  setActive: (id: string) => void;
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}) {
  const slots = paletteLines(doc.palette);
  const used = new Map<string, number>();
  for (const e of doc.edges) for (const l of e.lines) used.set(l, (used.get(l) ?? 0) + 1);

  const move = (i: number, by: number) =>
    update((d) => {
      const j = i + by;
      if (j < 0 || j >= d.lines.length) return;
      [d.lines[i], d.lines[j]] = [d.lines[j], d.lines[i]];
    });

  return (
    <div className="stack">
      <h3>Map</h3>
      <Field label="Title">
        <input value={doc.title} onChange={(e) => update((d) => void (d.title = e.target.value), 'title')} />
      </Field>
      <Field label="Version line">
        <input value={doc.meta} onChange={(e) => update((d) => void (d.meta = e.target.value), 'meta')} />
      </Field>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={doc.showTitle} onChange={(e) => update((d) => void (d.showTitle = e.target.checked))} /> Title block
        </label>
        <label className="check">
          <input type="checkbox" checked={doc.legend.show} onChange={(e) => update((d) => void (d.legend.show = e.target.checked))} /> Legend
        </label>
      </div>
      <Field label="Palette">
        <select value={doc.palette} onChange={(e) => update((d) => void (d.palette = e.target.value as Doc['palette']))}>
          {PALETTE_IDS.map((p) => (
            <option key={p} value={p}>
              {p[0].toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </Field>
      <div className="seg" role="radiogroup" aria-label="Preview theme">
        {(['light', 'dark'] as ThemeId[]).map((t) => (
          <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)} role="radio" aria-checked={theme === t}>
            {t === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>

      <h3>Lines</h3>
      <p className="note">Order = bundle order, top to bottom. The active line is used by Connect.</p>
      <ul className="lines">
        {doc.lines.map((l, i) => (
          <li key={l.id} className={active === l.id ? 'active' : ''}>
            <input type="radio" name="active-line" checked={active === l.id} onChange={() => setActive(l.id)} title="Active line" />
            <Swatch doc={doc} slot={l.slot} theme={theme} pattern={l.pattern} />
            <div className="grow">
              <input value={l.name} onChange={(e) => update((d) => void (d.lines[i].name = e.target.value), `line-name-${l.id}`)} aria-label="Line name" />
              <div className="row small">
                <select value={l.slot} onChange={(e) => update((d) => void (d.lines[i].slot = Number(e.target.value)))} aria-label="Colour">
                  {slots.map((s, k) => (
                    <option key={k} value={k}>
                      {k + 1} · {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={l.pattern ?? ''}
                  onChange={(e) => update((d) => void (d.lines[i].pattern = (e.target.value || undefined) as 'dashed' | 'dotted' | undefined))}
                  aria-label="Pattern"
                  title="Pattern"
                >
                  <option value="">solid</option>
                  <option value="dashed">dashed</option>
                  <option value="dotted">dotted</option>
                </select>
              </div>
              <div className="row small">
                <label className="check" title="Planned: drawn as a cased line">
                  <input type="checkbox" checked={!!l.planned} onChange={(e) => update((d) => void (d.lines[i].planned = e.target.checked))} /> planned
                </label>
              </div>
            </div>
            <div className="icons">
              <button onClick={() => move(i, -1)} disabled={i === 0} title="Move up">
                ↑
              </button>
              <button onClick={() => move(i, 1)} disabled={i === doc.lines.length - 1} title="Move down">
                ↓
              </button>
              <button
                onClick={() =>
                  update((d) => {
                    d.lines.splice(i, 1);
                    for (const e of d.edges) e.lines = e.lines.filter((x) => x !== l.id);
                    d.edges = d.edges.filter((e) => e.lines.length);
                  })
                }
                disabled={doc.lines.length === 1}
                title={used.get(l.id) ? `Delete (removes it from ${used.get(l.id)} connection(s))` : 'Delete'}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        className="wide"
        onClick={() => {
          const id = uid('l');
          update((d) => {
            const taken = new Set(d.lines.map((x) => x.slot));
            const slot = paletteLines(d.palette).findIndex((_, k) => !taken.has(k));
            d.lines.push({ id, name: `Line ${d.lines.length + 1}`, slot: slot < 0 ? d.lines.length : slot });
          });
          setActive(id);
        }}
      >
        + Add line
      </button>
    </div>
  );
}

const KINDS: { id: StationKind; label: string }[] = [
  { id: 'step', label: 'Step' },
  { id: 'merge', label: 'Merge' },
  { id: 'junction', label: 'Junction' },
  { id: 'start', label: 'Start' },
  { id: 'stop', label: 'Stop' },
];
const SIDES: LabelSide[] = ['auto', 'above', 'below', 'left', 'right'];

export function Inspector({ doc, update, selected, theme }: { doc: Doc; update: Update; selected: ReadonlySet<string>; theme: ThemeId }) {
  const items = [...selected];
  if (items.length === 0)
    return (
      <div className="stack">
        <h3>Nothing selected</h3>
        <p className="note">
          {doc.stations.length} stations · {doc.edges.length} connections · {doc.sections.length} sections
        </p>
        <h3>Shortcuts</h3>
        <dl className="keys">
          <dt>V S C R</dt>
          <dd>Select, Station, Connect, Section</dd>
          <dt>Shift-click</dt>
          <dd>Add to selection</dd>
          <dt>Delete</dt>
          <dd>Remove selection</dd>
          <dt>Arrows</dt>
          <dd>Nudge stations</dd>
          <dt>Space-drag</dt>
          <dd>Pan</dd>
          <dt>F</dt>
          <dd>Fit to screen</dd>
          <dt>⌘/Ctrl Z</dt>
          <dd>Undo (Shift for redo)</dd>
          <dt>Alt-drag</dt>
          <dd>Move a section without its stations</dd>
        </dl>
      </div>
    );
  if (items.length > 1)
    return (
      <div className="stack">
        <h3>{items.length} items selected</h3>
        <p className="note">Drag to move them together, or press Delete.</p>
      </div>
    );

  const [kind, id] = items[0].split(':');
  if (kind === 'station') {
    const i = doc.stations.findIndex((s) => s.id === id);
    const s = doc.stations[i];
    if (!s) return null;
    const set = (fn: (st: typeof s) => void, key?: string) => update((d) => fn(d.stations[i]), key && `${key}-${s.id}`);
    const terminus = s.kind === 'start' || s.kind === 'stop';
    return (
      <div className="stack">
        <h3>Station</h3>
        <Field label="Label">
          <input value={s.label} onChange={(e) => set((st) => void (st.label = e.target.value), 'label')} autoFocus />
        </Field>
        <Field label="Kind">
          <select value={s.kind} onChange={(e) => set((st) => void (st.kind = e.target.value as StationKind))}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="row">
          <Field label="Flow">
            <select
              value={s.axis}
              onChange={(e) =>
                set((st) => {
                  st.axis = e.target.value as 'h' | 'v';
                })
              }
            >
              <option value="h">Horizontal</option>
              <option value="v">Vertical</option>
            </select>
          </Field>
          <Field label="Label side">
            <select value={s.labelSide} onChange={(e) => set((st) => void (st.labelSide = e.target.value as LabelSide))}>
              {SIDES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={!!s.optional} onChange={(e) => set((st) => void (st.optional = e.target.checked))} /> Optional
          </label>
          <label className="check">
            <input type="checkbox" checked={!!s.inactive} onChange={(e) => set((st) => void (st.inactive = e.target.checked))} /> Inactive
          </label>
        </div>
        {terminus && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={!!s.file}
                onChange={(e) => set((st) => void (st.file = e.target.checked ? { ext: 'fastq', count: 1 } : undefined))}
              />{' '}
              File icon
            </label>
            {s.file && (
              <>
                <div className="row">
                  <Field label="Format">
                    <input value={s.file.ext} onChange={(e) => set((st) => void (st.file!.ext = e.target.value.toLowerCase()), 'ext')} />
                  </Field>
                  <Field label="Files">
                    <select value={s.file.count} onChange={(e) => set((st) => void (st.file!.count = Number(e.target.value) as 1 | 2 | 3))}>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3+</option>
                    </select>
                  </Field>
                </div>
                <Field label="Caption">
                  <input value={s.file.caption ?? ''} onChange={(e) => set((st) => void (st.file!.caption = e.target.value || undefined), 'caption')} />
                </Field>
              </>
            )}
          </>
        )}
        <p className="note">
          x {s.x} · y {s.y}
        </p>
      </div>
    );
  }

  if (kind === 'edge') {
    const i = doc.edges.findIndex((e) => e.id === id);
    const e = doc.edges[i];
    if (!e) return null;
    const name = (sid: string) => doc.stations.find((s) => s.id === sid)?.label || sid;
    return (
      <div className="stack">
        <h3>Connection</h3>
        <p className="note">
          {name(e.from)} → {name(e.to)}
        </p>
        <h4>Lines on this connection</h4>
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
            />{' '}
            <Swatch doc={doc} slot={l.slot} theme={theme} /> {l.name}
          </label>
        ))}
        <Field label="Where the bend sits">
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
          Reverse direction
        </button>
      </div>
    );
  }

  if (kind === 'section') {
    const i = doc.sections.findIndex((s) => s.id === id);
    const s = doc.sections[i];
    if (!s) return null;
    const tl = tints(doc.palette, theme);
    return (
      <div className="stack">
        <h3>Section {i + 1}</h3>
        <Field label="Name">
          <input value={s.name} onChange={(e) => update((d) => void (d.sections[i].name = e.target.value), `section-name-${s.id}`)} autoFocus />
        </Field>
        <h4>Tint</h4>
        <div className="tints">
          {tl.map((c, k) => (
            <button key={k} className={s.tint === k ? 'on' : ''} style={{ background: c }} onClick={() => update((d) => void (d.sections[i].tint = k))} aria-label={`Tint ${k + 1}`} />
          ))}
        </div>
        <div className="row">
          <button
            disabled={i === 0}
            onClick={() =>
              update((d) => {
                [d.sections[i - 1], d.sections[i]] = [d.sections[i], d.sections[i - 1]];
              })
            }
          >
            Number −1
          </button>
          <button
            disabled={i === doc.sections.length - 1}
            onClick={() =>
              update((d) => {
                [d.sections[i + 1], d.sections[i]] = [d.sections[i], d.sections[i + 1]];
              })
            }
          >
            Number +1
          </button>
        </div>
        <p className="note">Drag moves the section with its stations; Alt-drag moves it alone. Drag the corner handle to resize.</p>
      </div>
    );
  }

  if (kind === 'legend') return <div className="stack"><h3>Legend</h3><p className="note">Drag to place it in the largest empty corner. Lines follow bundle order; the shape key lists the glyphs used on the map.</p></div>;
  if (kind === 'title') return <div className="stack"><h3>Title block</h3><p className="note">Edit the title and version line in the Map panel.</p></div>;
  return null;
}
