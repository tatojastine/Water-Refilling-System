# Backend developer work log

The Node backend owns account identity, order ownership, pricing, stock, and order transitions. One server process serializes writes and commits changes by replacing the JSON data file.

## Account and data changes

| Area | Implementation |
| --- | --- |
| Owner setup | Exactly one station owner can register. The server must be bound to loopback and the client must be local for owner registration. |
| Customer accounts | Each customer registers an email and password and receives their own identifier and profile. Orders keep the placing customer's identifier. |
| Credentials | The server hashes passwords of 12 to 128 characters with scrypt and per-account salts. HttpOnly session cookies identify a signed-in browser. Server restart clears in-memory sessions. |
| Starting records | The catalog contains three refill products with prices and zero available stock. Users, orders, and station supplies start empty. |
| Storage | The default path is `backend/data/accounts-state.json`. Set `AQUA_DATA_FILE` to use another path. Older demo JSON is rejected with a message if explicitly supplied. |

`backend/server.mjs` serves assets and routes. `backend/accounts.mjs` handles credentials and registration. `backend/domain.mjs` owns business rules. `backend/store.mjs` loads and commits data.

## API reference

Requests use JSON. A failure returns `{"error":{"code":"…","message":"…"}}`.

| Request | Access | Success |
| --- | --- | --- |
| `GET /api/health` | Any | 200 after the store loads |
| `GET /api/session` | Any | 200 with `{role,state,ownerRegistrationOpen,account}` |
| `POST /api/register` | Customer signup or one-time local owner setup | 201, creates an account and starts a session |
| `POST /api/session` | Valid email and password | 200, starts a session |
| `DELETE /api/session` | Any | 200, ends the session and clears its cookie |
| `GET /api/state` | Signed in | 200 with role-filtered `{state}` |
| `POST /api/orders` | Customer | 201 with `{order,state}` |
| `PATCH /api/orders/:id` | Owning customer | 200 with `{order,state}` for a pending cash order |
| `PATCH /api/orders/:id/status` | Owning customer or owner | 200 with `{order,state}` for an allowed transition |
| `POST /api/inventory` | Owner | 201 with `{state}` |
| `PATCH /api/inventory/:id` | Owner | 200 with `{state}` |
| `PATCH /api/profile` | Customer | 200 with `{state}` |

- Register with `{role,name,email,password}`, using `admin` for the owner and `customer` for a customer. Sign in with `{login,password,remember?}` and the registered email as the login.
- A signed-in session returns `account: {id,name,email}`. Signed-out sessions have null role, state, and account fields. Customer state is scoped to that account and includes its account ID. The owner manages station inventory and all orders.
- Checkout sends `{items:[{id,qty}],method,address,payment,simulateFailure?}`. Prices come from the catalog. Delivery costs ₱20 unless the order includes a 5-gallon refill. Pickup is free. Simulated payment failure returns 422 without changing stock or orders.
- Creating an order reserves stock. Editing it changes the reservation. Cancelling a pending order releases the reservation. Fulfillment transitions use **On Delivery** for deliveries and **Ready for Pickup** for pickups before **Completed**.
- Inventory updates include numeric `expectedStock`. A 409 means another change already updated the quantity. Existing refill names and units stay fixed.
- Browser writes send the active account ID in X-Aqua-Account. The API returns 409 if a different account now owns the session in that browser.

Run one server process per data file. Keep account data and backups outside publicly accessible paths.
