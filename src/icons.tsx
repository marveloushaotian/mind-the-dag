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

export const ISelect = make(<path {...P} d="M5.5 8 V3.5 a1 1 0 0 1 2 0 V7 V2.5 a1 1 0 0 1 2 0 V7 V3.5 a1 1 0 0 1 2 0 V7 V5 a1 1 0 0 1 2 0 V10 c0 3-1.5 5-4.5 5 H8 c-1.2 0-2.1-.6-2.8-1.6 L2.7 9.7 a1.1 1.1 0 0 1 1.7-1.4 L5.5 9.5 Z" />);
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
export const IMore = make(<>{[4, 9, 14].map((x) => <circle key={x} cx={x} cy={9} r={1.3} fill="currentColor" />)}</>);
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
export const IDuplicate = make(<path {...P} d="M6.5 6.5 H14.5 V14.5 H6.5 Z M11.5 6.5 V3.5 H3.5 V11.5 H6.5" />);
/** Two people: a group. */
export const IGroup = make(<path {...P} d="M7 8.5 A2.5 2.5 0 1 0 7 3.5 A2.5 2.5 0 1 0 7 8.5 M2.5 15 C2.5 12 4.5 10.5 7 10.5 C9.5 10.5 11.5 12 11.5 15 M12 8.3 A2.2 2.2 0 1 0 12 3.9 M13.2 10.7 C14.8 11.2 15.8 12.6 15.8 15" />);
/** Cloud with an arrow up: move into the account. */
export const IUpload = make(<path {...P} d="M5.5 13.5 H4.8 A3.3 3.3 0 0 1 4.6 6.9 A4.6 4.6 0 0 1 13.4 6.6 A3.4 3.4 0 0 1 13.2 13.5 H12.5 M9 15.5 V9 M6.6 11.2 L9 8.8 L11.4 11.2" />);
export const IClose = make(<path {...P} d="M4.5 4.5 L13.5 13.5 M13.5 4.5 L4.5 13.5" />);
