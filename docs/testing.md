# Tests and acceptance checks

Install locked dependencies from each app folder, then run these commands from the project root:

```powershell
npm --prefix backend test
npm --prefix frontend test
npm --prefix frontend run build
```

The backend uses Vitest and Supertest. Health routing is tested without connecting to Atlas. The frontend uses Vitest, jsdom, and React Testing Library to check the startup component. Use local synthetic fixtures and keep live data and secrets out of tests.

| ID | What the test covers |
| --- | --- |
| B-T1 | A well-formed email is accepted. |
| B-T2 | A malformed email is rejected. |
| B-T3 | Health returns HTTP 200 and exactly `{"status":"ok"}` without storage access. |
| B-T4 | A standard delivery includes the expected delivery fee. |
| B-T5 | A 5-gallon refill waives the delivery fee. |
| F-T1 | Startup shows AquaRefresh and the wake-up message. |
| F-T2 | Retry makes a new session request and opens the app on success. |
| F-T3 | A connection failure is explained and the UI offers recovery. |

## Verification record

| Check | Status | Evidence |
| --- | --- | --- |
| Core HTTP regression suite | PASS | 19 passed over Windows named pipes using the Node test runner. Coverage includes exact-origin CORS. |
| Required backend behaviors | PASS, independent checks | Five behaviors verified with Node. |
| Backend framework suite | NOT RUN | The five Vitest cases are authored. npm registry DNS blocked dependency installation. Obtain a passing Vitest run before S6. |
| Frontend framework and production build | NOT RUN | The three Testing Library cases are authored. npm registry DNS blocked dependency installation. Run both before S7 and before merging. |
| Hosted and browser evidence | Pending | Verify the live URLs and collect browser screenshots separately. |

Reproduce the supplemental HTTP run from the project root on Windows:

```powershell
$env:AQUA_TEST_TRANSPORT = 'ipc'
node --test tests/http.test.mjs
Remove-Item Env:AQUA_TEST_TRANSPORT
```

See the [Activity 15 checklist](activity15.md) for the intentionally red then green PR and the complete screenshot list.

## Manual browser checks

Start both local services from the README. Bootstrap one owner, check that orders and supplies are empty, stock a refill, and sign out. Use two customer accounts and confirm that their orders and profiles stay separate. Try a failed simulated GCash checkout, retry, then fulfill the successful order as owner. Refresh to confirm data stays saved.

Test a delayed request, an interrupted request and successful retry, an empty list, invalid form fields, keyboard input, and the app at 375 px. Check body-text contrast in both themes and inspect the actual title and favicon. Repeat the relevant checks on the deployed app and use mobile data on a real phone.
