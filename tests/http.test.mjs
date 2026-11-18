import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createApp } from '../backend/server.mjs';

function requestOverIpc(socketPath, path, method, headers, data) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ socketPath, path, method, headers, agent: false }, async (response) => {
      try {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), {
          status: response.statusCode,
          headers: response.headers,
        }));
      } catch (error) {
        reject(error);
      }
    });
    request.once('error', reject);
    request.end(data);
  });
}

const ownerInput = { role: 'admin', name: 'Station Owner', email: 'owner@example.test', password: 'Only a fixture passphrase 123!' };
const customerInput = { role: 'customer', name: 'First Customer', email: 'first@example.test', password: 'Another fixture passphrase 123!' };
const secondInput = { ...customerInput, name: 'Second Customer', email: 'second@example.test' };

async function fixture(t, { localOnly = true, initialData, ipcPeer = '127.0.0.1', clientUrl } = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'aquarefresh-test-'));
  const dataFile = join(folder, 'state.json');
  if (initialData !== undefined) await writeFile(dataFile, JSON.stringify(initialData));
  const useIpc = process.env.AQUA_TEST_TRANSPORT === 'ipc';
  let server;
  let base;
  let socketPath;

  async function stop() {
    if (!server?.listening) return;
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  async function start() {
    server = await createApp({ dataFile, localOnly, clientUrl });
    if (useIpc || ipcPeer !== '127.0.0.1') {
      // Named-pipe clients expose no IP. Inject peer metadata at the socket in this test server only.
      server.prependListener('request', (request) => {
        Object.defineProperty(request.socket, 'remoteAddress', { value: ipcPeer, configurable: true });
      });
    }
    const ready = once(server, 'listening');
    if (useIpc) {
      socketPath = process.platform === 'win32'
        ? `\\\\.\\pipe\\aquarefresh-test-${randomUUID()}` : join(folder, 'http.sock');
      server.listen(socketPath);
    } else {
      server.listen(0, '127.0.0.1');
    }
    await ready;
    base = socketPath ? 'http://localhost' : `http://127.0.0.1:${server.address().port}`;
  }

  t.after(async () => {
    try {
      await stop();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  await start();

  async function request(path, { method = 'GET', cookie, body, headers: customHeaders = {} } = {}) {
    const headers = { ...customHeaders };
    if (cookie) headers.cookie = cookie;
    if (method !== 'GET') headers.origin ??= base;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const data = body === undefined ? undefined : JSON.stringify(body);
    if (socketPath) return requestOverIpc(socketPath, path, method, { ...headers, host: 'localhost' }, data);
    return fetch(base + path, { method, headers, body: data });
  }

  async function api(path, options, expected = 200) {
    const response = await request(path, options);
    const data = await response.json();
    assert.equal(response.status, expected, `${options?.method ?? 'GET'} ${path}: ${JSON.stringify(data)}`);
    if (expected >= 400) {
      assert.equal(typeof data.error.code, 'string');
      assert.equal(typeof data.error.message, 'string');
    }
    return { ...data, headers: response.headers };
  }

  function session(result, role) {
    assert.equal(result.role, role);
    return { ...result, cookie: result.headers.get('set-cookie').split(';', 1)[0] };
  }

  async function register(input) {
    return session(await api('/api/register', { method: 'POST', body: input }, 201), input.role);
  }

  async function login({ role, email, password }, remember = false) {
    return session(await api('/api/session', { method: 'POST', body: { login: email, password, remember } }), role);
  }

  async function restock(admin, quantities) {
    let current = admin;
    for (const [id, count] of Object.entries(quantities)) {
      const updated = await api(`/api/inventory/${id}`, {
        cookie: current.cookie, method: 'PATCH', body: { stock: count, expectedStock: stock(current.state, id), min: 8 },
      });
      current = { ...current, state: updated.state };
    }
    return current;
  }

  return {
    request, api, login, register, restock, readData: () => readFile(dataFile, 'utf8'),
    restart: async () => { await stop(); await start(); },
  };
}

const refill = (qty = 1, extra = {}) => ({
  items: [{ id: 'medium', qty }], method: 'Delivery', address: 'Ligao City, Albay', payment: 'Cash', ...extra,
});

function stock(state, id = 'medium') {
  return state.inventory.find((item) => item.id === id).stock;
}

test('normal entry serves the frontend, hero asset and JSON health endpoint', async (t) => {
  const app = await fixture(t);
  const home = await app.request('/');
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /^text\/html/);
  assert.match(await home.text(), /<title>AquaRefresh[^<]*<\/title>/i);
  for (const [path, mediaType] of [['/app.js', /javascript/], ['/style.css', /text\/css/]]) {
    const response = await app.request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), mediaType);
    assert.ok((await response.text()).length > 0);
  }
  const asset = await app.request('/hero.png');
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /^image\/png/);
  assert.equal(Buffer.from(await asset.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
  assert.equal((await app.api('/api/health')).status, 'ok');
});

test('CORS allows only the configured frontend origin and same-origin proxy writes still work', async (t) => {
  const clientUrl = 'https://aquarefresh.example.test';
  const app = await fixture(t, { clientUrl });
  const unrelated = 'https://unrelated.example.test';
  const preflight = (origin) => app.request('/api/register', {
    method: 'OPTIONS', headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });

  const allowed = await preflight(clientUrl);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-origin'), clientUrl);
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.match(allowed.headers.get('vary') ?? '', /\borigin\b/i);

  const rejected = await preflight(unrelated);
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);

  const crossOrigin = await app.api('/api/register', {
    method: 'POST', body: customerInput, headers: { origin: clientUrl },
  }, 201);
  assert.equal(crossOrigin.headers.get('access-control-allow-origin'), clientUrl);
  assert.equal(crossOrigin.headers.get('access-control-allow-credentials'), 'true');
  await app.api('/api/register', { method: 'POST', body: secondInput, headers: { origin: unrelated } }, 403);

  const proxied = await app.api('/api/register', { method: 'POST', body: secondInput }, 201);
  assert.equal(proxied.account.email, secondInput.email);
});

