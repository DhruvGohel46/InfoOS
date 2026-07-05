# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: billing.spec.js >> Billing Screen >> app loads without crashing
- Location: tests\e2e\billing.spec.js:33:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#root')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#root')

```

# Page snapshot

```yaml
- main [ref=e2]:
  - heading "Index of build/" [level=1] [ref=e4]:
    - text: Index of
    - link "build/" [ref=e5] [cursor=pointer]:
      - /url: /
  - list [ref=e6]:
    - listitem [ref=e7]:
      - link "assets/" [ref=e8] [cursor=pointer]:
        - /url: \assets/
    - listitem [ref=e9]:
      - link "favicon.ico" [ref=e10] [cursor=pointer]:
        - /url: \favicon.ico
    - listitem [ref=e11]:
      - link "logo.png" [ref=e12] [cursor=pointer]:
        - /url: \logo.png
    - listitem [ref=e13]:
      - link "logo192.png" [ref=e14] [cursor=pointer]:
        - /url: \logo192.png
    - listitem [ref=e15]:
      - link "logo512.png" [ref=e16] [cursor=pointer]:
        - /url: \logo512.png
    - listitem [ref=e17]:
      - link "manifest.json" [ref=e18] [cursor=pointer]:
        - /url: \manifest.json
    - listitem [ref=e19]:
      - link "sounds/" [ref=e20] [cursor=pointer]:
        - /url: \sounds/
```

# Test source

```ts
  1   | // @ts-check
  2   | const { test, expect } = require("@playwright/test");
  3   | 
  4   | /**
  5   |  * E2E tests for the InfoBill billing screen.
  6   |  *
  7   |  * These tests run against the React dev server (http://localhost:3050).
  8   |  * The backend must be running at http://localhost:5050 for full integration.
  9   |  * For CI, the backend is mocked via route intercepts where needed.
  10  |  */
  11  | 
  12  | // ─── Helpers ──────────────────────────────────────────────────────────────────
  13  | 
  14  | /**
  15  |  * Navigate to the POS billing screen and wait for it to load.
  16  |  * @param {import('@playwright/test').Page} page
  17  |  */
  18  | async function goToBillingScreen(page) {
  19  |   await page.goto("/");
  20  |   // Wait for the app shell to render
  21  |   await page.waitForSelector("body", { timeout: 10_000 });
  22  | 
  23  |   // Click on the "Bill" or "POS" nav item — adjust selector to match your sidebar
  24  |   const billingLink = page.locator('[data-testid="nav-bill"], a[href*="bill"], button:has-text("Bill")').first();
  25  |   if (await billingLink.isVisible()) {
  26  |     await billingLink.click();
  27  |   }
  28  | }
  29  | 
  30  | // ─── Tests ────────────────────────────────────────────────────────────────────
  31  | 
  32  | test.describe("Billing Screen", () => {
  33  |   test("app loads without crashing", async ({ page }) => {
  34  |     /**
  35  |      * Smoke test: the React app should load with no uncaught JS errors.
  36  |      */
  37  |     /** @type {string[]} */
  38  |     const errors = [];
  39  |     page.on("pageerror", (err) => errors.push(err.message));
  40  | 
  41  |     await page.goto("/");
  42  |     await page.waitForLoadState("domcontentloaded");
  43  | 
  44  |     // No JS crashes
  45  |     expect(errors).toHaveLength(0);
  46  | 
  47  |     // Some root element should be visible
  48  |     const root = page.locator("#root");
> 49  |     await expect(root).toBeVisible();
      |                        ^ Error: expect(locator).toBeVisible() failed
  50  |   });
  51  | 
  52  |   test("billing page renders product list", async ({ page }) => {
  53  |     /**
  54  |      * The billing screen should display at least one product card
  55  |      * or a loading/empty state — it must not be a blank screen.
  56  |      */
  57  |     // Intercept the products API so this test works without a live backend
  58  |     await page.route("**/api/products**", async (route) => {
  59  |       await route.fulfill({
  60  |         status: 200,
  61  |         contentType: "application/json",
  62  |         body: JSON.stringify({
  63  |           success: true,
  64  |           products: [
  65  |             {
  66  |               product_id: "TEST-1",
  67  |               name: "Test Burger",
  68  |               price: 100,
  69  |               category: "Food",
  70  |               active: true,
  71  |             },
  72  |           ],
  73  |         }),
  74  |       });
  75  |     });
  76  | 
  77  |     await goToBillingScreen(page);
  78  | 
  79  |     // Wait for either a product card OR an empty/loading state
  80  |     const productOrEmpty = page.locator(
  81  |       '[data-testid="product-card"], [data-testid="empty-products"], .product-card, .product-item'
  82  |     );
  83  |     // Give it up to 8s to appear
  84  |     await productOrEmpty.first().waitFor({ timeout: 8_000 }).catch(() => {});
  85  | 
  86  |     // Page must not be blank
  87  |     const bodyText = await page.locator("body").innerText();
  88  |     expect(bodyText.length).toBeGreaterThan(10);
  89  |   });
  90  | 
  91  |   test("offline bill queuing — shows toast when backend is down", async ({ page }) => {
  92  |     /**
  93  |      * Simulate the backend being unreachable:
  94  |      * - Block all /api/bill/create requests
  95  |      * - Try to save a bill
  96  |      * - Expect an offline/error notification to appear
  97  |      */
  98  |     // Block all bill creation requests
  99  |     await page.route("**/api/bill/create", async (route) => {
  100 |       await route.abort("failed");
  101 |     });
  102 | 
  103 |     // Also intercept products to return one item
  104 |     await page.route("**/api/products**", async (route) => {
  105 |       await route.fulfill({
  106 |         status: 200,
  107 |         contentType: "application/json",
  108 |         body: JSON.stringify({
  109 |           success: true,
  110 |           products: [
  111 |             {
  112 |               product_id: "TEST-1",
  113 |               name: "Test Burger",
  114 |               price: 100,
  115 |               category: "Food",
  116 |               active: true,
  117 |             },
  118 |           ],
  119 |         }),
  120 |       });
  121 |     });
  122 | 
  123 |     await goToBillingScreen(page);
  124 | 
  125 |     // Try to click the save/checkout button if visible
  126 |     const saveBtn = page.locator(
  127 |       '[data-testid="save-bill"], button:has-text("Save"), button:has-text("Checkout"), button:has-text("Bill")'
  128 |     ).first();
  129 | 
  130 |     if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
  131 |       await saveBtn.click();
  132 | 
  133 |       // Wait for any toast/notification to appear
  134 |       const toast = page.locator(
  135 |         '[data-testid="toast"], .toast, .notification, [role="alert"]'
  136 |       );
  137 |       await toast.first().waitFor({ timeout: 5_000 }).catch(() => {});
  138 |     }
  139 | 
  140 |     // Test passes as long as the page didn't crash
  141 |     await expect(page.locator("#root")).toBeVisible();
  142 |   });
  143 | });
  144 | 
  145 | test.describe("Navigation", () => {
  146 |   test("all main nav links are reachable", async ({ page }) => {
  147 |     /**
  148 |      * Click through main navigation items and verify no JS errors occur.
  149 |      */
```