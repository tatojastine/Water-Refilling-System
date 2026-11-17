import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, validEmail } from './domain.mjs';

const deriveKey = promisify(scrypt);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const fallbackSalt = randomBytes(16);
const fallbackHash = randomBytes(64);

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export async function prepareAccount({ role, name, email: suppliedEmail, password }) {
  const email = normalizeEmail(suppliedEmail);
  if (!['admin', 'customer'].includes(role) || typeof name !== 'string' || !name.trim() || name.trim().length > 80 || !validEmail(email)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter your name and a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || !password.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Use a password of 12 to 128 characters.');
  }
  const salt = randomBytes(16);
  const hash = await deriveKey(password, salt, 64, options);
  return { id: randomUUID(), role, name: name.trim(), email, address: '', salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function registerAccount(state, account) {
  if (account.role === 'admin' && state.accounts.some((entry) => entry.role === 'admin')) {
    throw new AppError(409, 'OWNER_ALREADY_REGISTERED', 'The station owner account has already been created.');
  }
  if (state.accounts.some((entry) => entry.email === account.email)) {
    throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'That email is already registered. Sign in or use a different email.');
  }
  state.accounts.push(account);
  return account;
}

export async function authenticate(accounts, { login, password }) {
  const email = normalizeEmail(login);
  const account = validEmail(email) && accounts.find((entry) => entry.email === email);
  if (typeof password === 'string' && password.length >= 12 && password.length <= 128) {
    const salt = account ? Buffer.from(account.salt, 'hex') : fallbackSalt;
    const expected = account ? Buffer.from(account.hash, 'hex') : fallbackHash;
    const actual = await deriveKey(password, salt, 64, options);
    if (timingSafeEqual(actual, expected) && account) return account;
  }
  throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
}

export function publicAccount({ id, name, email }) {
  return { id, name, email };
}
