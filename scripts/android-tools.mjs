import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const androidDir = resolve(root, 'android');
export const isWindows = process.platform === 'win32';

function firstExisting(candidates, marker) {
  for (const candidate of candidates.filter(Boolean)) {
    if (existsSync(resolve(candidate, marker))) return resolve(candidate);
  }
  return null;
}

export function prepareAndroidEnvironment() {
  const javaHome = firstExisting(
    [
      process.env.JAVA_HOME,
      'C:/Program Files/Android/Android Studio/jbr',
      'C:/Program Files/Java/jdk-21',
    ],
    isWindows ? 'bin/java.exe' : 'bin/java',
  );
  if (!javaHome) {
    throw new Error('JDK 21 was not found. Install Android Studio or set JAVA_HOME to a JDK 21 path.');
  }

  const userProfile = process.env.USERPROFILE;
  const sdkDir = firstExisting(
    [
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT,
      userProfile ? resolve(userProfile, 'AppData/Local/Android/Sdk') : null,
    ],
    'platforms/android-36/android.jar',
  );
  if (!sdkDir) {
    throw new Error('Android SDK platform 36 was not found. Install it or set ANDROID_HOME.');
  }
  if (!existsSync(resolve(sdkDir, 'build-tools/36.0.0'))) {
    throw new Error('Android Build Tools 36.0.0 were not found in the selected SDK.');
  }

  const escapedSdkDir = sdkDir.replaceAll('\\', '\\\\').replace(':', '\\:');
  writeFileSync(resolve(androidDir, 'local.properties'), `sdk.dir=${escapedSdkDir}\n`, 'utf8');

  return {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdkDir,
    ANDROID_SDK_ROOT: sdkDir,
    PATH: `${resolve(javaHome, 'bin')}${isWindows ? ';' : ':'}${process.env.PATH ?? ''}`,
  };
}

export function gradleWrapperPath() {
  return resolve(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
}

export function keytoolPath(env) {
  return resolve(env.JAVA_HOME, 'bin', isWindows ? 'keytool.exe' : 'keytool');
}
