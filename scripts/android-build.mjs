import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  androidDir,
  isWindows,
  prepareAndroidEnvironment,
} from './android-tools.mjs';

const task = process.argv[2];
const allowedTasks = new Set(['assembleDebug', 'bundleRelease', 'testDebugUnitTest', 'lintRelease']);
if (!allowedTasks.has(task)) {
  throw new Error(
    'Usage: node scripts/android-build.mjs <assembleDebug|bundleRelease|testDebugUnitTest|lintRelease>',
  );
}

if (task === 'bundleRelease') {
  const required = [
    resolve(androidDir, 'keystore.properties'),
    resolve(androidDir, 'app/upload-keystore.jks'),
  ];
  if (required.some((path) => !existsSync(path))) {
    throw new Error('Release signing is not configured. Run npm run android:key first.');
  }
}

const env = prepareAndroidEnvironment();
const java = resolve(env.JAVA_HOME, 'bin', isWindows ? 'java.exe' : 'java');
const wrapperJar = resolve(androidDir, 'gradle/wrapper/gradle-wrapper.jar');
const result = spawnSync(
  java,
  [
    '-classpath',
    wrapperJar,
    'org.gradle.wrapper.GradleWrapperMain',
    task,
    '--stacktrace',
    ...(task === 'lintRelease' ? ['--rerun-tasks'] : []),
  ],
  { cwd: androidDir, env, stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
