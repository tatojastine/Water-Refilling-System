import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Agent } from 'node:http';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import supertest from 'supertest';
import { expect, test, vi } from 'vitest';
import { createApp } from '../app.mjs';

async function getHealth(app) {
  if (process.env.AQUA_TEST_TRANSPORT !== 'ipc') {
    return supertest(app).get('/api/health');
  }

  // Restricted test environments can use real HTTP over local IPC instead of TCP.
  const name = `aqua-health-${randomUUID()}`;
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`);
  const agent = new Agent();
  agent.createConnection = () => createConnection(socketPath);
  try {
    const ready = once(app, 'listening');
    app.listen(socketPath);
    await ready;
    return await supertest('http://127.0.0.1').get('/api/health').agent(agent);
  } finally {
    agent.destroy();
    if (app.listening) await new Promise((resolve) => app.close(resolve));
  }
}

test('B-T3 GET /api/health returns 200 and exact status without storage access', async () => {
  const failIfCalled = () => { throw new Error('Health must not require a data store'); };
  const store = { read: vi.fn(failIfCalled), change: vi.fn(failIfCalled) };
  const app = createApp({ store });

  const response = await getHealth(app);

  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/^application\/json/);
  expect(response.body).toEqual({ status: 'ok' });
  expect(store.read).not.toHaveBeenCalled();
  expect(store.change).not.toHaveBeenCalled();
});
