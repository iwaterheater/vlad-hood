/* The line icons the static launchpad drew from an SVG sprite. Inline here
   instead: six small paths do not need a sprite, and a React tree has nowhere
   natural to hang one. */
const PATHS = {
  scales: <path d="M12 3v18M7 21h10M3 8l4-3 4 3M3 8l2 5h4l2-5M13 8l4-3 4 3M13 8l2 5h4l2-5" />,
  shield: <><path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" /><path d="m9 12 2 2 4-4" /></>,
  users: <>
    <path d="M16 20v-1.5A3.5 3.5 0 0 0 12.5 15h-5A3.5 3.5 0 0 0 4 18.5V20" />
    <circle cx="10" cy="8" r="3.2" />
    <path d="M20 20v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
  </>,
  check: <path d="m4 12.5 5 5L20 6" />,
  spark: <path d="M12 2.5c1.6 3.4.4 5.3-1 7.1-1.5 1.9-2.6 3.6-2.6 5.6a5.6 5.6 0 0 0 11.2 0c0-3-1.6-4.6-3-6.4-.5 1.4-1.3 2-2.2 2.4.6-3.1-.6-6.2-2.4-8.7z" />,
  flag: <><path d="M5 21V4" /><path d="M5 5h11l-2 3.5L16 12H5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  arrow: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  swap: <><path d="M7 3v14" /><path d="m3 13 4 4 4-4" /><path d="M17 21V7" /><path d="m13 11 4-4 4 4" /></>,
  slippage: <><path d="M5 19 19 5" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></>,
  lock: <><rect x="4" y="10.5" width="16" height="10" rx="2.5" /><path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  web: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" /></>,
  telegram: <path d="M21 5 3 11.5l5 1.8L18 8l-7.5 7.4.3 4.1 2.7-3 4 3z" />,
  x: <path d="M4 4l16 16M20 4L4 20" />,
  chart: <><path d="M3 3v18h18" /><path d="M18.5 7.5 13 13l-3-3-4 4" /><path d="M18.5 11V7.5H15" /></>,
  upload: <><path d="M12 19V6" /><path d="m6 12 6-6 6 6" /><path d="M4 20h16" /></>,
  image: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  thumbUp: <><path d="M7 10v11H3V10z" /><path d="M7 10 12 3a2.4 2.4 0 0 1 2.3 3l-.8 3H20a2 2 0 0 1 2 2.4l-1.4 6A2 2 0 0 1 18.6 19H7" /></>,
  thumbDown: <><path d="M17 14V3h4v11z" /><path d="m17 14-5 7a2.4 2.4 0 0 1-2.3-3l.8-3H4a2 2 0 0 1-2-2.4l1.4-6A2 2 0 0 1 5.4 5H17" /></>,
  gas: <><path d="M4 20V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13 5v15" /><path d="M3 20h11" /><path d="M13 10h3.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-2.5-2.5" /></>,
  gecko: <><circle cx="12" cy="12" r="9" /><path d="M8.5 10.5h.01M15.5 10.5h.01" /><path d="M8 15c2.5 2 5.5 2 8 0" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, strokeWidth = 2 }: { name: IconName; strokeWidth?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
