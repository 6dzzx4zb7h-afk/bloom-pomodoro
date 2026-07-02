import { useEffect, useState } from 'react';

function clock(d: Date): string {
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** iOS-style status bar with a live clock + battery glyph. */
export function StatusBar({ color }: { color?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="statusbar" style={color ? { color } : undefined}>
      <span>{clock(now)}</span>
      <span className="battery" />
    </div>
  );
}
