import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './android-tools.mjs';

const versionFile = resolve(root, 'android/version.properties');
const current = Object.fromEntries(
  readFileSync(versionFile, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split('=', 2)),
);

const nextCode = Number(process.argv[2]);
const nextName = process.argv[3];
if (!Number.isSafeInteger(nextCode) || nextCode <= Number(current.VERSION_CODE)) {
  throw new Error(`versionCode must be an integer greater than ${current.VERSION_CODE}.`);
}
if (!nextName || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(nextName)) {
  throw new Error('versionName must look like 1.2.3 or 1.2.3-beta.1.');
}

writeFileSync(versionFile, `VERSION_CODE=${nextCode}\nVERSION_NAME=${nextName}\n`, 'utf8');
console.log(`Android release version is now ${nextName} (${nextCode}).`);
