import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const controller = readFileSync(
  resolve(root, 'ios/App/App/BloomBridgeViewController.swift'),
  'utf8',
);
const focusScreen = readFileSync(
  resolve(root, 'src/screens/FocusScreen.tsx'),
  'utf8',
);

describe('native iOS in-app timer surface contract', () => {
  it('derives its display locally from stable wall-clock sources', () => {
    expect(controller).toContain('Timer(timeInterval: 0.25, repeats: true)');
    expect(controller).toContain('configuration.deadlineMs');
    expect(controller).toContain('configuration.flowStartedAtMs');
    expect(controller).toContain('configuration.flowAccumulatedSeconds + live');
    expect(controller).toContain('guard timerSurfaceLastSecond != seconds else { return }');
    expect(focusScreen).toContain('const nativeRemainingSnapshot = state.running ? 0 : state.remaining');
  });

  it('keeps reducer ownership for every native transport action', () => {
    expect(focusScreen).toContain("if (action === 'primary')");
    expect(focusScreen).toContain('beginSession();');
    expect(focusScreen).toContain("requestTransition('reset', actions.reset)");
    expect(focusScreen).toContain('actions.finishFlow()');
    expect(focusScreen).toContain("requestTransition('skip', actions.skip)");
    expect(controller).toContain('retainUntilConsumed: false');
  });

  it('exposes a native clock value and three 44-point button actions to VoiceOver', () => {
    expect(controller).toContain('bloom-native-timer-readout');
    expect(controller).toContain('bloom-native-timer-primary');
    expect(controller).toContain('bloom-native-timer-reset');
    expect(controller).toContain('bloom-native-timer-secondary');
    expect(controller).toContain('"Elapsed focus time"');
    expect(controller).toContain('"Time remaining"');
    expect(controller).toContain('let primaryDiameter = min(76, max(44, bounds.height))');
    expect(controller).toContain('let sideDiameter = min(52, max(44, primaryDiameter * 0.72))');
  });

  it('uses UIKit system materials with an older-iOS fallback', () => {
    expect(controller).toContain('UIButton.Configuration.glass()');
    expect(controller).toContain('UIButton.Configuration.tinted()');
    expect(controller).toContain('UIFont.monospacedDigitSystemFont');
  });
});
