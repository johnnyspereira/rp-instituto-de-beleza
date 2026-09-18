import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error('Password must contain at least 8 characters.');
  }

  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string
): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = encodedHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !keyHex) return false;

  const storedKey = Buffer.from(keyHex, 'hex');
  if (storedKey.length !== KEY_LENGTH) return false;

  const candidateKey = (await scrypt(
    password,
    Buffer.from(saltHex, 'hex'),
    KEY_LENGTH
  )) as Buffer;

  return timingSafeEqual(storedKey, candidateKey);
}
