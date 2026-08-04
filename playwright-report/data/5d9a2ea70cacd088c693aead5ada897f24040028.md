# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: billing.spec.js >> POS Layout Reordering >> allows entering, reordering categories/products, cancelling and saving
- Location: tests\e2e\billing.spec.js:177:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e6]: Burger Bhau (Kohariya)
      - generic [ref=e7]:
        - generic [ref=e9] [cursor=pointer]:
          - img [ref=e12]
          - generic [ref=e15]: Bill
        - generic [ref=e17] [cursor=pointer]:
          - img [ref=e20]
          - generic [ref=e21]: Analytics
        - generic [ref=e23] [cursor=pointer]:
          - img [ref=e26]
          - generic [ref=e29]: Reminders
      - generic [ref=e30]:
        - button "Edit Menu" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
          - text: Edit Menu
        - button [ref=e35] [cursor=pointer]:
          - img [ref=e36]
    - generic [ref=e38]:
      - banner [ref=e39]:
        - generic [ref=e40]:
          - button "Start New Bill" [ref=e41] [cursor=pointer]
          - button "Calculator" [ref=e42] [cursor=pointer]:
            - img [ref=e43]
            - text: Calculator
        - heading "InfoOS (Burger Bhau (Kohariya))" [level=1] [ref=e46]:
          - text: InfoOS
          - generic [ref=e47]: (Burger Bhau (Kohariya))
        - generic [ref=e48]:
          - generic [ref=e49]:
            - img [ref=e50]
            - generic [ref=e62]: Tue, Aug 04
          - generic [ref=e63]:
            - generic "Worker mode active" [ref=e64]:
              - button "Owner" [ref=e66] [cursor=pointer]:
                - img [ref=e67]
                - text: Owner
              - button "Worker" [ref=e70] [cursor=pointer]:
                - img [ref=e71]
                - text: Worker
            - button "Open Notification Center" [ref=e74] [cursor=pointer]:
              - img [ref=e75]
            - button [ref=e78] [cursor=pointer]:
              - img [ref=e79]
      - main [ref=e82]:
        - generic [ref=e83]:
          - generic [ref=e84]:
            - generic [ref=e85]:
              - generic [ref=e87]:
                - generic:
                  - img
                - textbox "Search categories..." [ref=e88]
                - generic [ref=e89]:
                  - generic: /
              - button "All Groups" [ref=e93] [cursor=pointer]:
                - generic [ref=e95]: All Groups
                - img [ref=e97]
            - generic [ref=e99]:
              - heading "Categories" [level=4] [ref=e101]
              - generic [ref=e102]:
                - button "★ Favorites" [ref=e103] [cursor=pointer]:
                  - generic [ref=e106]: ★ Favorites
                - button "Burger" [ref=e107] [cursor=pointer]:
                  - generic [ref=e109]: Burger
                - button "Drinks" [ref=e110] [cursor=pointer]:
                  - generic [ref=e112]: Drinks
                - button "Glass" [ref=e113] [cursor=pointer]:
                  - generic [ref=e115]: Glass
                - button "Pizza" [ref=e116] [cursor=pointer]:
                  - generic [ref=e118]: Pizza
                - button "Juice" [ref=e119] [cursor=pointer]:
                  - generic [ref=e121]: Juice
                - button "Sandwich" [ref=e122] [cursor=pointer]:
                  - generic [ref=e124]: Sandwich
                - button "Cane" [ref=e125] [cursor=pointer]:
                  - generic [ref=e127]: Cane
                - button "French Fries" [ref=e128] [cursor=pointer]:
                  - generic [ref=e130]: French Fries
                - button "Garlic Bread" [ref=e131] [cursor=pointer]:
                  - generic [ref=e133]: Garlic Bread
                - button "Large" [ref=e134] [cursor=pointer]:
                  - generic [ref=e136]: Large
                - button "Other" [ref=e137] [cursor=pointer]:
                  - generic [ref=e139]: Other
                - button "Swaminarayan" [ref=e140] [cursor=pointer]:
                  - generic [ref=e142]: Swaminarayan
          - generic [ref=e144]:
            - generic [ref=e145]:
              - heading "★ Favorites" [level=2] [ref=e146]
              - button "Edit Layout" [ref=e148] [cursor=pointer]:
                - img [ref=e149]
                - text: Edit Layout
            - generic [ref=e153]:
              - generic [ref=e154]:
                - heading "Food" [level=3] [ref=e155]
                - generic [ref=e156]: (2)
              - generic [ref=e157]:
                - generic [ref=e159] [cursor=pointer]:
                  - img [ref=e162]
                  - heading "Burger A" [level=4] [ref=e166]
                  - generic [ref=e167]:
                    - generic [ref=e168]: ₹100
                    - img [ref=e170]
                - generic [ref=e173] [cursor=pointer]:
                  - img [ref=e176]
                  - heading "Burger B" [level=4] [ref=e180]
                  - generic [ref=e181]:
                    - generic [ref=e182]: ₹120
                    - img [ref=e184]
          - generic [ref=e186]:
            - generic [ref=e187]:
              - generic [ref=e188]:
                - heading "Current Bill0 items" [level=3] [ref=e189]:
                  - text: Current Bill
                  - generic [ref=e190]: 0 items
                - button "Clear All" [disabled] [ref=e191]:
                  - img [ref=e192]
                  - generic [ref=e195]: Clear All
              - generic [ref=e196]:
                - button "Dine In" [ref=e197] [cursor=pointer]
                - button "Takeaway" [ref=e198] [cursor=pointer]
              - generic [ref=e199]:
                - generic [ref=e200]: "Table Number:"
                - textbox "Optional (e.g. 5)" [ref=e201]
              - generic [ref=e202]:
                - img [ref=e204]
                - generic [ref=e207]: Your cart is empty
                - generic [ref=e208]: Add items to create a bill
            - generic [ref=e209]:
              - generic [ref=e210]:
                - generic [ref=e211]:
                  - img [ref=e213]
                  - generic [ref=e217]: Total Amount
                - generic [ref=e218]: ₹0
              - generic [ref=e219]:
                - button "Save Only" [ref=e220] [cursor=pointer]:
                  - img [ref=e222]
                  - text: Save Only
                - button "Print KOT" [ref=e224] [cursor=pointer]:
                  - img [ref=e226]
                  - text: Print KOT
                - button "Print Bill" [ref=e231] [cursor=pointer]:
                  - img [ref=e233]
                  - text: Print Bill
                - button "BILL & KOT" [ref=e236] [cursor=pointer]:
                  - img [ref=e237]
                  - text: BILL & KOT
  - generic [ref=e241]:
    - img [ref=e243]
    - generic [ref=e245]:
      - paragraph [ref=e246]: Success
      - paragraph [ref=e247]: Layout reordered successfully
    - button "Close notification" [ref=e248] [cursor=pointer]:
      - img [ref=e249]
