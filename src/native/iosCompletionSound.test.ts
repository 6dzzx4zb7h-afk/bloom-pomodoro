import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import completionCue from '../engine/completionCue.json';

const projectRoot = process.cwd();
const soundPath = resolve(projectRoot, 'ios/App/App/BloomCompletion.wav');
const projectPath = resolve(projectRoot, 'ios/App/App.xcodeproj/project.pbxproj');

describe('bundled iOS completion cue', () => {
  it('is short, mono PCM generated from the shared foreground cue data', () => {
    const wav = readFileSync(soundPath);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); // PCM
    expect(wav.readUInt16LE(22)).toBe(1); // mono
    expect(wav.readUInt32LE(24)).toBe(completionCue.sampleRate);
    expect(wav.readUInt16LE(34)).toBe(16);

    const frames = wav.readUInt32LE(40) / 2;
    const durationSeconds = frames / completionCue.sampleRate;
    const expectedDuration =
      completionCue.secondPhraseDelaySeconds +
      (completionCue.frequencies.length - 1) * completionCue.noteSpacingSeconds +
      completionCue.bellSeconds +
      0.08;
    expect(durationSeconds).toBeCloseTo(expectedDuration, 3);
    expect(durationSeconds).toBeLessThan(30);
  });

  it('is copied into the native app target as a notification resource', () => {
    const project = readFileSync(projectPath, 'utf8');
    expect(project).toContain('BloomCompletion.wav in Resources');
    expect(project).toContain('path = BloomCompletion.wav');
  });
});
