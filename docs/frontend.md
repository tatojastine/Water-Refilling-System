# Frontend developer work log

The browser renders customer and station screens, keeps the current cart draft, and calls the same-origin API. The hero image and familiar checkout flow carry forward.

| Change | What the user sees |
| --- | --- |
| Local owner setup | The owner registration option is available from the local setup page until the station has an owner. |
| Separate customer accounts | Customers sign up with an email and password and see their own profile and orders. |
| Light and dark appearance | The theme switch saves a browser preference and works on the sign-in and app screens. |
| Clean starting screens | The owner sees empty order and supply lists. Refill products become available when the owner adds stock. |
| Checkout and inventory safeguards | In-flight requests are guarded. A stale inventory update prompts the owner to review the current stock. |

`frontend/index.html` loads the application. `frontend/app.js` renders views and manages forms and the draft cart. `frontend/api.js` wraps requests and API errors. `frontend/style.css` defines the light and dark palettes. The server confirms checkout totals and permissions.

See the [manual browser walkthrough](testing.md#manual-browser-walkthrough) for registration, ordering, and theme changes.
