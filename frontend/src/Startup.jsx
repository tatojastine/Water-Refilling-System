import { useEffect, useRef, useState } from 'react';
import { connectSession } from '../session.js';

export function Startup({ connect = connectSession, startPortal }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  const portal = useRef(null);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await connect(controller.signal);
        if (!current) return;
        setSession(result);
        setStatus('ready');
      } catch {
        if (current) setStatus('error');
      }
    }
    void load();
    return () => { current = false; controller.abort(); };
  }, [attempt, connect]);

  useEffect(() => {
    if (status !== 'ready') return;
    let current = true;
    const root = portal.current;
    Promise.resolve()
      .then(() => startPortal(root, session))
      .catch(() => { if (current) setStatus('error'); });
    return () => { current = false; };
  }, [session, startPortal, status]);

  if (status === 'ready') return <div ref={portal} id="app" />;

  return (
    <main className="content connection">
      <section className="panel stack" aria-labelledby="connection-title">
        <h1 id="connection-title">AquaRefresh</h1>
        {status === 'loading' ? (
          <p role="status">Starting the station server. If it was asleep, this can take up to 90 seconds.</p>
        ) : (
          <>
            <p role="alert">We couldn’t reach the station server. Check your connection and try again.</p>
            <button type="button" className="btn" onClick={() => { setStatus('loading'); setAttempt((value) => value + 1); }}>
              Try again
            </button>
          </>
        )}
      </section>
    </main>
  );
}
