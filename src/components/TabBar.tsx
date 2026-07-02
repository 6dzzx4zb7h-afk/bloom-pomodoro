export type ScreenName = 'focus' | 'tasks' | 'collection';

const TABS: { name: ScreenName; icon: string; label: string }[] = [
  { name: 'focus', icon: '🌸', label: 'Focus' },
  { name: 'tasks', icon: '✎', label: 'Tasks' },
  { name: 'collection', icon: '♡', label: 'Friends' },
];

export function TabBar({
  active,
  onChange,
}: {
  active: ScreenName;
  onChange: (s: ScreenName) => void;
}) {
  return (
    <nav className="navbar">
      {TABS.map((tab) => (
        <button
          key={tab.name}
          className={`nav-btn${active === tab.name ? ' active' : ''}`}
          onClick={() => onChange(tab.name)}
          aria-label={tab.label}
          aria-current={active === tab.name}
        >
          <span className="nav-icon">{tab.icon}</span>
          <span>{tab.label}</span>
          <span className="nav-pip" />
        </button>
      ))}
    </nav>
  );
}
