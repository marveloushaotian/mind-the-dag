import { useLayoutEffect, useRef, useState } from 'react';
import { reducedMotion } from './motion';
import { JOURNEY_DURATION } from './europeJourney';
import { createJourneyRenderer } from './europeCanvas';

/** One bounded canvas player. It stops drawing permanently on arrival in Scandinavia. */
export default function EuropeBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const time = useRef(0);
  const manualPause = useRef(false);
  const playback = useRef<() => void>(() => undefined);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reduced, setReduced] = useState(reducedMotion);

  useLayoutEffect(() => {
    const element = canvas.current!;
    const renderer = createJourneyRenderer(element);
    let disposed = false;
    let request = 0, last: number | null = null;
    let samples = 0, frames = 0, drawTotal = 0, longFrames = 0;
    const draw = () => {
      const started = performance.now();
      renderer.draw(time.current);
      if (import.meta.env.DEV) {
        drawTotal += performance.now() - started;
        samples++;
        if (samples % 30 === 0 || time.current >= JOURNEY_DURATION) {
          element.dataset.drawMs = (drawTotal / samples).toFixed(2);
          element.dataset.frameCount = String(frames);
          element.dataset.fps = (frames / Math.max(1, time.current) * 1000).toFixed(1);
          element.dataset.longFrames = String(longFrames);
        }
      }
    };
    const tick = (now: number) => {
      frames++;
      request = 0;
      if (last !== null) {
        const delta = now - last;
        if (delta > 34) longFrames++;
        time.current = Math.min(JOURNEY_DURATION, time.current + delta);
      }
      last = now;
      draw();
      if (time.current < JOURNEY_DURATION) request = requestAnimationFrame(tick);
      else { element.dataset.animationState = 'finished'; setFinished(true); }
    };
    const syncPlayback = () => {
      if (disposed) return;
      cancelAnimationFrame(request); request = 0; last = null;
      const typing = document.activeElement?.closest('form, input, textarea, select');
      const stop = manualPause.current || document.hidden || typing || reduced || time.current >= JOURNEY_DURATION;
      element.dataset.animationState = time.current >= JOURNEY_DURATION ? 'finished' : stop ? 'paused' : 'playing';
      if (!stop) request = requestAnimationFrame(tick);
    };
    const resize = () => {
      if (disposed) return;
      const { width, height } = frame.current!.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.resize(Math.round(width), Math.round(height));
      draw();
    };
    if (reduced) { time.current = JOURNEY_DURATION; setFinished(true); }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(frame.current!);
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => setReduced(preference.matches);
    const onFocus = () => queueMicrotask(syncPlayback);
    document.addEventListener('visibilitychange', syncPlayback);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    preference.addEventListener('change', onPreference);
    // Load the bundled typeface before drawing city labels for the first time.
    void document.fonts.ready.then(() => { if (canvas.current === element) resize(); });
    playback.current = syncPlayback;
    syncPlayback();
    return () => {
      disposed = true;
      cancelAnimationFrame(request);
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
      preference.removeEventListener('change', onPreference);
      playback.current = () => undefined;
      renderer.dispose();
    };
  }, [reduced]);

  return <>
    <div ref={frame} className="europe-backdrop" aria-hidden="true">
      <canvas ref={canvas} className="europe-map" />
    </div>
    {!reduced && !finished && <button className="cover-motion" aria-label={paused ? 'Play map animation' : 'Pause map animation'} aria-pressed={paused}
      onClick={() => {
        manualPause.current = !manualPause.current;
        setPaused(manualPause.current);
        playback.current();
      }}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {paused ? <path d="M4 2.5 11 7 4 11.5Z" fill="currentColor" /> : <path d="M4 3V11 M10 3V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
      <span>{paused ? 'Play map' : 'Pause map'}</span>
    </button>}
  </>;
}
