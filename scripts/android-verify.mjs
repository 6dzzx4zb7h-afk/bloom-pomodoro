import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  androidDir,
  isWindows,
  keytoolPath,
  prepareAndroidEnvironment,
} from './android-tools.mjs';

const env = prepareAndroidEnvironment();
const appId = 'dev.bloom.pomodoro';
const version = Object.fromEntries(
  readFileSync(resolve(androidDir, 'version.properties'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split('=', 2)),
);
const debugApk = resolve(androidDir, 'app/build/outputs/apk/debug/app-debug.apk');
const releaseBundle = resolve(androidDir, 'app/build/outputs/bundle/release/app-release.aab');
const mergedManifest = resolve(
  androidDir,
  'app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
);

function run(command, args) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

const manifest = readFileSync(mergedManifest, 'utf8');
const requiredManifestValues = [
  `package="${appId}"`,
  `android:versionCode="${version.VERSION_CODE}"`,
  `android:versionName="${version.VERSION_NAME}"`,
  'android:targetSdkVersion="36"',
  'android:allowBackup="false"',
  'android:usesCleartextTraffic="false"',
];
for (const expected of requiredManifestValues) {
  if (!manifest.includes(expected)) throw new Error(`Merged release manifest is missing ${expected}`);
}

const runtimePermissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((permission) => permission.startsWith('android.permission.'));
if (runtimePermissions.length > 0) {
  throw new Error(`Unexpected Android runtime permissions: ${runtimePermissions.join(', ')}`);
}

const sdkDir = env.ANDROID_HOME;
const aapt2 = resolve(sdkDir, 'build-tools/36.0.0', isWindows ? 'aapt2.exe' : 'aapt2');
const badging = run(aapt2, ['dump', 'badging', debugApk]);
for (const expected of [
  `name='${appId}'`,
  `versionCode='${version.VERSION_CODE}'`,
  `versionName='${version.VERSION_NAME}'`,
  "targetSdkVersion:'36'",
]) {
  if (!badging.includes(expected)) throw new Error(`Debug APK metadata is missing ${expected}`);
}

const jarsigner = resolve(env.JAVA_HOME, 'bin', isWindows ? 'jarsigner.exe' : 'jarsigner');
const signatureCheck = run(jarsigner, ['-verify', releaseBundle]);
if (!signatureCheck.toLowerCase().includes('jar verified')) {
  throw new Error('The release bundle did not report a verified JAR signature.');
}

const certificate = run(keytoolPath(env), ['-printcert', '-jarfile', releaseBundle]);
const owner = certificate.match(/^Owner:\s*(.+)$/m)?.[1] ?? 'unknown owner';
const fingerprint = certificate.match(/^\s*SHA256:\s*(.+)$/m)?.[1] ?? 'unknown fingerprint';

console.log(`Verified ${appId} ${version.VERSION_NAME} (${version.VERSION_CODE}), target SDK 36.`);
console.log('Verified merged manifest has no Android runtime permissions and disables backup/cleartext.');
console.log(`Verified signed bundle certificate: ${owner}`);
console.log(`Upload certificate SHA-256: ${fingerprint}`);
console.log(`Debug APK: ${debugApk}`);
console.log(`Release AAB: ${releaseBundle}`);
