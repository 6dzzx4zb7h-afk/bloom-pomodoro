export type SurfaceKind =
  | 'screen'
  | 'overlay'
  | 'inline'
  | 'primitive'
  | 'chrome'
  | 'visual';

export type AutomatedCoverage = 'direct' | 'indirect' | 'missing';
export type VisualCoverage = 'fixture' | 'missing';

export interface SurfaceInventoryEntry {
  id: string;
  label: string;
  owner: string;
  interactive: boolean;
  kind: SurfaceKind;
  states: readonly string[];
  automated: {
    level: AutomatedCoverage;
    files: readonly string[];
  };
  visual: {
    level: VisualCoverage;
    files: readonly string[];
    baselines?: readonly string[];
  };
  remaining: string;
}

/**
 * PLAN 8.21a — the durable inventory for production screens and shared
 * surfaces. "Direct" means a component or integration test renders and
 * operates the surface. "Indirect" means only a parent, store, selector, or
 * static source contract exercises it; the inventory contract now rejects
 * that level for interactive rows after PLAN 8.21b.
 * "Fixture" means a deterministic named visual fixture exists, not that a
 * pinned browser screenshot has passed; 8.21c–d own that distinction.
 */
export const SURFACE_INVENTORY: readonly SurfaceInventoryEntry[] = [
  {
    id: 'companion-check-in',
    label: 'Companion check-in',
    owner: 'src/components/CompanionPrompt.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['question', 'answer recorded', 'Quiet or off withdrawal'],
    automated: {
      level: 'direct',
      files: ['src/components/Dialog.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add deterministic question and answered visual states.',
  },
  {
    id: 'debrief',
    label: 'Session debrief',
    owner: 'src/components/DebriefCard.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['completed', 'abandoned', 'repaired record', 'long details'],
    automated: {
      level: 'direct',
      files: ['src/components/DebriefCard.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add short-phone and dense-detail visual states.',
  },
  {
    id: 'debrief-goal-credit',
    label: 'Debrief goal credit',
    owner: 'src/components/DebriefGoalCredit.tsx',
    interactive: true,
    kind: 'inline',
    states: ['offer', 'apply', 'skip', 'already credited'],
    automated: {
      level: 'direct',
      files: ['src/components/DebriefGoalCredit.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add offer and resolved visual states.',
  },
  {
    id: 'dialog-primitive',
    label: 'Modal dialog primitive',
    owner: 'src/components/Dialog.tsx',
    interactive: true,
    kind: 'primitive',
    states: ['safe Escape', 'unsafe Escape refusal', 'focus trap', 'focus restoration'],
    automated: { level: 'direct', files: ['src/components/Dialog.test.tsx'] },
    visual: { level: 'missing', files: [] },
    remaining: 'Add one representative destructive and one ordinary dialog baseline.',
  },
  {
    id: 'foundations',
    label: 'Daily foundations card',
    owner: 'src/components/FoundationsCard.tsx',
    interactive: true,
    kind: 'inline',
    states: ['empty', 'active', 'picker', 'completed', 'integrated'],
    automated: {
      level: 'direct',
      files: ['src/components/FoundationsCard.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: {
      level: 'fixture',
      files: ['fixtures/daily-target.html', 'src/screens/DailyTarget.visual-fixture.tsx'],
    },
    remaining: 'Capture and review every query-controlled fixture state.',
  },
  {
    id: 'guide',
    label: 'Field Guide',
    owner: 'src/components/GuideScreen.tsx',
    interactive: true,
    kind: 'screen',
    states: ['article list', 'filtered', 'article open', 'read marker'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/store/guide.test.ts',
        'src/content/guide.test.ts',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add list, filtered, article, and focus-return visual coverage.',
  },
  {
    id: 'guide-suggestion',
    label: 'Contextual Guide suggestion',
    owner: 'src/components/GuideSuggestion.tsx',
    interactive: true,
    kind: 'inline',
    states: ['suggested', 'opened', 'dismissed', 'suppressed while running'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/insights/surfacing.test.ts',
        'src/store/useBloom.lifecycle.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add suggested and suppressed visual states.',
  },
  {
    id: 'if-then-planner',
    label: 'If-then planner',
    owner: 'src/components/IfThenPlanner.tsx',
    interactive: true,
    kind: 'inline',
    states: ['empty', 'create', 'select remembered', 'skip', 'invalid'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/store/ifThen.test.ts',
        'src/store/useBloom.lifecycle.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add empty, selected, full-shelf, and validation visual states.',
  },
  {
    id: 'kind-restart',
    label: 'Restart-after-pause card',
    owner: 'src/components/KindRestart.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['shown', 'restart', 'dismissed', 'priority blocked'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/store/surfaceCoordinator.test.ts',
        'src/store/useBloom.lifecycle.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add offer, breath, and next-step visual states.',
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    owner: 'src/components/Onboarding.tsx',
    interactive: true,
    kind: 'screen',
    states: ['fresh', 'validation', 'keyboard-open', 'handoff'],
    automated: {
      level: 'direct',
      files: ['src/App.accessibility.test.tsx', 'src/responsiveAccessibility.test.ts'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add deterministic fresh, error, and keyboard-layout visual states.',
  },
  {
    id: 'parking-lot',
    label: 'Parking lot',
    owner: 'src/components/ParkingLot.tsx',
    interactive: true,
    kind: 'inline',
    states: ['empty', 'draft', 'parked', 'returned', 'snoozed'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/store/parking.test.ts',
        'src/store/useBloom.lifecycle.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add capture, saved-status, returned, and snoozed visual states.',
  },
  {
    id: 'resume-cue',
    label: 'Resume cue',
    owner: 'src/components/ResumeCue.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['active return', 'interrupted return', 'resume', 'not now'],
    automated: {
      level: 'direct',
      files: ['src/components/ResumeCue.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add active and interrupted visual states.',
  },
  {
    id: 'ritual',
    label: 'Start ritual',
    owner: 'src/components/RitualCard.tsx',
    interactive: true,
    kind: 'inline',
    states: ['collapsed', 'open', 'partial', 'complete', 'skip'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/store/ritual.test.ts',
        'src/store/useBloom.lifecycle.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add untouched, partial, complete, and skipped visual states.',
  },
  {
    id: 'rollover-triage',
    label: 'Rollover triage',
    owner: 'src/components/RolloverTriageCard.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['offer', 'keep', 'edit', 'clear'],
    automated: {
      level: 'direct',
      files: ['src/components/RolloverTriageCard.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add representative offer and edit visual states.',
  },
  {
    id: 'session-repair',
    label: 'Session repair editor',
    owner: 'src/components/SessionRepairEditor.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['completed', 'abandoned', 'interrupted', 'validation', 'save error'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SessionRepairEditor.test.tsx',
        'src/store/sessionRepair.integration.test.tsx',
      ],
    },
    visual: {
      level: 'fixture',
      files: ['fixtures/session-repair.html', 'src/components/SessionRepairEditor.visual-fixture.tsx'],
    },
    remaining: 'Capture and review every outcome, error, and preference fixture cell.',
  },
  {
    id: 'settings',
    label: 'Settings',
    owner: 'src/components/SettingsSheet.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['web', 'native mirror', 'permissions', 'import', 'clear scope', 'cadence details'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SettingsSheet.import.test.tsx',
        'src/components/SettingsSheet.native.test.tsx',
        'src/components/SettingsSheet.notifications.test.tsx',
        'src/components/SettingsSheet.usability.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add web narrow/wide and representative native-reference visual baselines.',
  },
  {
    id: 'sheet-primitive',
    label: 'Sheet primitive',
    owner: 'src/components/Sheet.tsx',
    interactive: true,
    kind: 'primitive',
    states: ['open', 'close button', 'safe Escape', 'focus restoration'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/components/Dialog.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add one ordinary and one destructive Sheet visual baseline.',
  },
  {
    id: 'storage-recovery',
    label: 'Storage recovery notice',
    owner: 'src/components/StorageRecoveryNotice.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['current corrupt', 'legacy recovered', 'retry', 'restore'],
    automated: {
      level: 'direct',
      files: ['src/store/storageRecovery.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add corrupt and recovered visual states.',
  },
  {
    id: 'system-switch',
    label: 'Accessible switch primitive',
    owner: 'src/components/SystemSwitch.tsx',
    interactive: true,
    kind: 'primitive',
    states: ['off', 'on', 'disabled', 'keyboard toggle'],
    automated: { level: 'direct', files: ['src/components/SystemSwitch.test.tsx'] },
    visual: { level: 'missing', files: [] },
    remaining: 'Add one day/night/focus visual baseline for the shared control.',
  },
  {
    id: 'tab-bar',
    label: 'Primary tab bar',
    owner: 'src/components/TabBar.tsx',
    interactive: true,
    kind: 'chrome',
    states: ['selected tabs', 'planner hidden', 'planner shown', 'native replacement'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/App.accessibility.test.tsx',
        'src/native/iosTabs.test.ts',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add selected-state and planner-hidden/shown visual coverage.',
  },
  {
    id: 'weekly-review',
    label: 'Weekly review',
    owner: 'src/components/WeeklyReview.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['learning', 'review', 'experiment', 'cadence apply', 'dismiss'],
    automated: {
      level: 'direct',
      files: ['src/components/WeeklyReview.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add learning and dense-review visual states.',
  },
  {
    id: 'woop',
    label: 'WOOP planning card',
    owner: 'src/components/WoopCard.tsx',
    interactive: true,
    kind: 'overlay',
    states: ['offer', 'step progression', 'complete', 'dismiss', 'cooldown'],
    automated: {
      level: 'direct',
      files: [
        'src/components/SecondarySurfaces.accessibility.test.tsx',
        'src/insights/triggers.test.ts',
        'src/store/useBloom.lifecycle.test.tsx',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add offer, step progression, plan, and dismissed visual states.',
  },
  {
    id: 'collection',
    label: 'Friends and collection sections',
    owner: 'src/screens/CollectionScreen.tsx',
    interactive: true,
    kind: 'screen',
    states: ['friends', 'on-duty selection', 'dense levels', 'Guide section'],
    automated: {
      level: 'direct',
      files: [
        'src/screens/CollectionScreen.accessibility.test.tsx',
        'src/App.accessibility.test.tsx',
        'src/native/iosTabs.test.ts',
      ],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add friends, duty selection, dense levels, and Guide-section visual states.',
  },
  {
    id: 'focus',
    label: 'Focus timer screen',
    owner: 'src/screens/FocusScreen.tsx',
    interactive: true,
    kind: 'screen',
    states: ['idle', 'running', 'paused', 'Tiny', 'Flow', 'break', 'transition guard'],
    automated: {
      level: 'direct',
      files: [
        'src/App.accessibility.test.tsx',
        'src/store/useBloom.lifecycle.test.tsx',
        'src/App.nativeChrome.test.tsx',
      ],
    },
    visual: {
      level: 'fixture',
      files: ['fixtures/daily-target.html', 'src/screens/DailyTarget.visual-fixture.tsx'],
    },
    remaining: 'The current fixture covers only the daily-target slice; add the full mode/state matrix.',
  },
  {
    id: 'goals',
    label: 'Goals screen',
    owner: 'src/screens/GoalsScreen.tsx',
    interactive: true,
    kind: 'screen',
    states: ['empty', 'active', 'deadline', 'finished', 'add/edit error', 'daily target'],
    automated: {
      level: 'direct',
      files: ['src/screens/GoalsScreen.deadline.test.tsx', 'src/store/useBloom.lifecycle.test.tsx'],
    },
    visual: {
      level: 'fixture',
      files: ['fixtures/daily-target.html', 'src/screens/DailyTarget.visual-fixture.tsx'],
      baselines: [
        'visual-baselines/chromium-macos26-arm64/goals-day-active-390x844.png',
      ],
    },
    remaining: 'The active day target has a pinned baseline; add empty, dense, form-error, deadline, theme, and viewport cells.',
  },
  {
    id: 'history',
    label: 'History ledger',
    owner: 'src/screens/HistoryScreen.tsx',
    interactive: true,
    kind: 'screen',
    states: ['empty', 'dense ledger', 'expanded day', 'details', 'repair'],
    automated: { level: 'direct', files: ['src/screens/HistoryScreen.test.tsx'] },
    visual: {
      level: 'fixture',
      files: ['fixtures/history-ledger.html', 'src/screens/HistoryScreen.visual-fixture.tsx'],
    },
    remaining: 'Capture empty/dense/expanded/detail states across the required matrix.',
  },
  {
    id: 'tasks',
    label: 'Tasks screen',
    owner: 'src/screens/TasksScreen.tsx',
    interactive: true,
    kind: 'screen',
    states: ['empty', 'add error', 'active', 'dense', 'undo', 'linked target'],
    automated: {
      level: 'direct',
      files: [
        'src/App.accessibility.test.tsx',
        'src/store/useBloom.lifecycle.test.tsx',
        'src/responsiveAccessibility.test.ts',
      ],
    },
    visual: {
      level: 'fixture',
      files: ['fixtures/tasks-empty.html', 'src/screens/TasksEmpty.visual-fixture.tsx'],
      baselines: [
        'visual-baselines/chromium-macos26-arm64/tasks-night-empty-320x568.png',
      ],
    },
    remaining: 'The night small-phone empty state has a pinned baseline; add focused, error, active, dense, undo, theme, and viewport cells.',
  },
  {
    id: 'day-sky',
    label: 'Day decorative sky',
    owner: 'src/components/DaySky.tsx',
    interactive: false,
    kind: 'visual',
    states: ['running', 'paused', 'hidden', 'reduced motion'],
    automated: {
      level: 'direct',
      files: ['src/components/Sky.motion.test.tsx', 'src/engine/decorativeScheduler.test.ts'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add a stable representative frame without grading animation timing.',
  },
  {
    id: 'night-sky',
    label: 'Night decorative sky',
    owner: 'src/components/NightSky.tsx',
    interactive: false,
    kind: 'visual',
    states: ['running', 'paused', 'hidden', 'reduced motion'],
    automated: {
      level: 'direct',
      files: ['src/components/Sky.motion.test.tsx', 'src/engine/decorativeScheduler.test.ts'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add a stable representative frame without grading animation timing.',
  },
  {
    id: 'pixel-pal',
    label: 'Pixel companion canvas',
    owner: 'src/components/PixelPal.tsx',
    interactive: false,
    kind: 'visual',
    states: ['idle', 'focus', 'rest', 'reduced motion', 'offscreen'],
    automated: {
      level: 'direct',
      files: ['src/engine/pixelpals.motion.test.ts', 'src/components/Sky.motion.test.tsx'],
    },
    visual: { level: 'missing', files: [] },
    remaining: 'Add deterministic sprite frames for each production friend and mode.',
  },
];
