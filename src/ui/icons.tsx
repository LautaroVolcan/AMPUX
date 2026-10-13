import type { ReactNode } from 'react';

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  back: () => <Svg><path d="M15 18l-6-6 6-6" /></Svg>,
  sidebar: () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></Svg>,
  notes: () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></Svg>,
  search: () => <Svg><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Svg>,
  settings: () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>,
  download: () => <Svg><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>,
  upload: () => <Svg><path d="M12 20V9M7 14l5-5 5 5M5 4h14" /></Svg>,
  page: () => <Svg><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /></Svg>,
  draft: () => <Svg><path d="M4 6h16M4 12h16M4 18h10" /></Svg>,
  title: () => <Svg><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 9h6M10 13h4" /></Svg>,
  stats: () => <Svg><path d="M5 20V10M12 20V4M19 20v-7" /></Svg>,
  plus: () => <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  minus: () => <Svg><path d="M5 12h14" /></Svg>,
  more: () => <Svg><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Svg>,
  close: () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  up: () => <Svg><path d="M6 15l6-6 6 6" /></Svg>,
  down: () => <Svg><path d="M6 9l6 6 6-6" /></Svg>,
  cards: () => <Svg><rect x="3" y="4" width="8" height="7" rx="1" /><rect x="13" y="4" width="8" height="7" rx="1" /><rect x="3" y="13" width="8" height="7" rx="1" /><rect x="13" y="13" width="8" height="7" rx="1" /></Svg>,
  grip: () => <Svg><circle cx="9" cy="7" r=".8" /><circle cx="15" cy="7" r=".8" /><circle cx="9" cy="12" r=".8" /><circle cx="15" cy="12" r=".8" /><circle cx="9" cy="17" r=".8" /><circle cx="15" cy="17" r=".8" /></Svg>,
};
