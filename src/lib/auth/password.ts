import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Parametros de custo do scrypt (N=2^15). Sem dependencia nativa: usa node:crypto.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;

/** Gera o hash no formato scrypt$N$r$p$salt$key (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** Comparacao em tempo constante. Nunca lanca para hash malformado. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(P)) return false;
  try {
    const salt = Buffer.from(saltB64 ?? '', 'base64url');
    const expected = Buffer.from(keyB64 ?? '', 'base64url');
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r: R,
      p: P,
      maxmem: PARAMS.maxmem,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
