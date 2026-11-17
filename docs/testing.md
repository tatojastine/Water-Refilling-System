# Tests and acceptance checks

Run `npm test` from the project folder with Node.js 24. The suite starts an HTTP server with a disposable data file. Use the IPC transport if loopback TCP is restricted.

```powershell
$env:AQUA_TEST_TRANSPORT = 'ipc'
npm test
Remove-Item Env:AQUA_TEST_TRANSPORT
```

## Automated coverage

| Scenario | Expected result |
| --- | --- |
| Owner bootstrap | A fresh station allows one local owner registration. Remote and repeated attempts are denied. |
| Account isolation | Customers have distinct profiles and can view or update only their own orders. An older tab cannot write on behalf of an account that signed in later. |
| Authentication | Register, sign out, and sign in with registered credentials. Shared demo sign-in is rejected. Email is normalized and stored credential fields stay out of API responses. |
| Clean starting state | Three refill products are listed with zero stock. Orders and station supplies are empty. |
| Legacy data | An explicitly supplied old demo file is rejected and preserved. |
| Checkout and stock | The API confirms prices, reserves stock, rejects stock conflicts, and releases cancelled reservations. |
| Simulated payment | Failed GCash simulation leaves orders and stock unchanged. A retry can place the order. |
| Fulfillment and restart | Delivery and pickup follow their own transitions. Accounts and station data survive a restart. |

## Verification record

| Check | Result | Evidence |
| --- | --- | --- |
| HTTP regression suite | **PASS** | Node.js 24.21.0 on Windows over IPC. 18 passed, 0 failed, 0 skipped. |
| Local owner connection rule | **PASS** | Named-pipe tests injected peer address metadata to exercise the loopback rule. |
| Real browser walkthrough | **NOT RUN** | Browser layout, keyboard interaction, and theme rendering remain unverified in a real browser. |

## Manual browser walkthrough

Use the [local start instructions](../README.md) with an empty working data file. Use fictional details. For a disposable run, set the following before starting:

```powershell
$env:AQUA_DATA_FILE = Join-Path $env:TEMP ("aqua-" + [guid]::NewGuid() + ".json")
npm start
```

1. Open [AquaRefresh](http://127.0.0.1:8765). Select **Set up as station owner**, create an account, and check that orders and supplies are empty, and add stock to a refill size.
2. Sign out. Verify that customer signup remains available and the owner signup option is closed. Create a customer account.
3. Switch between light and dark mode. Reload and sign out. Verify the selected theme persists in the same browser.
4. Place a delivery order using a stocked refill. Simulate a GCash failure and retry. Open My orders and check that exactly one new order appears.
5. Sign out and create a second customer account using another email. Check that its order list is empty and its profile belongs to the second account.
6. Sign in again as the owner. Move the first customer's delivery to **On Delivery**, then **Completed**. Reload and verify that the order stays completed.
7. Try the sign-in and checkout screens using Tab and Enter. Repeat on a narrow screen to check forms, navigation, and order tables.
