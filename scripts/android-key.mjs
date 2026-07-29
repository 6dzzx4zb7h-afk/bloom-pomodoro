import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  androidDir,
  keytoolPath,
  prepareAndroidEnvironment,
} from './android-tools.mjs';

const keystorePath = resolve(androidDir, 'app/upload-keystore.jks');
const propertiesPath = resolve(androidDir, 'keystore.properties');
if (existsSync(keystorePath) || existsSync(propertiesPath)) {
  throw new Error('Upload credentials already exist. Refusing to overwrite the key used for updates.');
}

const env = prepareAndroidEnvironment();
const password = randomBytes(24).toString('base64url');
const alias = 'bloom-upload';
const result = spawnSync(
  keytoolPath(env),
  [
    '-genkeypair',
    '-v',
    '-keystore',
    keystorePath,
    '-alias',
    alias,
    '-keyalg',
    'RSA',
    '-keysize',
    '4096',
    '-validity',
    '10000',
    '-storepass',
    password,
    '-keypass',
    password,
    '-dname',
    'CN=Bloom Upload, OU=Mobile, O=Bloom, L=Riyadh, ST=Riyadh, C=SA',
  ],
  { env, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`keytool could not create the upload key: ${result.stderr.trim()}`);
}

writeFileSync(
  propertiesPath,
  [
    '# Generated locally by npm run android:key. Never commit this file.',
    'storeFile=app/upload-keystore.jks',
    `storePassword=${password}`,
    `keyAlias=${alias}`,
    `keyPassword=${password}`,
    '',
  ].join('\n'),
  { encoding: 'utf8', mode: 0o600 },
);

console.log('Created ignored Android upload credentials.');
console.log(`Back up together: ${keystorePath}`);
console.log(`                 ${propertiesPath}`);
console.log('Future Play updates require this upload key; keep an encrypted copy outside the repository.');
