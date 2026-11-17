# AquaRefresh

A water-refilling station app for customer orders, pickup and delivery, and station inventory.

## Start the app

1. Extract the archive and open the AquaRefresh-Refactored folder in VS Code.
2. From its terminal, run `npm start` with Node.js 24, then open [http://127.0.0.1:8765](http://127.0.0.1:8765).
3. Choose **Set up as station owner** on this computer and submit **Create owner account**. Use a password of at least 12 characters. Registration signs you in automatically. Only the first owner can register.
4. As the owner, open **Inventory** and set available stock for at least one refill size. The three refill sizes start with zero stock.
5. Sign out and choose **Create customer account**. Create a separate account to place an order. Return to the owner account to fulfill it.
6. Press **Ctrl+C** in the terminal to stop the app.

No package installation or API keys are required. The app starts with no users, orders, or station supplies. GCash remains a simulation.

| Folder | Responsibility |
| --- | --- |
| `frontend/` | Screens, theme, cart draft, and API client |
| `backend/` | Accounts, sessions, pricing, inventory, fulfillment, and storage |
| `tests/` | HTTP regression tests |
| `docs/` | Developer work logs, test instructions, and deployment plan |

## Guides

- [Frontend developer work log](docs/frontend.md)
- [Backend developer work log and API reference](docs/backend.md)
- [Tests and browser walkthrough](docs/testing.md)
- [Deployment plan and rollback](docs/deployment.md)

Run `npm test` from the project folder. The app stores accounts and records in `backend/data/accounts-state.json` by default. The old demo used a separate data file.
