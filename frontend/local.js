import { mountPortal } from './app.js';
import { connectSession } from './session.js';

const root = document.getElementById('app');

async function openPortal() {
  root.innerHTML = '<main class="content connection"><section class="panel stack"><h1>AquaRefresh</h1><p role="status">Starting the station server. If it was asleep, this can take up to 90 seconds.</p></section></main>';
  try {
    mountPortal(await connectSession());
  } catch {
    root.innerHTML = '<main class="content connection"><section class="panel stack"><h1>AquaRefresh</h1><p role="alert">We couldn’t reach the station server. Check your connection and try again.</p><button class="btn" type="button">Try again</button></section></main>';
    root.querySelector('button').addEventListener('click', openPortal, { once: true });
  }
}

void openPortal();
