import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate, prepareAccount, publicAccount, registerAccount } from './accounts.mjs';
import { AppError, saveInventory, saveOrder, saveProfile, updateStatus, viewState } from './domain.mjs';
import { createStore } from './store.mjs';

const defaultDataFile = fileURLToPath(new URL('./data/accounts-state.json', import.meta.url));
const cookieName = 'aq_session';
const daySeconds = 86_400;
const assets = new Map([
  ['/', ['local.html', 'text/html; charset=utf-8']],
  ['/index.html', ['local.html', 'text/html; charset=utf-8']],
  ['/local.js', ['local.js', 'text/javascript; charset=utf-8']],
  ['/session.js', ['session.js', 'text/javascript; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/api.js', ['api.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/hero.png', ['hero.png', 'image/png']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request as application/json.');
  }
  const chunks = [];
  let size = 0;
  for await (const part of request.iterator({ destroyOnReturn: false })) {
    size += part.length;
    if (size > 16_384) {
      request.resume();
      throw new AppError(413, 'BODY_TOO_LARGE', 'The request is too large.');
    }
    chunks.push(part);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Send a valid JSON object.');
  }
}

function readSessionId(request) {
  return request.headers.cookie?.match(/(?:^|;\s*)aq_session=([a-f0-9]{64})(?=;|$)/)?.[1];
}

function setCookie(response, value, maxAge, secureCookies) {
  const parts = [`${cookieName}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (secureCookies) parts.push('Secure');
  response.setHeader('Set-Cookie', parts.join('; '));
}

function checkOrigin(request, clientUrl, localOnly) {
  const origin = request.headers.origin;
  if (origin && origin === clientUrl) return;
  const crossSite = request.headers['sec-fetch-site'] === 'cross-site';
  if (!origin && !crossSite) return;
  if (localOnly && !crossSite) {
    try {
      const url = new URL(origin);
      if (['http:', 'https:'].includes(url.protocol) && url.host === request.headers.host && origin === url.origin) return;
    } catch {
      // Invalid origins never authorize a write.
    }
  }
  throw new AppError(403, 'ORIGIN_DENIED', 'Use the AquaRefresh page to make changes.');
}

function applyCors(request, response, clientUrl) {
  response.setHeader('Vary', 'Origin');
  if (!clientUrl || request.headers.origin !== clientUrl) return false;
  response.setHeader('Access-Control-Allow-Origin', clientUrl);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  return true;
}

function preflight(request, response, allowed) {
  const method = request.headers['access-control-request-method'];
  const headers = (request.headers['access-control-request-headers'] ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!allowed || !['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'].includes(method) ||
      headers.some((value) => !['content-type', 'x-aqua-account'].includes(value))) {
    throw new AppError(403, 'ORIGIN_DENIED', 'This cross-origin request is unavailable.');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, DELETE');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Aqua-Account');
  response.setHeader('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  response.setHeader('Cache-Control', 'no-store');
  response.writeHead(204);
  response.end();
}

function isLoopback(address) {
  return typeof address === 'string' && (address === '::1' || /^(?:::ffff:)?127(?:\.\d{1,3}){3}$/.test(address));
}

async function serveAsset(response, method, path) {
  const asset = assets.get(path);
  if (!asset || !['GET', 'HEAD'].includes(method)) return false;
  const [file, type] = asset;
  const contents = await readFile(new URL(`../frontend/${file}`, import.meta.url));
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': contents.length, 'Cache-Control': 'no-cache' });
  response.end(method === 'HEAD' ? undefined : contents);
  return true;
}

export function createApp({
  dataFile = defaultDataFile,
  store = createStore(resolve(dataFile)),
  secureCookies = false,
  localOnly = true,
  clientUrl,
  serveFrontend = true,
} = {}) {
  const sessions = new Map();
  const sessionLife = 8 * 60 * 60;
  const authAttempts = new Map();
  let openingSessions = 0;

  async function withSessionSlot(request, response, now, open) {
    if (!localOnly) {
      // Use the socket peer; an untrusted forwarding header can claim any address.
      const peer = request.socket.remoteAddress ?? 'unknown';
      for (const [key, attempt] of authAttempts) if (attempt.until <= now) authAttempts.delete(key);
      const attempt = authAttempts.get(peer);
      if ((attempt?.count ?? 0) >= 30 || (!attempt && authAttempts.size >= 1000)) {
        response.setHeader('Retry-After', Math.max(1, Math.ceil(((attempt?.until ?? now + 60_000) - now) / 1000)));
        throw new AppError(429, 'AUTH_RATE_LIMIT', 'Too many account requests. Try again in a minute.');
      }
      authAttempts.set(peer, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + 60_000 });
    }
    if (openingSessions >= 8) {
      response.setHeader('Retry-After', '5');
      throw new AppError(429, 'AUTH_BUSY', 'The station is handling other account requests. Try again shortly.');
    }
    for (const [key, value] of sessions) if (value.until <= now) sessions.delete(key);
    if (sessions.size + openingSessions >= 2000) {
      throw new AppError(503, 'SESSION_LIMIT', 'Too many active sessions. Try again later.');
    }
    openingSessions++;
    try {
      return await open();
    } finally {
      openingSessions--;
    }
  }

  async function route(request, response) {
    if (localOnly && !/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(request.headers.host ?? '')) {
      throw new AppError(403, 'HOST_DENIED', 'Use the local AquaRefresh address.');
    }
    const method = request.method;
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!path.startsWith('/api/')) {
      if (serveFrontend && await serveAsset(response, method, path)) return;
      throw new AppError(404, 'NOT_FOUND', 'Page unavailable.');
    }

    const allowedOrigin = applyCors(request, response, clientUrl);
    if (method === 'OPTIONS') return preflight(request, response, allowedOrigin);
    if (method === 'GET' && path === '/api/health') return json(response, 200, { status: 'ok' });
    if (method !== 'GET' && method !== 'HEAD') checkOrigin(request, clientUrl, localOnly);

    const sid = readSessionId(request);
    const now = Date.now();
    const session = sessions.get(sid);
    const ownerSetupAllowed = localOnly && isLoopback(request.socket.remoteAddress);
    const ownerRegistrationOpen = (state) => ownerSetupAllowed && !state.accounts.some((entry) => entry.role === 'admin');
    const sessionView = (state, account) => ({
      role: account?.role ?? null,
      state: account ? viewState(state, account) : null,
      ownerRegistrationOpen: ownerRegistrationOpen(state),
      account: account ? publicAccount(account) : null,
    });

    function beginSession(account, remember, state, status) {
      sessions.delete(sid);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, { accountId: account.id, until: now + (remember ? 7 * daySeconds : sessionLife) * 1000 });
      setCookie(response, token, remember ? 7 * daySeconds : undefined, secureCookies);
      return json(response, status, sessionView(state, account));
    }

    if (path === '/api/register' && method === 'POST') {
      const payload = await readJson(request);
      if (payload.role === 'admin' && !ownerSetupAllowed) {
        throw new AppError(403, 'OWNER_REGISTRATION_LOCAL_ONLY', 'Create the station owner from the computer running AquaRefresh.');
      }
      return withSessionSlot(request, response, now, async () => {
        const account = await prepareAccount(payload);
        const saved = await store.change((state) => registerAccount(state, account));
        return beginSession(saved.result, false, saved.state, 201);
      });
    }

    const snapshot = await store.read();
    const account = session?.until > now ? snapshot.accounts.find((entry) => entry.id === session.accountId) : null;
    if (session && !account) sessions.delete(sid);
    const role = account?.role;
    const expectedAccount = request.headers['x-aqua-account'];
    if (expectedAccount !== undefined && method !== 'GET' && expectedAccount !== account?.id) {
      throw new AppError(409, 'SESSION_CHANGED', 'The active account changed in another tab. Review your session before continuing.');
    }
    if (path === '/api/session') {
      if (method === 'GET') return json(response, 200, sessionView(snapshot, account));
      if (method === 'POST') {
        const payload = await readJson(request);
        if (payload.remember !== undefined && typeof payload.remember !== 'boolean') {
          throw new AppError(400, 'VALIDATION_ERROR', 'Invalid remember preference.');
        }
        return withSessionSlot(request, response, now, async () => {
          const authenticated = await authenticate(snapshot.accounts, payload);
          const current = await store.read();
          return beginSession(current.accounts.find((entry) => entry.id === authenticated.id), payload.remember, current, 200);
        });
      }
      if (method === 'DELETE') {
        sessions.delete(sid);
        setCookie(response, '', 0, secureCookies);
        return json(response, 200, sessionView(snapshot, null));
      }
    }

    if (!account) throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to continue.');
    const requireRole = (expected) => {
      if (role !== expected) throw new AppError(403, 'FORBIDDEN', 'Your account cannot perform this action.');
    };
    const change = async (status, apply) => {
      const { state, result } = await store.change(apply);
      return json(response, status, { state: viewState(state, state.accounts.find((entry) => entry.id === account.id)), ...(result ? { order: result } : {}) });
    };

    if (method === 'GET' && path === '/api/state') return json(response, 200, { state: viewState(snapshot, account) });
    if (method === 'POST' && path === '/api/orders') {
      requireRole('customer');
      const payload = await readJson(request);
      return change(201, (state) => saveOrder(state, null, state.accounts.find((entry) => entry.id === account.id), payload));
    }

    const orderPath = path.match(/^\/api\/orders\/([1-9][0-9]{0,14})(\/status)?$/);
    if (method === 'PATCH' && orderPath) {
      const id = Number(orderPath[1]);
      const statusChange = orderPath[2];
      if (!statusChange) requireRole('customer');
      const payload = await readJson(request);
      return change(200, (state) => statusChange ? updateStatus(state, id, account, payload) : saveOrder(state, id, account, payload));
    }

    const inventoryPath = path.match(/^\/api\/inventory\/([a-z0-9-]{1,70})$/);
    if ((method === 'POST' && path === '/api/inventory') || (method === 'PATCH' && inventoryPath)) {
      requireRole('admin');
      const payload = await readJson(request);
      return change(method === 'POST' ? 201 : 200, (state) => saveInventory(state, inventoryPath?.[1] ?? null, payload));
    }

    if (method === 'PATCH' && path === '/api/profile') {
      requireRole('customer');
      const payload = await readJson(request);
      return change(200, (state) => saveProfile(state, account.id, payload));
    }
    throw new AppError(404, 'NOT_FOUND', 'Endpoint unavailable.');
  }

  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    try {
      await route(request, response);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const known = error instanceof AppError;
      if (!known) console.error('AquaRefresh request failed:', error.code ?? error.name);
      json(response, known ? error.status : 503, {
        error: { code: known ? error.code : 'SERVICE_UNAVAILABLE', message: known ? error.message : 'AquaRefresh is temporarily unavailable.' },
      });
    }
  });
}
