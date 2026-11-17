# Deployment plan

| Stage | Setup | Before moving forward |
| --- | --- | --- |
| Local setup | Run `npm start` with Node.js 24 on loopback. Register the owner and stock the catalog. | Verify customer registration, checkout, inventory, and fulfillment. |
| Controlled remote review | Run one Node process behind an access control layer, using HTTPS and fictional data. | Test access, health, account isolation, persistence after restart, and backup restoration. |
| Station production | Use PostgreSQL for application data and establish operational controls for accounts and staff. | Verify migrations, stock concurrency, recovery procedures, monitoring, and payment controls before handling real orders. |

## Local bootstrap and staging

Owner registration requires a loopback-bound server and local client. Bootstrap the owner from the local machine before enabling remote access. Keep the application and API under the same HTTPS origin when hosting remotely. Stop the server before copying the initialized data file to controlled staging. Protect the file and backups because they contain account and order records.

For example, Render web services require a listener on `0.0.0.0` and provide `PORT`. Use `npm start`, set `HOST=0.0.0.0`, `AQUA_ALLOW_NETWORK=1`, and `AQUA_SECURE_COOKIES=1`, and configure the HTTP health path as `/api/health`. Establish access control before sharing the service URL. Keep `AQUA_DATA_FILE` under a persistent disk mount and use one server process per file. [Web services](https://render.com/docs/web-services) · [Health checks](https://render.com/docs/health-checks) · [Persistent disks](https://render.com/docs/disks)

## Production milestones

1. Add email verification, account recovery, rate limits, and auditable staff access.
2. Move accounts, stock, and orders to PostgreSQL with transactional stock reservations. Test concurrent orders, backups, and restore.
3. Review access to customer addresses and other personal information. Establish data retention, HTTPS session settings, monitoring, and incident response.
4. Use a supported payment gateway only after validating signed callbacks, idempotency, and refund handling. GCash in this version is simulated.

## Data and rollback

This revision uses `backend/data/accounts-state.json` by default. Keep existing demo data separately. If an old demo JSON file is explicitly supplied through `AQUA_DATA_FILE`, the first request to `/api/health` or `/api/session` reports the incompatible format and preserves the file. A future migration needs an account-to-order mapping and inventory reconciliation.

Before an upgrade, stop writes and back up the matching code and data. If the health check or main customer flow fails after a release, restore the previous code. If the storage format changed, restore its matching backup and reconcile any intervening orders. This is a deployment proposal.
