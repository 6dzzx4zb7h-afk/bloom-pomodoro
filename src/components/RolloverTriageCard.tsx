import type { RolloverOffer } from '../store/dailyTarget';

/**
 * Prop-driven PLAN 10.5 surface. The store-owned once-per-day marker and
 * action wiring land separately; this card never mutates or schedules itself.
 */
export function RolloverTriageCard({
  offer,
  onCarry,
  onSpread,
  onRest,
}: {
  offer: RolloverOffer;
  onCarry: () => void;
  onSpread: () => void;
  onRest: () => void;
}) {
  const headingId = `rollover-${offer.target.id}-heading`;
  const detailId = `rollover-${offer.target.id}-detail`;

  return (
    <section
      className="rollover-card"
      aria-labelledby={headingId}
      aria-describedby={detailId}
    >
      <h3 id={headingId}>Yesterday’s plan</h3>
      <p id={detailId}>
        You recorded {offer.actual} of {offer.target.plannedAmount}{' '}
        {offer.target.snapshot.unit} for {offer.target.snapshot.title} — that’s real
        progress. {offer.remainder} {offer.target.snapshot.unit} are still open.{' '}
        Today can start fresh: carry them, spread them, or let them rest?
      </p>
      <div className="rollover-actions" role="group" aria-label="Choose what happens next">
        <button type="button" onClick={onCarry}>Carry to today</button>
        <button type="button" onClick={onSpread}>Spread it</button>
        <button type="button" onClick={onRest}>Let it rest</button>
      </div>
      <div className="rollover-cap">Shows at most once a day.</div>
    </section>
  );
}