```

# Test source

```ts
  208 |               name: "Burger B",
  209 |               price: 120,
  210 |               category: "Food",
  211 |               category_id: 1,
  212 |               active: true,
  213 |               favorite: true,
  214 |               display_order: 1
  215 |             }
  216 |           ]
  217 |         })
  218 |       });
  219 |     });
  220 | 
  221 |     await page.route("**/api/pos/bootstrap", async (route) => {
  222 |       await route.fulfill({
  223 |         status: 200,
  224 |         contentType: "application/json",
  225 |         body: JSON.stringify({
  226 |           success: true,
  227 |           categories: [
  228 |             { id: 1, name: "Food", display_order: 0 },
  229 |             { id: 2, name: "Drinks", display_order: 1 }
  230 |           ],
  231 |           products: [
  232 |             {
  233 |               product_id: "TEST-A",
  234 |               name: "Burger A",
  235 |               price: 100,
  236 |               category: "Food",
  237 |               category_id: 1,
  238 |               active: true,
  239 |               favorite: true,
  240 |               display_order: 0
  241 |             },
  242 |             {
  243 |               product_id: "TEST-B",
  244 |               name: "Burger B",
  245 |               price: 120,
  246 |               category: "Food",
  247 |               category_id: 1,
  248 |               active: true,
  249 |               favorite: true,
  250 |               display_order: 1
  251 |             }
  252 |           ],
  253 |           workers: [],
  254 |           settings: {},
  255 |           next_bill_number: 1
  256 |         })
  257 |       });
  258 |     });
  259 | 
  260 |     // Mock the reorder API endpoints
  261 |     let categoriesReordered = false;
  262 |     let productsReordered = false;
  263 | 
  264 |     await page.route("**/api/categories/reorder", async (route) => {
  265 |       categoriesReordered = true;
  266 |       await route.fulfill({
  267 |         status: 200,
  268 |         contentType: "application/json",
  269 |         body: JSON.stringify({ success: true, message: "Categories reordered successfully" })
  270 |       });
  271 |     });
  272 | 
  273 |     await page.route("**/api/products/reorder", async (route) => {
  274 |       productsReordered = true;
  275 |       await route.fulfill({
  276 |         status: 200,
  277 |         contentType: "application/json",
  278 |         body: JSON.stringify({ success: true, message: "Products reordered successfully" })
  279 |       });
  280 |     });
  281 | 
  282 |     await goToBillingScreen(page);
  283 | 
  284 |     // Wait for the product cards to render, guaranteeing state synchronization
  285 |     await expect(page.locator('text=Burger A').first()).toBeVisible();
  286 | 
  287 |     // 2. Locate and click "Edit Layout" button
  288 |     const editLayoutBtn = page.locator('button:has-text("Edit Layout")');
  289 |     await expect(editLayoutBtn).toBeVisible();
  290 |     await editLayoutBtn.click();
  291 | 
  292 |     // 3. Verify Edit Mode indicators
  293 |     const cancelBtn = page.locator('button:has-text("Cancel")');
  294 |     const doneBtn = page.locator('button:has-text("Done")');
  295 |     await expect(cancelBtn).toBeVisible();
  296 |     await expect(doneBtn).toBeVisible();
  297 | 
  298 |     // 4. Click Cancel and verify we exit Edit Mode
  299 |     await cancelBtn.click();
  300 |     await expect(editLayoutBtn).toBeVisible();
  301 |     await expect(doneBtn).not.toBeVisible();
  302 | 
  303 |     // 5. Enter Edit Mode again and click Done to verify reordering persistence
  304 |     await editLayoutBtn.click();
  305 |     await doneBtn.click();
  306 | 
  307 |     // Verify the APIs were triggered on Done click
> 308 |     expect(categoriesReordered).toBe(true);
      |                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  309 |     expect(productsReordered).toBe(true);
  310 | 
  311 |     // Assert that no uncaught runtime exceptions occurred during test execution
  312 |     expect(pageErrors).toHaveLength(0);
  313 |   });
  314 | });
  315 | 
```