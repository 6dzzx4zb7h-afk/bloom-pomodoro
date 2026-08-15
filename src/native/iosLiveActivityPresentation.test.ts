import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const widget = readFileSync(
  resolve(process.cwd(), 'ios/App/BloomLiveActivity/BloomLiveActivityWidget.swift'),
  'utf8',
);
const intents = readFileSync(
  resolve(process.cwd(), 'ios/App/Shared/BloomLiveActivityIntents.swift'),
  'utf8',
);
const project = readFileSync(
  resolve(process.cwd(), 'ios/App/App.xcodeproj/project.pbxproj'),
  'utf8',
);

describe('native iOS Live Activity presentation', () => {
  it('uses Bloom identity with a bounded compact presentation', () => {
    expect(widget).toContain('private struct BloomMark: View');
    expect(widget).toContain('BloomMark(phase: context.state.phase, size: 38)');
    expect(widget).toContain('BloomMark(phase: context.state.phase, size: 26)');
    expect(widget.match(/BloomMark\(phase: context\.state\.phase, size: 21\)/g)).toHaveLength(1);
    expect(widget).toContain('BloomMark(phase: context.state.phase, size: 18)');
    expect(widget).toContain('private struct BloomCompactProgress: View');
    expect(widget).toContain('.frame(width: 18, height: 18)');
    expect(widget).not.toContain('leaf.fill');
  });

  it('shows system-driven progress without per-second bridge traffic', () => {
    expect(widget).toContain('private struct BloomActivityProgress: View');
    expect(widget).toContain('timerInterval: state.timerStart...state.timerEnd');
    expect(widget).toContain('countsDown: false');
    expect(widget).toContain('.labelsHidden()');
    expect(widget).toContain('.accessibilityLabel("Focus progress")');
  });

  it('keeps compact and minimal presentations accessible and privacy-minimal', () => {
    expect(widget).toContain('context.state.accessibilityStatus(isStale: context.isStale)');
    expect(widget).toContain('context.state.clockAccessibilityValue(isStale: context.isStale)');
    expect(widget).not.toMatch(/target(Text)?|task(Id|Text)?|goal(Text)?/i);
  });

  it('adds iOS 17 controls only to expanded and Lock Screen content', () => {
    expect(widget).toContain('private struct BloomActivityControl: View');
    expect(widget).toContain('BloomPauseLiveActivityIntent(sessionId: sessionId)');
    expect(widget).toContain('BloomResumeLiveActivityIntent(sessionId: sessionId)');
    expect(widget).toContain('.accessibilityLabel("Pause Bloom timer")');
    expect(widget).toContain('.accessibilityLabel("Continue Bloom timer")');
    expect(widget).toContain('if #available(iOSApplicationExtension 17.0, *), !isStale');
    expect(widget.match(/BloomActivityControl\(/g)).toHaveLength(2);
  });

  it('runs controls in the app process and keeps a bounded local command handoff', () => {
    expect(intents.match(/: LiveActivityIntent/g)).toHaveLength(2);
    expect(intents).toContain('private let cap = 32');
    expect(intents).toContain('pausedRemainingSeconds: remaining');
    expect(intents).toContain('try? await center.add(request)');
    expect(intents).not.toMatch(/https?:\/\//);
    expect(intents).not.toMatch(/target(Text)?|task(Id|Text)?|goal(Text)?/i);
    expect(project.match(/BloomLiveActivityIntents\.swift in Sources/g)).toHaveLength(4);
  });
});
