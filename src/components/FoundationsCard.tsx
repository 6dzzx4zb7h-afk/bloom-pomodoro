import { useEffect, useMemo, useState } from 'react';
import {
  FOUNDATION_ACTIVE_CAP,
  FOUNDATION_CATALOG,
  derivedFoundationDone,
  foundationDayMarkers,
  foundationDensity,
  foundationEntryId,
  foundationInstanceId,
  gapRestartOffer,
  isManualFoundationType,
  type FoundationsState,
  type ManualFoundationType,
} from '../store/foundations';
import type { SessionRecord } from '../store/sessions';
import type { CueType, IfThenPlan } from '../store/ifThen';
import { Dialog } from './Dialog';
import { IfThenPlanner } from './IfThenPlanner';

interface FoundationsCardProps {
  foundations: FoundationsState;
  records: SessionRecord[];
  today: string;
  dayStartHour: number;
  onToggleDay: (instanceId: string, targetAt?: number) => void;
  onSetEnabled: (
    type: ManualFoundationType,
    enabled: boolean,
    customName?: string,
  ) => void;
  onReorder: (instanceId: string, direction: -1 | 1) => void;
  onRenameCustom: (name: string) => void;
  plans: IfThenPlan[];
  onCreatePlan: (cueType: CueType, cueText: string, actionText: string) => void;
  onRemovePlan: (id: string) => void;
  onSetIfThen: (instanceId: string, ifThenId?: string) => void;
  onMarkRestartOffered: (instanceId: string, dayKey: string) => void;
  compact?: boolean;
}

const GLYPHS: Record<string, string> = {
  'phone-away': '📵',
  'desk-reset': '🧺',
  'tiny-start': '🌱',
  'tomorrow-note': '📝',
  custom: '✨',
  'focused-work': '⏱',
};

function nameFor(type: string, customName?: string): string {
  if (type === 'focused-work') return 'Focused work';
  if (type === 'custom') return customName || 'My foundation';
  return FOUNDATION_CATALOG.find((item) => item.type === type)?.name ?? type;
}

function studyDayTargetAt(dayKey: string, dayStartHour: number): number {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(year, month - 1, day, dayStartHour, 30, 0, 0).getTime();
}

