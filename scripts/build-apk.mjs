// Invokes the Android Gradle wrapper in a shell-agnostic way, so `npm run apk`
// works whether npm's script shell is cmd, PowerShell, or bash/sh.
// Usage: node scripts/build-apk.mjs [assembleDebug|assembleRelease]
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = resolve(root, 'android');
const task = process.argv[2] || 'assembleDebug';
const isWin = process.platform === 'win32';

// Reference the wrapper by absolute path so it resolves regardless of the
// shell's cwd search rules. On Windows, .bat files must run through cmd.exe.
const wrapper = resolve(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
const res = isWin
  ? spawnSync('cmd.exe', ['/c', wrapper, task], { cwd: androidDir, stdio: 'inherit' })
  : spawnSync(wrapper, [task], { cwd: androidDir, stdio: 'inherit' });

if (res.error) {
  console.error(res.error.message);
  process.exit(1);
}
process.exit(res.status ?? 1);
