import { cameraAt, canvasResolution, cityAppearance, EUROPE_CITIES, EUROPE_ROUTES, geography, project, routeFront, routeProgress } from './europeJourney';
import { lineStyle, tokens } from './tokens';
import { CITY_FONT, layoutCityLabels, type CityLabel } from './europeLabels';
import type { Pt } from './geometry';

const SEA = '#F4F7F5';
const INK = tokens.themes.light.ink;
const colours = new Map(EUROPE_ROUTES.map((route) => [route.slot, lineStyle('nordic', route.slot).color]));
const pathFor = (points: Pt[]) => {
  const path = new Path2D();
  points.forEach((point, i) => i === 0 ? path.moveTo(point.x, point.y) : path.lineTo(point.x, point.y));
  return path;
};

/** Rasterise the land once; camera frames never repaint country polygons. */
function landImage() {
  const image = document.createElement('canvas');
  image.width = geography.width;
  image.height = geography.height;
  const ctx = image.getContext('2d')!;
  ctx.fillStyle = '#DFE8E2';
  ctx.strokeStyle = '#C9D5CE';
  ctx.lineWidth = 0.75;
  for (const country of geography.countries) {
    const path = new Path2D(country.path);
    ctx.fill(path, 'evenodd');
    ctx.stroke(path);
  }
  // Keep the illustration's emphasis west of the Baltic, without a hard crop.
  const east = ctx.createLinearGradient(project([26, 54]).x, 0, project([32, 54]).x, 0);
  east.addColorStop(0, '#000'); east.addColorStop(1, '#0000');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = east;
  ctx.fillRect(0, 0, image.width, image.height);
  return image;
}

export function createJourneyRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const land = landImage();
  const labelAtlas = document.createElement('canvas');
  const paths = new Map(EUROPE_ROUTES.map((route) => [route.id, route.parts.map((part) => ({ ...part, path: pathFor(part.points) }))]));
  let labels = new Map<string, CityLabel>();
  const labelRows = new Map<string, { y: number; width: number }>();
  const measureLabels = () => {
    ctx.font = CITY_FONT;
    labels = layoutCityLabels(EUROPE_CITIES, (name) => ctx.measureText(name).width);
    // Cache outlined type at 2× resolution, so camera frames only copy sprites.
    // Text measurement, collision solving and glyph rasterisation happen once.
    labelAtlas.width = Math.ceil(Math.max(...[...labels.values()].map((label) => label.x1 - label.x0)) + 8) * 2;
    labelAtlas.height = labels.size * 28 * 2;
    const text = labelAtlas.getContext('2d')!;
    text.scale(2, 2); text.font = CITY_FONT; text.textAlign = 'left'; text.textBaseline = 'middle';
    text.lineWidth = 4; text.lineJoin = 'round'; text.strokeStyle = SEA; text.fillStyle = INK;
    EUROPE_CITIES.forEach((city, i) => {
      const label = labels.get(city.id)!;
      const y = i * 28;
      labelRows.set(city.id, { y, width: Math.ceil(label.x1 - label.x0) + 8 });
      text.strokeText(city.name, 4, y + 14); text.fillText(city.name, 4, y + 14);
    });
  };
  let width = 0, height = 0, ratio = 1;
  return {
    resize(w: number, h: number) {
      const nextRatio = canvasResolution(w, h, window.devicePixelRatio || 1);
      measureLabels();
      if (w === width && h === height && ratio === nextRatio) return;
      width = w; height = h; ratio = nextRatio;
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    },
    draw(time: number) {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = SEA;
      ctx.fillRect(0, 0, width, height);
      const camera = cameraAt(time, width, height);
      ctx.translate(camera.x, camera.y); ctx.scale(camera.scale, camera.scale);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(land, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const route of EUROPE_ROUTES) {
        const progress = routeProgress(route, time);
        if (progress <= 0) continue;
        const front = routeFront(route, progress);
        ctx.strokeStyle = colours.get(route.slot)!;
        const limit = route.length * progress;
        for (const part of paths.get(route.id)!) {
          if (limit <= part.start) break;
          ctx.globalAlpha = part.sea ? 0.52 : 0.58;
          ctx.lineWidth = part.sea ? 4 : tokens.line.width * 0.75;
          ctx.setLineDash(part.sea ? [7, 9] : []);
          ctx.lineDashOffset = -part.start;
          if (limit >= part.end) ctx.stroke(part.path);
          else {
            ctx.beginPath(); ctx.moveTo(part.points[0].x, part.points[0].y);
            let distance = part.start;
            for (let i = 1; i < part.points.length; i++) {
              const a = part.points[i - 1], b = part.points[i];
              const length = Math.hypot(b.x - a.x, b.y - a.y);
              if (distance + length >= limit) { ctx.lineTo(front.point.x, front.point.y); break; }
              ctx.lineTo(b.x, b.y); distance += length;
            }
            ctx.stroke();
          }
        }
        if (progress < 1) {
          // A single moving capsule follows the line; it is not another station.
          ctx.save();
          ctx.translate(front.point.x, front.point.y); ctx.rotate(front.angle);
          ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.globalAlpha = 0.95;
          ctx.beginPath(); ctx.roundRect(-6, -3.5, 12, 7, 3.5);
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }
      ctx.setLineDash([]);
      for (const city of EUROPE_CITIES) {
        const { opacity, scale } = cityAppearance(city.id, time);
        if (opacity <= 0) continue;
        ctx.save(); ctx.translate(city.x, city.y); ctx.scale(scale, scale);
        ctx.globalAlpha = opacity * 0.67;
        ctx.fillStyle = city.kind === 'step' ? '#fff' : INK;
        ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (city.kind === 'merge') ctx.roundRect(-8, -6, 16, 12, 4);
        else if (city.kind === 'start') {
          ctx.moveTo(-7, 6); ctx.lineTo(-7, -3); ctx.lineTo(0, -9); ctx.lineTo(7, -3); ctx.lineTo(7, 6); ctx.closePath();
        } else if (city.kind === 'stop') ctx.roundRect(-8, -2.5, 16, 5, 2);
        else ctx.arc(0, 0, city.capital ? 7 : 5.5, 0, Math.PI * 2);
        ctx.fill(); if (city.kind !== 'stop') ctx.stroke();
        ctx.restore();
        // Labels stay still while the complete glyph scales uniformly.
        const label = labels.get(city.id)!;
        const row = labelRows.get(city.id)!;
        ctx.globalAlpha = opacity * 0.72;
        ctx.drawImage(labelAtlas, 0, row.y * 2, row.width * 2, 56, label.x0 - 4, label.y - 14, row.width, 28);
      }
      ctx.globalAlpha = 1;
    },
    dispose() { land.width = 0; land.height = 0; labelAtlas.width = 0; labelAtlas.height = 0; },
  };
}
