/** Small 18 px line icons, drawn in currentColor. */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const make = (body: React.ReactNode) =>
  function Icon({ size = 18 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
        {body}
      </svg>
    );
  };

export const ISelect = make(<path {...P} d="M4 2.5 L4 14 L7.2 11 L9.4 15.6 L11.4 14.7 L9.3 10.2 L13.5 10 Z" />);
export const IStation = make(
  <>
    <path {...P} d="M1.5 9 H16.5" strokeWidth={3} />
    <circle cx={9} cy={9} r={3.4} fill="#fff" stroke="currentColor" strokeWidth={1.75} />
  </>,
);
export const IConnect = make(
  <>
    <path {...P} d="M4.5 13.5 H7 L11 4.5 H13.5" strokeWidth={2.4} />
    <circle cx={3.5} cy={13.5} r={2} fill="#fff" stroke="currentColor" strokeWidth={1.6} />
    <circle cx={14.5} cy={4.5} r={2} fill="#fff" stroke="currentColor" strokeWidth={1.6} />
  </>,
);
export const ISection = make(<rect {...P} x={2.5} y={3.5} width={13} height={11} rx={3} />);
export const IUndo = make(<path {...P} d="M6.5 4 L3 7.5 L6.5 11 M3.5 7.5 H11 A4 4 0 0 1 11 15.5 H8" />);
export const IRedo = make(<path {...P} d="M11.5 4 L15 7.5 L11.5 11 M14.5 7.5 H7 A4 4 0 0 0 7 15.5 H10" />);
export const IPlus = make(<path {...P} d="M9 3.5 V14.5 M3.5 9 H14.5" />);
export const IMinus = make(<path {...P} d="M3.5 9 H14.5" />);
export const IChevron = make(<path {...P} d="M5 7 L9 11 L13 7" />);
export const IFit = make(<path {...P} d="M3 7 V3 H7 M11 3 H15 V7 M15 11 V15 H11 M7 15 H3 V11" />);
export const IHelp = make(
  <>
    <circle {...P} cx={9} cy={9} r={7} />
    <path {...P} d="M7 7.2 A2 2 0 1 1 9.8 9 C9.2 9.3 9 9.7 9 10.4" />
    <circle cx={9} cy={12.9} r={0.9} fill="currentColor" />
  </>,
);
export const ITrash = make(<path {...P} d="M3.5 5 H14.5 M7 5 V3.5 H11 V5 M5 5 L5.8 15 H12.2 L13 5" />);
export const IUp = make(<path {...P} d="M5 11 L9 7 L13 11" />);
export const IDown = make(<path {...P} d="M5 7 L9 11 L13 7" />);
export const IFile = make(<path {...P} d="M4.5 2.5 H10.5 L13.5 5.5 V15.5 H4.5 Z M10.5 2.5 V5.5 H13.5" />);
export const IClose = make(<path {...P} d="M4.5 4.5 L13.5 13.5 M13.5 4.5 L4.5 13.5" />);
export const ILogo = make(
  <>
    <path d="M1.5 11.5 H6 A3.5 3.5 0 0 0 8.5 10.5 L10 9 A3.5 3.5 0 0 1 12.5 8 H16.5" fill="none" stroke="#24B064" strokeWidth={3} />
    <circle cx={9.2} cy={9.8} r={2.4} fill="#fff" stroke="#1A1D21" strokeWidth={1.4} />
  </>,
);
