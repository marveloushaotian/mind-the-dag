import { useMemo } from 'react';
import { defaultFileBadge, emptyDoc, stationMarker, snapStation, type Derived, type Station, type StationKind } from './model';
import { MetroMap } from './render';
import type { ThemeId } from './tokens';
import type { Pt } from './geometry';

/** Reuse the actual renderer so the placement ghost matches every station type. */
export function PlacementGhost({ point, kind, theme }: { point: Pt; kind: StationKind; theme: ThemeId }) {
  const ghost = useMemo(() => {
    const doc = emptyDoc();
    doc.legend.show = false;
    doc.stations = [{ id: 'placement', x: 0, y: 0, label: '', kind, axis: 'h', labelSide: 'auto',
      ...((kind === 'start' || kind === 'stop') ? { file: defaultFileBadge() } : {}) }];
    return <MetroMap doc={doc} theme={theme} exporting={kind !== 'junction'} />;
  }, [kind, theme]);
  const p = snapStation(point, 'h');
  return <g className="placement-ghost" transform={`translate(${p.x} ${p.y})`} pointerEvents="none" aria-hidden="true">{ghost}</g>;
}

export function StationHalo({ station, derived, zoom, colour, source = false }: {
  station: Station; derived: Derived; zoom: number; colour: string; source?: boolean;
}) {
  const marker = stationMarker(derived, station);
  const rx = marker.rx + 7 / zoom;
  const ry = marker.ry + 7 / zoom;
  return (
    <g transform={`translate(${marker.x} ${marker.y})`} pointerEvents="none" aria-hidden="true">
      <g className={source ? 'connection-source' : 'connection-target'} data-snap-target={source ? undefined : station.id}>
        <rect x={-rx} y={-ry} width={rx * 2} height={ry * 2} rx={Math.min(rx, ry)}
          fill={colour} fillOpacity={source ? 0.04 : 0.09} stroke={colour} strokeOpacity={source ? 0.5 : 0.85}
          strokeWidth={source ? 1.5 : 2} vectorEffect="non-scaling-stroke" />
      </g>
    </g>
  );
}

/** A short, pinched bridge suggests adhesion while the provisional fusion is held. */
export function FusionPreview({ from, into, derived, zoom }: { from: Station; into: Station; derived: Derived; zoom: number }) {
  const dx = into.x - from.x;
  const dy = into.y - from.y;
  const distance = Math.hypot(dx, dy);
  const r = Math.min(9 / zoom, distance / 3);
  const nx = distance ? -dy / distance * r : 0;
  const ny = distance ? dx / distance * r : 0;
  const mx = (from.x + into.x) / 2;
  const my = (from.y + into.y) / 2;
  const d = `M ${from.x + nx} ${from.y + ny} Q ${mx + nx * 0.15} ${my + ny * 0.15} ${into.x + nx} ${into.y + ny}
    L ${into.x - nx} ${into.y - ny} Q ${mx - nx * 0.15} ${my - ny * 0.15} ${from.x - nx} ${from.y - ny} Z`;
  return (
    <g className="fusion-preview" pointerEvents="none" aria-hidden="true">
      {distance > 1 && <path d={d} fill="#1f6fae" fillOpacity={0.18} />}
      <StationHalo station={into} derived={derived} zoom={zoom} colour="#1f6fae" />
    </g>
  );
}