test('registered email credentials, session cookies, logout, and role boundaries', async (t) => {
  const app = await fixture(t);
  const anonymous = await app.api('/api/session');
  assert.equal(anonymous.role, null);
  assert.equal(anonymous.account, null);
  assert.equal(anonymous.ownerRegistrationOpen, true);
  await app.api('/api/state', {}, 401);
  await app.api('/api/session', { method: 'POST', body: { login: 'customer@aquarefresh.demo', password: 'demo1234' } }, 401);
  await app.api('/api/session', { method: 'POST', body: { role: 'admin' } }, 401);
  const admin = await app.register(ownerInput);
  const registered = await app.register(customerInput);
  await app.api('/api/session', { method: 'POST', body: { login: customerInput.email, password: 'incorrect' } }, 401);
  const customer = await app.login({ ...customerInput, email: '  FIRST@EXAMPLE.TEST  ' }, true);
  assert.match(customer.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(customer.headers.get('set-cookie'), /SameSite=(?:Strict|Lax)/i);
  assert.match(customer.headers.get('set-cookie'), /Max-Age=\d+/i);
  const restored = await app.api('/api/session', customer);
  assert.equal(restored.role, 'customer');
  assert.deepEqual(restored.account, registered.account);
  assert.deepEqual(Object.keys(restored.account).sort(), ['email', 'id', 'name']);
  assert.equal(restored.state.accountId, restored.account.id);
  assert.equal(restored.ownerRegistrationOpen, false);
  assert.equal(admin.state.profile, null);
  assert.deepEqual(customer.state.orders, []);
  await app.api('/api/inventory', { ...customer, method: 'POST', body: { name: 'Other', unit: 'pcs', stock: 1, min: 0 } }, 403);
  await app.api('/api/orders', { ...admin, method: 'POST', body: refill() }, 403);
  await app.api('/api/session', { ...customer, method: 'DELETE' });
  await app.api('/api/state', customer, 401);
});

test('brand-new accounts start with no orders, supplies or sellable stock', async (t) => {
  const app = await fixture(t);
  const owner = await app.register(ownerInput);
  const customer = await app.register(customerInput);
  assert.deepEqual(owner.state.orders, []);
  assert.deepEqual(customer.state.orders, []);
  assert.deepEqual(owner.state.inventory.map(({ id, stock }) => [id, stock]), [['large', 0], ['medium', 0], ['small', 0]]);
  assert.deepEqual(customer.state.inventory, owner.state.inventory);
  const rejected = await app.api('/api/orders', { ...customer, method: 'POST', body: refill() }, 409);
  assert.equal(rejected.error.code, 'STOCK_CHANGED');
  assert.deepEqual((await app.api('/api/state', customer)).state, customer.state);
});

test('simultaneous owner setup allows exactly one owner and remains closed after restart', async (t) => {
  const app = await fixture(t);
  const challenger = { ...ownerInput, name: 'Another Owner', email: 'another-owner@example.test' };
  const candidates = [ownerInput, challenger];
  const results = await Promise.all(candidates.map((body) => app.request('/api/register', { method: 'POST', body })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
  const winnerIndex = results.findIndex(({ status }) => status === 201);
  const loserIndex = 1 - winnerIndex;
  const winner = await results[winnerIndex].json();
  assert.equal((await results[loserIndex].json()).error.code, 'OWNER_ALREADY_REGISTERED');
  await app.restart();
  const anonymous = await app.api('/api/session');
  assert.equal(anonymous.ownerRegistrationOpen, false);
  const repeated = await app.api('/api/register', { method: 'POST', body: candidates[loserIndex] }, 409);
  assert.equal(repeated.error.code, 'OWNER_ALREADY_REGISTERED');
  assert.deepEqual((await app.login(candidates[winnerIndex])).account, winner.account);
  const { email, password } = candidates[loserIndex];
  await app.api('/api/session', { method: 'POST', body: { login: email, password } }, 401);
});

test('owner setup is unavailable when the server runs in network mode', async (t) => {
  const clientUrl = 'https://aquarefresh.example.test';
  const app = await fixture(t, { localOnly: false, clientUrl });
  const headers = { origin: clientUrl };
  assert.equal((await app.api('/api/session')).ownerRegistrationOpen, false);
  const blocked = await app.api('/api/register', { method: 'POST', body: ownerInput, headers }, 403);
  assert.equal(blocked.error.code, 'OWNER_REGISTRATION_LOCAL_ONLY');
  const registered = await app.api('/api/register', { method: 'POST', body: customerInput, headers }, 201);
  assert.equal(registered.role, 'customer');
});

test('owner setup requires a local socket peer even when a request claims to be local', async (t) => {
  const app = await fixture(t, { ipcPeer: '192.0.2.42' });
  const headers = { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' };
  assert.equal((await app.api('/api/session', { headers })).ownerRegistrationOpen, false);
  const denied = await app.api('/api/register', { method: 'POST', body: ownerInput, headers }, 403);
  assert.equal(denied.error.code, 'OWNER_REGISTRATION_LOCAL_ONLY');
});

test('registration normalizes emails and keeps credentials out of API responses', async (t) => {
  const app = await fixture(t);
  await app.api('/api/register', { method: 'POST', body: { ...customerInput, password: 'short' } }, 400);
  const first = await app.register({ ...customerInput, email: '  FIRST@EXAMPLE.TEST  ' });
  assert.equal(first.account.email, customerInput.email);
  const duplicate = await app.api('/api/register', { method: 'POST', body: { ...secondInput, email: 'FIRST@example.test' } }, 409);
  assert.equal(duplicate.error.code, 'EMAIL_ALREADY_REGISTERED');
  const owner = await app.register(ownerInput);
  const second = await app.register(secondInput);
  assert.notEqual(first.account.id, second.account.id);
  for (const view of [first, second, owner, await app.api('/api/session', first), await app.api('/api/state', owner)]) {
    const serialized = JSON.stringify(view);
    assert.doesNotMatch(serialized, /"(?:password|passwordHash|passwordSalt|hash|salt)"\s*:/i);
    for (const { password } of [ownerInput, customerInput]) assert.ok(!serialized.includes(password));
  }
  const onDisk = await app.readData();
  for (const { password } of [ownerInput, customerInput]) assert.ok(!onDisk.includes(password));
});

test('customers see and mutate only their own profiles and orders', async (t) => {
  const app = await fixture(t);
  const owner = await app.restock(await app.register(ownerInput), { medium: 4 });
  const first = await app.register(customerInput);
  const second = await app.register(secondInput);
  const profile = { name: 'First Customer Updated', address: 'First address, Ligao' };
  await app.api('/api/profile', { ...first, method: 'PATCH', body: profile });
  const firstOrder = await app.api('/api/orders', { ...first, method: 'POST', body: refill(1, { address: profile.address }) }, 201);
  const secondOrder = await app.api('/api/orders', { ...second, method: 'POST', body: refill() }, 201);
  const requester = { ...second, method: 'PATCH', body: refill(2) };
  await app.api(`/api/orders/${firstOrder.order.id}`, requester, 404);
  await app.api(`/api/orders/${firstOrder.order.id}/status`, { ...requester, body: { status: 'Cancelled' } }, 404);

  const firstView = (await app.api('/api/state', first)).state;
  const secondView = (await app.api('/api/state', second)).state;
  const station = (await app.api('/api/state', owner)).state;
  assert.equal(firstView.accountId, first.account.id);
  assert.equal(secondView.accountId, second.account.id);
  assert.deepEqual(firstView.profile, profile);
  assert.deepEqual(secondView.profile, second.state.profile);
  assert.deepEqual(firstView.orders, [firstOrder.order]);
  assert.deepEqual(secondView.orders, [secondOrder.order]);
  assert.deepEqual(station.orders.map(({ id }) => id).sort(), [firstOrder.order.id, secondOrder.order.id].sort());
});

test('stale account writes cannot update the profile associated with a newer session', async (t) => {
  const app = await fixture(t);
  const first = await app.register(customerInput);
  const second = await app.register(secondInput);
  const request = { ...second, method: 'PATCH', body: { name: 'Changed name', address: 'Changed address' } };
  const stale = await app.api('/api/profile', {
    ...request, headers: { 'X-Aqua-Account': first.account.id },
  }, 409);
  assert.equal(stale.error.code, 'SESSION_CHANGED');
  assert.deepEqual((await app.api('/api/state', first)).state.profile, first.state.profile);
  assert.deepEqual((await app.api('/api/state', second)).state.profile, second.state.profile);
  const current = await app.api('/api/profile', { ...request, headers: { 'X-Aqua-Account': second.account.id } });
  assert.deepEqual(current.state.profile, request.body);
});

test('explicitly configured legacy data is rejected without being overwritten', async (t) => {
  const legacy = { inventory: [], orders: [], next: 1, profile: { name: 'Old account', address: '' } };
  const app = await fixture(t, { initialData: legacy });
  assert.equal((await app.api('/api/health')).status, 'ok');
  const rejected = await app.api('/api/session', {}, 503);
  assert.equal(rejected.error.code, 'LEGACY_DATA_FILE');
  assert.equal(await app.readData(), JSON.stringify(legacy));
});

test('cash delivery charges server prices, adjusts reservations on edit, and restores stock on cancel', async (t) => {
  const app = await fixture(t);
  await app.restock(await app.register(ownerInput), { medium: 12 });
  const session = await app.register(customerInput);
  const baseline = stock(session.state);
  const create = await app.api('/api/orders', {
    ...session,
    method: 'POST',
    body: refill(2, { items: [{ id: 'medium', qty: 2, price: 0.01 }], subtotal: 0, fee: 0, total: 0 }),
  }, 201);
  assert.equal(create.order.status, 'Pending');
  assert.equal(create.order.subtotal, 50);
  assert.equal(create.order.fee, 20);
  assert.equal(create.order.total, 70);
  assert.equal(stock(create.state), baseline - 2);

  const url = `/api/orders/${create.order.id}`;
  const edited = await app.api(url, { ...session, method: 'PATCH', body: refill(1, { method: 'Pickup' }) });
  assert.equal(edited.order.method, 'Pickup');
  assert.equal(edited.order.fee, 0);
  assert.equal(edited.order.total, 25);
  assert.equal(stock(edited.state), baseline - 1);

  const cancel = { ...session, method: 'PATCH', body: { status: 'Cancelled' } };
  const cancelled = await app.api(`${url}/status`, cancel);
  assert.equal(cancelled.order.status, 'Cancelled');
  assert.equal(stock(cancelled.state), baseline);
  await app.api(`${url}/status`, cancel, 409);
  assert.equal(stock((await app.api('/api/state', session)).state), baseline);
});

test('payment simulation failure leaves stock and order count intact, and retry succeeds', async (t) => {
  const app = await fixture(t);
  await app.restock(await app.register(ownerInput), { medium: 12 });
  const session = await app.register(customerInput);
  const pay = { ...session, method: 'POST', body: refill(1, { payment: 'GCash', simulateFailure: true }) };
  const failed = await app.api('/api/orders', pay, 422);
  assert.equal(failed.error.code, 'PAYMENT_FAILED');
  assert.deepEqual((await app.api('/api/state', session)).state, session.state);
  const success = await app.api('/api/orders', { ...pay, body: { ...pay.body, simulateFailure: false } }, 201);
  assert.equal(success.order.payment, 'GCash');
  assert.equal(success.state.orders.length, session.state.orders.length + 1);
  assert.equal(stock(success.state), stock(session.state) - 1);
  await app.api(`/api/orders/${success.order.id}`, { ...session, method: 'PATCH', body: refill(2) }, 409);
});

test('pickup and delivery advance only through their correct fulfillment states', async (t) => {
  const app = await fixture(t);
  const admin = await app.restock(await app.register(ownerInput), { large: 2 });
  const customer = await app.register(customerInput);
  for (const [method, next, other] of [
    ['Pickup', 'Ready for Pickup', 'On Delivery'],
    ['Delivery', 'On Delivery', 'Ready for Pickup'],
  ]) {
    const created = await app.api('/api/orders', {
      ...customer, method: 'POST', body: refill(1, { method, items: [{ id: 'large', qty: 1 }] }),
    }, 201);
    assert.equal(created.order.fee, 0);
    const path = `/api/orders/${created.order.id}/status`;
    const transition = (status, session = admin, expected = 200) => app.api(path, {
      ...session, method: 'PATCH', body: { status },
    }, expected);
    await transition('Completed', admin, 409);
    await transition(other, admin, 409);
    await transition(next, customer, 403);
    assert.equal((await transition(next)).order.status, next);
    const completed = await transition('Completed');
    assert.equal(completed.order.status, 'Completed');
    assert.ok(Number.isFinite(Date.parse(completed.order.completed)));
  }
});

test('simultaneous checkout requests can reserve the last item only once', async (t) => {
  const app = await fixture(t);
  await app.restock(await app.register(ownerInput), { medium: 1 });
  const first = await app.register(customerInput);
  const second = await app.register(secondInput);
  const submit = (session) => app.request('/api/orders', { ...session, method: 'POST', body: refill() });
  const results = await Promise.all([submit(first), submit(second)]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
  await Promise.all(results.map((response) => response.json()));
  const after = (await app.api('/api/state', first)).state;
  assert.equal(stock(after), 0);
  const other = (await app.api('/api/state', second)).state;
  assert.equal(after.orders.length + other.orders.length, 1);
});

test('invalid order and inventory input cannot mutate persisted state', async (t) => {
  const app = await fixture(t);
  const admin = await app.register(ownerInput);
  const customer = await app.register(customerInput);
  await app.api('/api/orders', { ...customer, method: 'POST', body: refill(1, { address: '   ' }) }, 400);
  await app.api('/api/orders', { ...customer, method: 'POST', body: refill(-3) }, 400);
  await app.api('/api/inventory/medium', { ...admin, method: 'PATCH', body: { stock: -1, min: 0, expectedStock: stock(admin.state) } }, 400);
  await app.api('/api/inventory/medium', { ...admin, method: 'PATCH', body: { stock: 8, min: 0 } }, 400);
  await app.api('/api/inventory', { ...admin, method: 'POST', body: { name: '3 Gallons', unit: 'pcs', stock: 5, min: 0 } }, 409);
  assert.deepEqual((await app.api('/api/state', admin)).state, admin.state);
});

test('pending and in-transit reservations reduce the maximum available stock', async (t) => {
  const app = await fixture(t);
  const admin = await app.restock(await app.register(ownerInput), { small: 2 });
  const customer = await app.register(customerInput);
  const order = await app.api('/api/orders', {
    ...customer, method: 'POST', body: refill(2, { items: [{ id: 'small', qty: 2 }], method: 'Pickup' }),
  }, 201);
  const setAvailable = (stock, expectedStock, expected = 200) => app.api('/api/inventory/small', {
    ...admin, method: 'PATCH', body: { stock, min: 8, expectedStock },
  }, expected);
  const statusPath = `/api/orders/${order.order.id}/status`;
  const advance = (status) => app.api(statusPath, { ...admin, method: 'PATCH', body: { status } });

  const afterOrder = stock(order.state, 'small');
  await setAvailable(999_999, afterOrder, 400);
  assert.equal(stock((await setAvailable(999_998, afterOrder)).state, 'small'), 999_998);
  await advance('Ready for Pickup');
  await setAvailable(999_999, 999_998, 400);
  await advance('Completed');
  assert.equal(stock((await setAvailable(1_000_000, 999_998)).state, 'small'), 1_000_000);
});

test('a stale inventory edit cannot overwrite a newer checkout reservation', async (t) => {
  const app = await fixture(t);
  const admin = await app.restock(await app.register(ownerInput), { medium: 12 });
  const customer = await app.register(customerInput);
  const expectedStock = stock(admin.state);
  const purchased = await app.api('/api/orders', { ...customer, method: 'POST', body: refill() }, 201);
  const update = { ...admin, method: 'PATCH', body: { stock: expectedStock + 1, min: 8, expectedStock } };
  const stale = await app.api('/api/inventory/medium', update, 409);
  assert.equal(stale.error.code, 'STOCK_CHANGED');
  const latest = (await app.api('/api/state', admin)).state;
  assert.equal(stock(latest), expectedStock - 1);
  assert.deepEqual(latest.orders.find(({ id }) => id === purchased.order.id), purchased.order);
  const saved = await app.api('/api/inventory/medium', {
    ...update, body: { ...update.body, stock: expectedStock, expectedStock: stock(latest) },
  });
  assert.equal(stock(saved.state), expectedStock);
});

test('orders, profile and inventory persist through a full server restart', async (t) => {
  const app = await fixture(t);
  const admin = await app.restock(await app.register(ownerInput), { medium: 12 });
  const customer = await app.register(customerInput);
  const profile = { name: 'Demo Tester', address: 'Ligao, Albay' };
  await app.api('/api/profile', { ...customer, method: 'PATCH', body: profile });
  const { state } = await app.api('/api/inventory', {
    ...admin, method: 'POST', body: { name: 'New bottle seals', unit: 'pcs', stock: 12, min: 10 },
  }, 201);
  const supply = state.inventory.find((item) => item.name === 'New bottle seals');
  const created = await app.api('/api/orders', { ...customer, method: 'POST', body: refill() }, 201);
  await app.restart();
  const persisted = await app.login(customerInput);
  const station = await app.login(ownerInput);
  assert.deepEqual(persisted.state.profile, profile);
  assert.equal(stock(station.state, supply.id), 12);
  assert.equal(stock(persisted.state), stock(created.state));
  assert.deepEqual(persisted.state.orders.find(({ id }) => id === created.order.id), created.order);
});
