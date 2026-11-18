# Deployment runbook

[Activity checklist](activity15.md) · [Testing](testing.md)

## Local

Use Node.js 24 and the commands in the [README](../README.md). The backend defaults to `http://127.0.0.1:8765` and the Vite frontend to `http://127.0.0.1:5173`. Set local backend `CLIENT_URL=http://127.0.0.1:5173` for the separate Vite frontend. Vite proxies browser requests beginning with `/api/` to the backend origin. Leave `MONGODB_URI` unset to use the local JSON store, or provide Atlas credentials to verify an Atlas run. For a dependency-free local demonstration, run `npm start` at the root with no `MONGODB_URI` and open port 8765 directly.

## Atlas M0 and owner bootstrap

1. In Atlas, create an M0 cluster and an application database user with access to the application database. Choose the same `MONGODB_DB` name for local bootstrap and Render. Allow your bootstrap machine's current outbound IP in the Atlas network access list.
2. Copy the backend environment example to an ignored `backend/.env`. Set `MONGODB_URI` to the real Atlas secret and `MONGODB_DB` to the selected name. Keep `HOST=127.0.0.1`. Leave `NODE_ENV` unset for this local run.
3. Start the backend with `npm --prefix backend start`. Open the local app and use **Set up as station owner** to create the first owner against Atlas. Add available stock for one refill. Confirm health, stop the local process, and remove temporary Atlas network access when it is no longer needed.
4. Use the same Atlas database in Render. Hosted owner registration is disabled, so verify owner login from the completed deployment before sharing its URL.

Create a deployment database user with scoped access and allow the approved Render outbound IPs in Atlas. Store the URI only in the host's environment settings and the ignored local file. [Atlas M0](https://www.mongodb.com/docs/atlas/tutorial/deploy-free-tier-cluster/) · [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)

## Render backend

Connect the verified GitHub repository to a Render Node web service tracking `main`. The root `render.yaml` describes the service.

- Set root directory `backend`, build command `npm ci`, start command `npm start`, and HTTP health path `/api/health`.
- Set `NODE_ENV=production`, `HOST=0.0.0.0`, `MONGODB_URI`, `MONGODB_DB`, and exact HTTPS `CLIENT_URL` for the final Netlify site. The platform sets `PORT`.
- After GitHub CI runs and branch protection is active, verify auto-deploy is **After CI Checks Pass**. Confirm the live health response and record the deploy commit. [Render web services](https://render.com/docs/web-services) · [Render deploys](https://render.com/docs/deploys) · [Render health checks](https://render.com/docs/health-checks)

## Netlify frontend

Connect the same repository and production branch. The root `netlify.toml` configures the `frontend` base, `npm run build` command, and `dist` publish directory. Set `VITE_API_URL` to the HTTPS **Render origin**, without a path or trailing slash. Vite emits a Netlify rewrite for `/api/*`. The browser requests the same Netlify origin, which allows session cookies to work without a third-party cookie dependency. [Netlify redirects and rewrites](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/)

## Gates and release evidence

Run both suites and a production build. Require the two GitHub Actions jobs, an up-to-date branch, and a partner approval before merging. Check that both hosts deployed the same main SHA. Verify the direct Render health URL first. Health reports process liveness and does not query Atlas. From the live Netlify origin, verify `GET /api/session`, sign in, create an order, and refresh to confirm Atlas persistence. Verify owner fulfillment and repeat on a phone using mobile data. On a cold start, let Render wake and use **Try again** if a request times out at the proxy. If the live frontend still fails after the service wakes, inspect both the browser Network panel and the Render logs before recording evidence. Capture environment screenshots with values hidden.

This is a release plan. Provider configuration, public URLs, GitHub history, and submission screenshots require verified evidence. Before an authorized rollback, confirm code compatibility with the current Atlas records or prepare a matching backup and reconcile intervening orders. Freeze the repository, live deployments, and environment after submitting.
