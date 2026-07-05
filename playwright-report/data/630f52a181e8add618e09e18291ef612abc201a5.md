# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: billing.spec.js >> POS Layout Reordering >> allows entering, reordering categories/products, cancelling and saving
- Location: tests\e2e\billing.spec.js:177:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("Edit Layout")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("Edit Layout")')

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
  242 |           ],
  243 |           workers: [],
  244 |           settings: {},
  245 |           next_bill_number: 1
  246 |         })
  247 |       });
  248 |     });
  249 | 
  250 |     // Mock the reorder API endpoints
  251 |     let categoriesReordered = false;
  252 |     let productsReordered = false;
  253 | 
  254 |     await page.route("**/api/categories/reorder", async (route) => {
  255 |       categoriesReordered = true;
  256 |       await route.fulfill({
  257 |         status: 200,
  258 |         contentType: "application/json",
  259 |         body: JSON.stringify({ success: true, message: "Categories reordered successfully" })
  260 |       });
  261 |     });
  262 | 
  263 |     await page.route("**/api/products/reorder", async (route) => {
  264 |       productsReordered = true;
  265 |       await route.fulfill({
  266 |         status: 200,
  267 |         contentType: "application/json",
  268 |         body: JSON.stringify({ success: true, message: "Products reordered successfully" })
  269 |       });
  270 |     });
  271 | 
  272 |     await goToBillingScreen(page);
  273 | 
  274 |     // 2. Locate and click "Edit Layout" button
  275 |     const editLayoutBtn = page.locator('button:has-text("Edit Layout")');
> 276 |     await expect(editLayoutBtn).toBeVisible();
      |                                 ^ Error: expect(locator).toBeVisible() failed
  277 |     await editLayoutBtn.click();
  278 | 
  279 |     // 3. Verify Edit Mode indicators
  280 |     const cancelBtn = page.locator('button:has-text("Cancel")');
  281 |     const doneBtn = page.locator('button:has-text("Done")');
  282 |     await expect(cancelBtn).toBeVisible();
  283 |     await expect(doneBtn).toBeVisible();
  284 | 
  285 |     // 4. Click Cancel and verify we exit Edit Mode
  286 |     await cancelBtn.click();
  287 |     await expect(editLayoutBtn).toBeVisible();
  288 |     await expect(doneBtn).not.toBeVisible();
  289 | 
  290 |     // 5. Enter Edit Mode again and click Done to verify reordering persistence
  291 |     await editLayoutBtn.click();
  292 |     await doneBtn.click();
  293 | 
  294 |     // Verify the APIs were triggered on Done click
  295 |     expect(categoriesReordered).toBe(true);
  296 |     expect(productsReordered).toBe(true);
  297 |   });
  298 | });
  299 | 
```