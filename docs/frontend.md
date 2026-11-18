# Frontend developer work log

`frontend/src/main.jsx` starts the React loading and recovery view. The refill portal renders customer and owner screens, manages the cart draft, and calls same-origin API routes. Vite provides local API forwarding and generates the Netlify API proxy rule for a hosted build. For the dependency-free local demo, the backend serves `frontend/local.html` and `frontend/local.js`. Both entry points use the same portal and session utilities.

| Area | Responsibility |
| --- | --- |
| Startup | Show the server wake-up message, explain connection failures, and retry the session request |
| Customer portal | Sign up, sign in, order, view fulfillment, and edit the customer profile |
| Owner portal | Search inventory, update availability, and advance station orders |
| Appearance | Keep light and dark preferences in the browser and use AquaRefresh's tab title and icon |
| Verification | Cover startup text, retry interaction, and error recovery with React Testing Library |

Use the [testing guide](testing.md) for UI evidence and [deployment runbook](deployment.md) for the API proxy settings.
