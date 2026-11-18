import { request } from './api.js';

function pause(signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 3000);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function connectSession(cancellation) {
  const deadline = AbortSignal.timeout(90_000);
  const signal = cancellation ? AbortSignal.any([cancellation, deadline]) : deadline;
  while (!signal.aborted) {
    try {
      return await request('/session', 'GET', undefined, undefined, signal);
    } catch (error) {
      if (![502, 503, 504].includes(error.status)) throw error;
      // Netlify may time out while the Render instance is still waking.
      await pause(signal);
    }
  }
  signal.throwIfAborted();
}
