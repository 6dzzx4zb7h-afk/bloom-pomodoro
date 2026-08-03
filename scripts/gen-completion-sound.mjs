#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const cue = JSON.parse(
  readFileSync(resolve(projectRoot, 'src/engine/completionCue.json'), 'utf8'),
);
const outputPath = resolve(projectRoot, 'ios/App/App/BloomCompletion.wav');

const phraseStarts = [0, cue.secondPhraseDelaySeconds];
const lastNoteStart =
  phraseStarts.at(-1) + (cue.frequencies.length - 1) * cue.noteSpacingSeconds;
const durationSeconds = lastNoteStart + cue.bellSeconds + 0.08;
const frameCount = Math.ceil(durationSeconds * cue.sampleRate);
const samples = new Float64Array(frameCount);
const floor = 0.0001;

function exponentialBetween(from, to, progress) {
  return from * Math.pow(to / from, Math.max(0, Math.min(1, progress)));
}

for (const phraseStart of phraseStarts) {
  cue.frequencies.forEach((frequency, noteIndex) => {
    const startsAt = phraseStart + noteIndex * cue.noteSpacingSeconds;
    const startFrame = Math.floor(startsAt * cue.sampleRate);
    const endFrame = Math.min(
      frameCount,
      Math.ceil((startsAt + cue.bellSeconds) * cue.sampleRate),
    );

    for (const partial of cue.partials) {
      const peak = Math.max(0.0002, cue.peak * partial.amplitude);
      const angularFrequency = 2 * Math.PI * frequency * partial.multiplier;
      for (let frame = startFrame; frame < endFrame; frame += 1) {
        const t = frame / cue.sampleRate - startsAt;
        const envelope =
          t < cue.attackSeconds
            ? exponentialBetween(floor, peak, t / cue.attackSeconds)
            : exponentialBetween(
                peak,
                floor,
                (t - cue.attackSeconds) / (cue.bellSeconds - cue.attackSeconds),
              );
        samples[frame] +=
          Math.sin(angularFrequency * t) * envelope * cue.masterGain;
      }
    }
  });
}

let maxMagnitude = 0;
for (const sample of samples) maxMagnitude = Math.max(maxMagnitude, Math.abs(sample));
const safeScale = maxMagnitude > 0.98 ? 0.98 / maxMagnitude : 1;
const dataBytes = frameCount * 2;
const wav = Buffer.alloc(44 + dataBytes);

wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(cue.sampleRate, 24);
wav.writeUInt32LE(cue.sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataBytes, 40);

for (let frame = 0; frame < frameCount; frame += 1) {
  const sample = Math.max(-1, Math.min(1, samples[frame] * safeScale));
  wav.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
}

writeFileSync(outputPath, wav);
process.stdout.write(
  `Generated ${outputPath} (${durationSeconds.toFixed(2)}s, ${cue.sampleRate}Hz mono PCM)\n`,
);
