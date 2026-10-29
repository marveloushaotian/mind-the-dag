import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Doc } from './model';
import { IMore } from './icons';
import { copyPalette, lineStyle, normaliseColour, PALETTE_IDS, type ColourPair, type CustomPalette, type ThemeId } from './tokens';
import { editColourPair, editPaletteColour, matchPalette, type ColourRole } from './colourMatching';
import { Field, Seg, Toggle } from './ui';

type Update = (fn: (doc: Doc) => void, key?: string) => void;

/** One colour, entered visually or as hex; partial text never reaches the map. */
export function ColourField({ label, controlLabel = label, value, onChange }: { label: string; controlLabel?: string; value: string; onChange: (colour: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const colour = normaliseColour(text);
    setText(colour ?? value);
    if (colour && colour !== value) onChange(colour);
  };
  return <div className="colour-field">
    <span>{label}</span>
    <div className="colour-entry">
      <input type="color" aria-label={`${controlLabel} picker`} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      <input aria-label={`${controlLabel} hex`} value={text} spellCheck={false} maxLength={7}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
        }} />
    </div>
  </div>;
}

export function CustomColour({ label, value, base, theme, role, onChange, onReset }: {
  label: string; value?: ColourPair; base: ColourPair; theme: ThemeId; role: ColourRole; onChange: (colour: ColourPair) => void; onReset: () => void;
}) {
  // Existing manual pairs stay independent; a new custom pair starts linked.
  const matching = value?.matchThemes ?? !value;
  return <details className="custom-colour" open={Boolean(value)}>
    <summary>{label}</summary>
    <Toggle label="Auto match themes" checked={matching} onChange={(enabled) =>
      onChange(editColourPair(value ?? base, theme, (value ?? base)[theme], role, enabled))} />
    <div className="colour-pair">
      {(['light', 'dark'] as const).map((theme) => <ColourField key={theme} label={theme === 'light' ? 'Light' : 'Dark'}
        controlLabel={`${theme === 'light' ? 'Light' : 'Dark'} ${label.toLowerCase()}`}
        value={(value ?? base)[theme]} onChange={(colour) => onChange(editColourPair(value ?? base, theme, colour, role, matching))} />)}
    </div>
    {value && <button className="subtle" onClick={onReset}>Use palette colour</button>}
  </details>;
}

function PaletteEditor({ initial, theme, onApply, onClose }: {
  initial: CustomPalette; theme: ThemeId; onApply: (palette: CustomPalette) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [variant, setVariant] = useState(theme);
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef(typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => { if (previousFocus.current?.isConnected) previousFocus.current.focus(); };
  }, []);
  return <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'Tab') {
      const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? [])];
      const first = focusable[0], last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  }}>
    <div ref={dialog} className="modal palette-editor" role="dialog" aria-modal="true" aria-label="Custom palette">
      <h2>Custom palette</h2>
      <p className="inspector-note">Saved with this map, including map files and shared copies.</p>
      <Field label="Palette name"><input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
      <Seg label="Palette theme" value={variant} onChange={setVariant} options={[["light", "Light colours"], ["dark", "Dark colours"]]} />
      <div className="matching-setting">
        <Toggle label="Auto match themes" checked={!!draft.matchThemes} onChange={(enabled) =>
          setDraft((d) => enabled ? matchPalette(d, variant) : { ...d, matchThemes: false })} />
        <p className="inspector-note">Match from the visible theme. Edit either to update its pair, or turn off to adjust separately.</p>
      </div>
      <h3>Line colours</h3>
      <div className="palette-colour-grid">
        {draft.lines.map((line, i) => <ColourField key={i} label={`Colour ${i + 1}`} value={line[variant]}
          onChange={(colour) => setDraft((d) => editPaletteColour(d, variant, 'line', i, colour))} />)}
      </div>
      <h3>Section fills</h3>
      <div className="palette-colour-grid">
        {draft.tints[variant].map((colour, i) => <ColourField key={i} label={`Fill ${i + 1}`} value={colour}
          onChange={(value) => setDraft((d) => editPaletteColour(d, variant, 'fill', i, value))} />)}
      </div>
      <div className="actions"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!draft.name.trim()}
        onClick={() => onApply({ ...draft, name: draft.name.trim() })}>Apply palette</button></div>
    </div>
  </div>;
}

export function PalettePicker({ doc, theme, update }: { doc: Doc; theme: ThemeId; update: Update }) {
  const [editing, setEditing] = useState(false);
  return <>
    <Field label="Palette" group><div className="palettes">
      {PALETTE_IDS.map((p) => <button key={p} className={`palette${doc.palette === p ? ' on' : ''}`} onClick={() => update((d) => void (d.palette = p))}>
        <span className="chips">{[0, 1, 2, 3].map((k) => <i key={k} style={{ background: lineStyle(p, k, theme).color }} />)}</span>
        <span className="palette-name">{p[0].toUpperCase() + p.slice(1)}</span>
      </button>)}
      <div className="custom-palette-row">
        <button className={`palette${doc.palette === 'custom' ? ' on' : ''}`} onClick={() => {
          if (doc.customPalette) update((d) => void (d.palette = 'custom'));
          else setEditing(true);
        }}><span className="chips">{(doc.customPalette?.lines ?? copyPalette(doc).lines).slice(0, 4)
          .map((line, k) => <i key={k} style={{ background: line[theme] }} />)}</span><span className="palette-name">{doc.customPalette?.name ?? 'Custom…'}</span></button>
        {doc.customPalette && <button className="icon" aria-label="Edit custom palette" title="Edit custom palette" onClick={() => setEditing(true)}><IMore /></button>}
      </div>
    </div></Field>
    {editing && <PaletteEditor initial={doc.customPalette ?? copyPalette(doc)} theme={theme} onClose={() => setEditing(false)} onApply={(palette) => {
      update((d) => { d.customPalette = palette; d.palette = 'custom'; });
      setEditing(false);
    }} />}
  </>;
}
