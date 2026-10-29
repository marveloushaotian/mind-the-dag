import type { Doc, Station } from './model';

type Port = { side: number; angle: number; lines: Set<string> };
type Constraint = { before: string; after: string; weight: number };
const EPS = 1e-6;

/** Physical branch order, carried through the parts of the map sharing those lanes. */
export function orderStationLanes(doc: Doc, lanes: Map<string, string[]>, sigma: Map<string, number>): void {
  const stations = new Map(doc.stations.map((s) => [s.id, s]));
  const ports = new Map<string, Port[]>();
  const constraints = new Map<string, Constraint[]>();
  const addPort = (s: Station, other: Station, lines: string[]) => {
    const along = s.axis === 'h' ? other.x - s.x : other.y - s.y;
    const across = s.axis === 'h' ? other.y - s.y : other.x - s.x;
    if (Math.abs(along) + Math.abs(across) < EPS) return;
    const angle = Math.atan2(across, Math.abs(along)) * (sigma.get(s.id) ?? 1);
    // A perpendicular approach is the outermost branch from either side.
    for (const side of Math.abs(along) < EPS ? [-1, 1] : [Math.sign(along)]) {
      const list = ports.get(s.id) ?? [];
      list.push({ side, angle, lines: new Set(lines) });
      ports.set(s.id, list);
    }
  };
  for (const edge of doc.edges) {
    const A = stations.get(edge.from), B = stations.get(edge.to);
    if (!A || !B || A === B) continue;
    addPort(A, B, edge.lines);
    addPort(B, A, edge.lines);
  }

  for (let i = 0; i < doc.lines.length; i++) {
    for (let j = i + 1; j < doc.lines.length; j++) {
      const a = doc.lines[i].id, b = doc.lines[j].id;
      const nodes = [...lanes].filter(([, ids]) => ids.includes(a) && ids.includes(b)).map(([id]) => id);
      if (!nodes.length) continue;
      const adjacent = new Map<string, string[]>();
      for (const edge of doc.edges) {
        if (!edge.lines.includes(a) || !edge.lines.includes(b) || !stations.has(edge.from) || !stations.has(edge.to)) continue;
        adjacent.set(edge.from, [...(adjacent.get(edge.from) ?? []), edge.to]);
        adjacent.set(edge.to, [...(adjacent.get(edge.to) ?? []), edge.from]);
      }
      const seen = new Set<string>();
      for (const root of nodes) {
        if (seen.has(root)) continue;
        const component = [root];
        seen.add(root);
        for (let n = 0; n < component.length; n++) {
          for (const other of adjacent.get(component[n]) ?? []) {
            if (!seen.has(other)) { seen.add(other); component.push(other); }
          }
        }
        let best: { delta: number; source: string } | null = null;
        for (const id of component) {
          for (const side of [-1, 1]) {
            // Shared ports reveal no relative order. Only distinct approaches
            // can constrain a pair; a common outgoing bundle inherits it.
            const at = (ports.get(id) ?? []).filter((p) => p.side === side);
            const onlyA = at.filter((p) => p.lines.has(a) && !p.lines.has(b));
            const onlyB = at.filter((p) => p.lines.has(b) && !p.lines.has(a));
            if (!onlyA.length || !onlyB.length) continue;
            const mean = (ps: Port[]) => ps.reduce((sum, p) => sum + p.angle, 0) / ps.length;
            const delta = mean(onlyB) - mean(onlyA);
            if (Math.abs(delta) < EPS) continue;
            const source = `${id}:${side}`;
            if (!best || Math.abs(delta) > Math.abs(best.delta) + EPS || (Math.abs(Math.abs(delta) - Math.abs(best.delta)) < EPS && source < best.source)) best = { delta, source };
          }
        }
        if (!best) continue;
        const rule = { before: best.delta > 0 ? a : b, after: best.delta > 0 ? b : a, weight: Math.abs(best.delta) };
        for (const id of component) constraints.set(id, [...(constraints.get(id) ?? []), rule]);
      }
    }
  }

  for (const [id, rules] of constraints) {
    const pending = new Set(lanes.get(id));
    const order: string[] = [];
    while (pending.size) {
      const incoming = (line: string) => rules.filter((r) => r.after === line && pending.has(r.before));
      let next = [...pending].find((line) => !incoming(line).length);
      if (!next) {
        // Conflicting branch layouts cannot all be planar. Break the weakest
        // conflict deterministically instead of oscillating between orders.
        const penalty = (line: string) => incoming(line).reduce((sum, r) => sum + r.weight, 0);
        next = [...pending].reduce((best, line) => penalty(line) < penalty(best) - EPS ? line : best);
      }
      order.push(next);
      pending.delete(next);
    }
    lanes.set(id, order);
  }
}
