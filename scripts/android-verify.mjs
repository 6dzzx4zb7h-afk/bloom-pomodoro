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

/**
 * Bloom's Android permissions are an allowlist, not an absence.
 *
 * PLAN 8.25 shipped the wrapper with none at all and this check asserted that
 * literally. The point was never zero for its own sake — it was that a release
 * must not quietly acquire a permission nobody decided on, which is exactly what
 * a new plugin's manifest merge can do. So the check now names the three Bloom
 * deliberately declares and still fails on anything else, including a fourth
 * added without editing this list.
 *
 * None of these reach the network; the local-first constraint is untouched.
 */
const ALLOWED_PERMISSIONS = new Set([
  // Deliver the finish alert and show the running countdown. Without it a timer
  // that ends while the phone is face down ends silently.
  'android.permission.POST_NOTIFICATIONS',
  // The timer itself. Install-time granted, and restricted by Play policy to
  // apps whose core function is an alarm clock or timer.
  'android.permission.USE_EXACT_ALARM',
  // The same capability on API 31-32, where USE_EXACT_ALARM does not exist.
  'android.permission.SCHEDULE_EXACT_ALARM',
]);

const declaredPermissions = [...manifest.matchAll(/<uses-permission(?![-\w])[^>]*?android:name="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((permission) => permission.startsWith('android.permission.'));
const unexpectedPermissions = declaredPermissions.filter(
  (permission) => !ALLOWED_PERMISSIONS.has(permission),
);
if (unexpectedPermissions.length > 0) {
  throw new Error(
    `Unexpected Android runtime permissions: ${unexpectedPermissions.join(', ')}. ` +
      'Add it to ALLOWED_PERMISSIONS in scripts/android-verify.mjs only if it was a deliberate ' +
      'product decision, and update docs/android-release.md with the Play justification.',
  );
}
const missingPermissions = [...ALLOWED_PERMISSIONS].filter(
  (permission) => !declaredPermissions.includes(permission),
);
if (missingPermissions.length > 0) {
  // A merge that drops POST_NOTIFICATIONS ships a build whose timer cannot
  // reach anyone, and nothing else in the pipeline would notice.
  throw new Error(`Release manifest is missing expected permissions: ${missingPermissions.join(', ')}`);
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
console.log(
  `Verified merged manifest declares only the ${ALLOWED_PERMISSIONS.size} expected permissions ` +
    'and disables backup/cleartext.',
);
console.log(`Verified signed bundle certificate: ${owner}`);
console.log(`Upload certificate SHA-256: ${fingerprint}`);
console.log(`Debug APK: ${debugApk}`);
console.log(`Release AAB: ${releaseBundle}`);
