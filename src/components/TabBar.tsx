import type { ReactNode } from 'react';

export type ScreenName = 'focus' | 'tasks' | 'goals' | 'collection';

/* Inline SVG icons so colors flow through CSS variables and render the same
   on every device. Outlines ride on `currentColor` (the nav button's color);
   accent fills ride on --nav-icon-a / --nav-icon-b, which .phone.night remaps
   to lavender + moonlight yellow. */

/** Day Focus: a five-petal cherry blossom. */
function BlossomIcon() {
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return [12 + Math.cos(a) * 5.4, 12 + Math.sin(a) * 5.4] as const;
  });
  return (
    <svg className="icon-day" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="var(--nav-icon-a)">
        {petals.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="4.1" />
        ))}
      </g>
      <circle cx="12" cy="12" r="2.9" fill="var(--nav-icon-b)" />
    </svg>
  );
}

/** Night Focus: a shooting star with a sparkling trail. */
function ShootingStarIcon() {
  return (
    <svg className="icon-night" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke="var(--nav-icon-a)" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 13.5 L9.5 10.5" />
        <path d="M5 18.5 L11.5 14.5" />
      </g>
      <path
        d="M16.5 4.5 L18.1 8.4 L22 10 L18.1 11.6 L16.5 15.5 L14.9 11.6 L11 10 L14.9 8.4 Z"
        fill="var(--nav-icon-b)"
      />
      <circle cx="7" cy="6.5" r="1" fill="var(--nav-icon-a)" />
    </svg>
  );
}

/** Tasks: a chubby pencil. */
function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M14.8 5.2 L18.8 9.2 L9.2 18.8 L4.5 19.5 L5.2 14.8 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M16.2 3.8 a2 2 0 0 1 2.8 0 l1.2 1.2 a2 2 0 0 1 0 2.8 l-0.4 0.4 -4 -4 Z"
        fill="var(--nav-icon-b)"
      />
    </svg>
  );
}

/** Friends: a plump heart. */
function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20 C9 17.8 4.4 14.4 3.2 10.6 C2.2 7.6 4.2 4.8 7.1 4.8 C9 4.8 10.4 5.9 12 7.8 C13.6 5.9 15 4.8 16.9 4.8 C19.8 4.8 21.8 7.6 20.8 10.6 C19.6 14.4 15 17.8 12 20 Z"
        fill="var(--nav-icon-a)"
      />
    </svg>
  );
}

/** Goals: a little pennant flag on a pole — deadlines to march toward. */
function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 3.5 L7 20.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M7 4.5 L17.5 7.5 L7 10.5 Z" fill="var(--nav-icon-b)" />
      <circle cx="7" cy="3.5" r="1.6" fill="var(--nav-icon-a)" />
    </svg>
  );
}

const TABS: { name: ScreenName; icon: ReactNode; label: string }[] = [
  {
    name: 'focus',
    icon: (
      <>
        <BlossomIcon />
        <ShootingStarIcon />
      </>
    ),
    label: 'Focus',
  },
  { name: 'tasks', icon: <PencilIcon />, label: 'Tasks' },
  { name: 'goals', icon: <FlagIcon />, label: 'Goals' },
  { name: 'collection', icon: <HeartIcon />, label: 'Friends' },
];

export function TabBar({
  active,
  onChange,
  showGoals,
}: {
  active: ScreenName;
  onChange: (s: ScreenName) => void;
  /** Goals is opt-in (Settings → Goals & deadlines). */
  showGoals: boolean;
}) {
  return (
    <nav className="navbar" aria-label="Primary">
      {TABS.filter((t) => t.name !== 'goals' || showGoals).map((tab) => (
        <button
          key={tab.name}
          className={`nav-btn${active === tab.name ? ' active' : ''}`}
          onClick={() => onChange(tab.name)}
          aria-label={tab.label}
          aria-current={active === tab.name ? 'page' : undefined}
          aria-controls={`${tab.name}-screen`}
        >
          <span className="nav-icon">{tab.icon}</span>
          <span>{tab.label}</span>
          <span className="nav-pip" />
        </button>
      ))}
    </nav>
  );
}
