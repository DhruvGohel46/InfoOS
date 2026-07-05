# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: billing.spec.js >> Billing Screen >> offline bill queuing — shows toast when backend is down
- Location: tests\e2e\billing.spec.js:91:3

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
  41  |     await page.goto("/");
  42  |     await page.waitForLoadState("domcontentloaded");
  43  | 
  44  |     // No JS crashes
  45  |     expect(errors).toHaveLength(0);
  46  | 
  47  |     // Some root element should be visible
  48  |     const root = page.locator("#root");
  49  |     await expect(root).toBeVisible();
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
> 141 |     await expect(page.locator("#root")).toBeVisible();
      |                                         ^ Error: expect(locator).toBeVisible() failed
  142 |   });
  143 | });
  144 | 
  145 | test.describe("Navigation", () => {
  146 |   test("all main nav links are reachable", async ({ page }) => {
  147 |     /**
  148 |      * Click through main navigation items and verify no JS errors occur.
  149 |      */
  150 |     /** @type {string[]} */
  151 |     const errors = [];
  152 |     page.on("pageerror", (err) => errors.push(err.message));
  153 | 
  154 |     await page.goto("/");
  155 |     await page.waitForLoadState("domcontentloaded");
  156 | 
  157 |     // Find all nav links/buttons
  158 |     const navItems = page.locator("nav a, nav button, aside a, aside button");
  159 |     const count = await navItems.count();
  160 | 
  161 |     // Visit up to 5 nav items
  162 |     for (let i = 0; i < Math.min(count, 5); i++) {
  163 |       const item = navItems.nth(i);
  164 |       if (await item.isVisible()) {
  165 |         await item.click();
  166 |         await page.waitForLoadState("domcontentloaded");
  167 |         // Small pause for any animations
  168 |         await page.waitForTimeout(300);
  169 |       }
  170 |     }
  171 | 
  172 |     expect(errors).toHaveLength(0);
  173 |   });
  174 | });
  175 | 
  176 | test.describe("POS Layout Reordering", () => {
  177 |   test("allows entering, reordering categories/products, cancelling and saving", async ({ page }) => {
  178 |     // 1. Mock products and categories API responses
  179 |     await page.route("**/api/products**", async (route) => {
  180 |       await route.fulfill({
  181 |         status: 200,
  182 |         contentType: "application/json",
  183 |         body: JSON.stringify({
  184 |           success: true,
  185 |           products: [
  186 |             {
  187 |               product_id: "TEST-A",
  188 |               name: "Burger A",
  189 |               price: 100,
  190 |               category: "Food",
  191 |               category_id: 1,
  192 |               active: true,
  193 |               favorite: true,
  194 |               display_order: 0
  195 |             },
  196 |             {
  197 |               product_id: "TEST-B",
  198 |               name: "Burger B",
  199 |               price: 120,
  200 |               category: "Food",
  201 |               category_id: 1,
  202 |               active: true,
  203 |               favorite: true,
  204 |               display_order: 1
  205 |             }
  206 |           ]
  207 |         })
  208 |       });
  209 |     });
  210 | 
  211 |     await page.route("**/api/pos/bootstrap", async (route) => {
  212 |       await route.fulfill({
  213 |         status: 200,
  214 |         contentType: "application/json",
  215 |         body: JSON.stringify({
  216 |           success: true,
  217 |           categories: [
  218 |             { id: 1, name: "Food", display_order: 0 },
  219 |             { id: 2, name: "Drinks", display_order: 1 }
  220 |           ],
  221 |           products: [
  222 |             {
  223 |               product_id: "TEST-A",
  224 |               name: "Burger A",
  225 |               price: 100,
  226 |               category: "Food",
  227 |               category_id: 1,
  228 |               active: true,
  229 |               favorite: true,
  230 |               display_order: 0
  231 |             },
  232 |             {
  233 |               product_id: "TEST-B",
  234 |               name: "Burger B",
  235 |               price: 120,
  236 |               category: "Food",
  237 |               category_id: 1,
  238 |               active: true,
  239 |               favorite: true,
  240 |               display_order: 1
  241 |             }
```