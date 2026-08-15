import type { RandomByteFiller } from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8(value: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(value);
}

export function decodeUtf8(value: Uint8Array): string {
  return decoder.decode(value);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url value.');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function fillRandom(bytes: Uint8Array): void {
  globalThis.crypto.getRandomValues(bytes);
}

export function randomOpaqueId(
  prefix: string,
  size = 16,
  random: RandomByteFiller = fillRandom,
): string {
  const bytes = new Uint8Array(size);
  random(bytes);
  return `${prefix}_${base64UrlEncode(bytes)}`;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function encodedBytes(value: string): number {
  return encoder.encode(value).byteLength;
}

export function isPlainJson(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isPlainJson(item, depth + 1));
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.entries(value).every(
    ([key, item]) => key.length <= 256 && isPlainJson(item, depth + 1),
  );
}

export function constantTimeEqual(left: string, right: string): boolean {
  const a = utf8(left);
  const b = utf8(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index % Math.max(1, a.length)] ?? 0) ^
      (b[index % Math.max(1, b.length)] ?? 0);
  }
  return difference === 0;
}

export function safeInteger(value: unknown, min = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min;
}

export function validOpaqueId(
  value: unknown,
  prefix: string,
  encodedBytesLength = 16,
): value is string {
  if (typeof value !== 'string' || !value.startsWith(`${prefix}_`)) return false;
  try {
    return base64UrlDecode(value.slice(prefix.length + 1)).byteLength === encodedBytesLength;
  } catch {
    return false;
  }
}
