# AquaRefresh

A water-refilling station portal for customer ordering, pickup and delivery, and station inventory.

## Live Links

| Resource | Status |
| --- | --- |
| Live frontend | Pending Netlify deployment and public URL verification |
| Live backend | Pending Render deployment and health check verification |
| GitHub repository | Add the actual repository URL after creating it |

## Team

Fill in the real names and GitHub usernames before submission. Link to the approved pull requests in the activity evidence.

| Member | Role | GitHub |
| --- | --- | --- |
| Member A (name pending) | Frontend, frontend tests, and architecture diagram | Pending |
| Member B (name pending) | Backend, backend tests, CI/CD, and pipeline diagram | Pending |

## Tech Stack

| Part | Technology | Hosted on |
| --- | --- | --- |
| Frontend | Vite, React, JavaScript, HTML, and CSS | Netlify planned |
| Backend | Node.js 24 and a JSON HTTP API | Render planned |
| Database | MongoDB | Atlas M0 planned |
| Tests | Vitest, Supertest, and React Testing Library | Local and GitHub Actions |
| CI/CD | GitHub Actions and protected main | GitHub |

## Run It on Your Laptop

1. Install Node.js 24.
2. If the working copy lacks either lockfile, generate it from the project folder with `npm --prefix backend install --package-lock-only` and `npm --prefix frontend install --package-lock-only`. Install the locked dependencies using `npm --prefix backend ci` and `npm --prefix frontend ci`. Run both suites and the frontend build before opening the PR that adds the lockfiles.
3. Copy `backend/.env.example` and `frontend/.env.example` to `.env` in their respective folders. Set `CLIENT_URL=http://127.0.0.1:5173` in `backend/.env`. For local JSON storage leave `MONGODB_URI` unset. For Atlas, allow your current IP and use an app-specific database user.
4. Run `npm --prefix backend start` in one terminal and `npm --prefix frontend run dev` in another. Open the Vite URL printed in the terminal.
5. On first setup, use **Set up as station owner** locally, create your account, and add stock to a refill product. Sign out and create a customer account to try checkout.

For a dependency-free local demo, leave `MONGODB_URI` unset, run `npm start` from the project root, and open [http://127.0.0.1:8765](http://127.0.0.1:8765). Use the separate Vite workflow above for the graded frontend build and tests.

Use fictional records for classroom testing. GCash is simulated.

## Environment Variables

| Name | What it is for | Example value |
| --- | --- | --- |
| `MONGODB_URI` | Backend Atlas connection string | `mongodb+srv://USER:PASSWORD@CLUSTER_HOST/` |
| `MONGODB_DB` | Backend database name | `aquarefresh` |
| `CLIENT_URL` | Exact trusted frontend origin on the backend | `https://aquarefresh.example.invalid` |
| `PORT` | Backend listener port. Render supplies its hosted value. | `8765` |
| `VITE_API_URL` | Frontend build/dev proxy target. Use a backend origin with no path. | `https://aquarefresh-api.example.invalid` |
| `HOST` | Backend bind address. Use loopback for initial owner setup. | `127.0.0.1` |
| `NODE_ENV` | Backend runtime mode | `production` on Render |

See the [deployment runbook](docs/deployment.md) for service settings and how to bootstrap the owner against the same Atlas database before enabling public access.

## Running the Tests

```powershell
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run build
```

The framework suites contain five required backend cases and three required frontend cases. Registry access prevented installing dependencies and running these framework suites in this session. See [test instructions](docs/testing.md) for coverage, verification evidence, and the red-to-green pull request requirement.

## How CI/CD Works

Pull requests run backend tests, frontend tests, and the frontend build. Require the checks and team approval before merge. Deployment follows a green push to the protected default branch. The backend health endpoint is `/api/health`. Hosted checks and public evidence are pending. Add the actual GitHub Actions tab link after the repository is created. Follow the [Activity 15 submission checklist](docs/activity15.md) in order.

## Diagrams

Add the team-authored, reviewed diagram links here before submitting. See the [Activity 15 checklist](docs/activity15.md) for the required evidence. Keep the deployment and data-flow diagrams consistent with the final live services.