function previousDayKey(dayKey: string): string {
  const date = new Date(`${dayKey}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function FoundationsCard({
  foundations,
  records,
  today,
  dayStartHour,
  onToggleDay,
  onSetEnabled,
  onReorder,
  onRenameCustom,
  plans,
  onCreatePlan,
  onRemovePlan,
  onSetIfThen,
  onMarkRestartOffered,
  compact = false,
}: FoundationsCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState(
    foundations.instances.find((item) => item.type === 'custom')?.customName ?? '',
  );
  const [capNote, setCapNote] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [activeRestartId, setActiveRestartId] = useState<string | null>(null);
  const [restartHandledDay, setRestartHandledDay] = useState<string | null>(null);
  const manual = useMemo(
    () =>
      foundations.instances
        .filter((item) => isManualFoundationType(item.type) && item.enabled)
        .sort((a, b) => a.order - b.order),
    [foundations.instances],
  );
  const focusedDone = derivedFoundationDone(records, today, dayStartHour);
  const displayed = [
    ...manual,
    {
      id: foundationInstanceId('focused-work'),
      type: 'focused-work' as const,
      enabled: true,
      order: Number.MAX_SAFE_INTEGER,
      ranges: [],
      createdAt: 0,
    },
  ].slice(0, FOUNDATION_ACTIVE_CAP + 1);
  const doneCount =
    manual.filter((instance) =>
      foundations.entries.some(
        (entry) => entry.id === foundationEntryId(instance.id, today),
      ),
    ).length + (focusedDone ? 1 : 0);
  const total = displayed.length;
  const expanded = manual.find((instance) => instance.id === expandedId) ?? null;
  const markers = expanded
    ? foundationDayMarkers(expanded, foundations.entries, today)
    : [];
  const density = expanded
    ? foundationDensity(expanded, foundations.entries, today)
    : null;
  const yesterdayKey = previousDayKey(today);
  const eligibleRestart = manual.find(
    (instance) => gapRestartOffer(foundations.entries, instance, today) !== null,
  ) ?? null;
  const restartInstance =
    manual.find((instance) => instance.id === activeRestartId) ?? null;
  const anchorInstance =
    foundations.instances.find((instance) => instance.id === anchorId) ?? null;

  useEffect(() => {
    if (activeRestartId || restartHandledDay === today || !eligibleRestart) return;
    setActiveRestartId(eligibleRestart.id);
    onMarkRestartOffered(eligibleRestart.id, today);
  }, [activeRestartId, eligibleRestart, onMarkRestartOffered, restartHandledDay, today]);

  function toggle(instanceId: string, label: string, done: boolean) {
    onToggleDay(instanceId);
    if (!done && activeRestartId === instanceId) setActiveRestartId(null);
    setAnnouncement(`${label} ${done ? 'set aside for today' : 'tended today'}.`);
  }

  function setEnabled(type: ManualFoundationType, enabled: boolean, customName?: string) {
    if (enabled && manual.length >= FOUNDATION_ACTIVE_CAP) {
      setCapNote(true);
      return;
    }
    setCapNote(false);
    onSetEnabled(type, enabled, customName);
  }

  const catalogTypes: ManualFoundationType[] = [
    ...FOUNDATION_CATALOG.map((item) => item.type),
    'custom',
  ];
  const pickerTypes = [...catalogTypes].sort((a, b) => {
    const aInstance = foundations.instances.find((item) => item.type === a);
    const bInstance = foundations.instances.find((item) => item.type === b);
    const aOrder = aInstance?.order ?? Number.MAX_SAFE_INTEGER;
    const bOrder = bInstance?.order ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder || catalogTypes.indexOf(a) - catalogTypes.indexOf(b);
  });

  return (
    <section
      className={`foundations-card${compact ? ' foundations-card-compact' : ''}`}
      aria-labelledby={compact ? 'break-foundations-title' : 'tasks-foundations-title'}
    >
      <div className="foundations-head">
        <div>
          <h2 id={compact ? 'break-foundations-title' : 'tasks-foundations-title'}>
            {total > 1
              ? `${doneCount} of ${total} tended today 🌱`
              : 'Daily foundations'}
          </h2>
          {manual.length === 0 && (
            <p>
              Tiny daily things beside your focus. Patterns can take months, and timing
              varies. Want to plant up to three?
            </p>
          )}
        </div>
        <button type="button" className="foundations-tend" onClick={() => setPickerOpen(true)}>
          tend
        </button>
      </div>

      <div className="foundation-chips">
        {displayed.map((instance) => {
          const label = nameFor(instance.type, instance.customName);
          const integrated = instance.type === 'focused-work';
          const done = integrated
            ? focusedDone
            : foundations.entries.some(
                (entry) => entry.id === foundationEntryId(instance.id, today),
              );
          return integrated ? (
            <div className={`foundation-chip derived${done ? ' done' : ''}`} key={instance.id}>
              <span aria-hidden="true">{GLYPHS[instance.type]} {done ? '🍃' : '♧'}</span>
              <span>{label}</span>
              <small>counted from your finished sessions</small>
            </div>
          ) : (
            <div className={`foundation-chip manual${done ? ' done' : ''}`} key={instance.id}>
              <button
                type="button"
                className="foundation-toggle"
                aria-pressed={done}
                aria-label={`${done ? 'Set aside' : 'Mark'} ${label} ${done ? 'for today' : 'done'}`}
                onClick={() => toggle(instance.id, label, done)}
              >
                <span aria-hidden="true">{GLYPHS[instance.type]} {done ? '🍃' : '♧'}</span>
              </button>
              <button
                type="button"
                className="foundation-detail-toggle"
                aria-expanded={expandedId === instance.id}
                aria-controls={`foundation-detail-${instance.id}`}
                onClick={() =>
                  setExpandedId((current) => current === instance.id ? null : instance.id)
                }
              >
                <span>{label}</span>
                {instance.ifThenId && plans.some((plan) => plan.id === instance.ifThenId) && (
                  <small>
                    {plans.find((plan) => plan.id === instance.ifThenId)?.cueText}
                  </small>
                )}
              </button>
            </div>
          );
        })}
      </div>
      {expanded && density && (
        <div
          className="foundation-detail"
          id={`foundation-detail-${expanded.id}`}
          aria-label={`${nameFor(expanded.type, expanded.customName)} recent entries`}
        >
          <div className="foundation-dot-row" role="list" aria-label="Recent foundation days">
            {markers.map((marker) => {
              const editable = marker.dayKey === yesterdayKey && marker.state !== 'outside';
              const symbol =
                marker.state === 'done' ? '🍃' : marker.state === 'open' ? '♧' : '·';
              const stateLabel =
                marker.state === 'done'
                  ? 'recorded'
                  : marker.state === 'open'
                    ? 'no entry'
                    : 'outside the active range';
              const label = `${marker.dayKey}: ${stateLabel}${marker.late ? ', added later' : ''}`;
              return editable ? (
                <button
                  type="button"
                  role="listitem"
                  className={`foundation-dot ${marker.state}`}
                  key={marker.dayKey}
                  aria-label={`${label}. ${marker.state === 'done' ? 'Remove' : 'Add'} yesterday's entry`}
                  aria-pressed={marker.state === 'done'}
                  onClick={() => {
                    onToggleDay(
                      expanded.id,
                      studyDayTargetAt(marker.dayKey, dayStartHour),
                    );
                    setAnnouncement(
                      marker.state === 'done'
                        ? `${nameFor(expanded.type, expanded.customName)} entry for yesterday removed.`
                        : `${nameFor(expanded.type, expanded.customName)} added later for yesterday.`,
                    );
                  }}
                >
                  <span aria-hidden="true">{symbol}</span>
                </button>
              ) : (
                <span
                  role="listitem"
                  className={`foundation-dot ${marker.state}`}
                  key={marker.dayKey}
                  aria-label={label}
                >
                  <span aria-hidden="true">{symbol}</span>
                </span>
              );
            })}
          </div>
          {markers.some((marker) => marker.late) && (
            <span className="foundation-late-note">🍃 added later</span>
          )}
          <p>
            {density.doneDays} recorded across {density.activeDays} active day
            {density.activeDays === 1 ? '' : 's'} in this {density.windowDays}-day window —
            each record counts.
          </p>
        </div>
      )}
      {restartInstance && (
        <div className="foundation-restart" role="note">
          <p>
            It’s been a few active days since the last record. A gap is just weather.
            A tiny version may be worth an experiment. Want to try it?
          </p>
          <button
            type="button"
            onClick={() => {
              onToggleDay(restartInstance.id);
              setActiveRestartId(null);
              setRestartHandledDay(today);
              setAnnouncement(`${nameFor(restartInstance.type, restartInstance.customName)} added for today.`);
            }}
          >
            {FOUNDATION_CATALOG.find((item) => item.type === restartInstance.type)?.tinyVersion ??
              restartInstance.customName}
          </button>
          <button
            type="button"
            className="foundation-restart-skip"
            onClick={() => {
              setActiveRestartId(null);
              setRestartHandledDay(today);
            }}
          >
            not now
          </button>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>

      {pickerOpen && (
        <Dialog
          title="Tend daily foundations"
          description="Choose up to three tiny things. Turning one off hides it and keeps its earlier entries."
          onRequestClose={() => setPickerOpen(false)}
          closeLabel="Close foundations picker"
          className="foundations-picker"
        >
          {anchorInstance && isManualFoundationType(anchorInstance.type) ? (
            <div className="foundation-anchor-flow">
              <button type="button" onClick={() => setAnchorId(null)}>← foundations</button>
              <IfThenPlanner
                key={anchorInstance.id}
                plans={plans}
                selectedId={anchorInstance.ifThenId ?? null}
                initialOpen
                initialCueType="time"
                initialActionText={
                  FOUNDATION_CATALOG.find((item) => item.type === anchorInstance.type)?.description ??
                  anchorInstance.customName ??
                  ''
                }
                onSelect={(id) => {
                  onSetIfThen(anchorInstance.id, id);
                  setAnchorId(null);
                }}
                onClear={() => {
                  onSetIfThen(anchorInstance.id);
                  setAnchorId(null);
                }}
                onCreate={onCreatePlan}
                onRemove={onRemovePlan}
              />
            </div>
          ) : (
          <div className="foundation-picker-list">
            {pickerTypes.map((type, index) => {
              const instance = foundations.instances.find((item) => item.type === type);
              const enabled = instance?.enabled === true;
              const template = FOUNDATION_CATALOG.find((item) => item.type === type);
              const label = nameFor(type, instance?.customName);
              return (
                <div className="foundation-picker-row" key={type}>
                  <div className="foundation-picker-copy">
                    <strong>{GLYPHS[type]} {label}</strong>
                    <small>
                      {type === 'custom'
                        ? 'name one small action of your own'
                        : template?.description}
                    </small>
                    {template && <small>{template.evidenceNote}</small>}
                    {type === 'custom' && (
                      <input
                        value={customDraft}
                        maxLength={24}
                        placeholder="my tiny daily thing"
                        aria-label="Custom foundation name"
                        onChange={(event) => setCustomDraft(event.target.value)}
                        onBlur={() => {
                          if (instance && customDraft.trim()) onRenameCustom(customDraft);
                        }}
                      />
                    )}
                    {instance?.enabled && (
                      <button
                        type="button"
                        className="foundation-anchor"
                        onClick={() => setAnchorId(instance.id)}
                      >
                        {instance.ifThenId && plans.some((plan) => plan.id === instance.ifThenId)
                          ? 'change anchor'
                          : 'anchor it'}
                      </button>
                    )}
                  </div>
                  <div className="foundation-picker-actions">
                    <button
                      type="button"
                      className={`switch${enabled ? ' on' : ''}`}
                      role="switch"
                      aria-checked={enabled}
                      aria-label={`${enabled ? 'Turn off' : 'Turn on'} ${label}`}
                      onClick={() =>
                        setEnabled(type, !enabled, type === 'custom' ? customDraft : undefined)
                      }
                    >
                      <span className="knob" />
                    </button>
                    {instance && (
                      <span className="foundation-order">
                        <button
                          type="button"
                          aria-label={`Move ${label} up`}
                          disabled={index === 0}
                          onClick={() => onReorder(instance.id, -1)}
                        >↑</button>
                        <button
                          type="button"
                          aria-label={`Move ${label} down`}
                          disabled={index === pickerTypes.length - 1}
                          onClick={() => onReorder(instance.id, 1)}
                        >↓</button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
          <p className="foundation-cap-note" role={capNote ? 'status' : undefined}>
            {capNote
              ? 'Three at a time — small and steady beats a big dashboard.'
              : 'Up to three can be active at once. A restart note appears once per gap.'}
          </p>
          <button type="button" className="dialog-primary" onClick={() => setPickerOpen(false)}>
            done
          </button>
        </Dialog>
      )}
    </section>
  );
}
