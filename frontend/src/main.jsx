import { createRoot } from 'react-dom/client';
import { Startup } from './Startup.jsx';
import '../style.css';

async function startPortal(root, session) {
  const { mountPortal } = await import('../app.js');
  if (root.isConnected) mountPortal(session);
}

createRoot(document.getElementById('portal-root')).render(<Startup startPortal={startPortal} />);
