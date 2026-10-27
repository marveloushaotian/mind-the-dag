export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">mind-the-dag</span>
      </header>
      <main className="stage">
        <svg className="canvas" role="img" aria-label="Empty canvas">
          <defs>
            <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="0.75" cy="0.75" r="0.75" fill="var(--grid)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </main>
    </div>
  );
}
