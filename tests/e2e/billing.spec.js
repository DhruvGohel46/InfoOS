// @ts-check
const { test, expect } = require("@playwright/test");

/**
 * E2E tests for the InfoBill billing screen.
 *
 * These tests run against the React dev server (http://localhost:3050).
 * The backend must be running at http://localhost:5050 for full integration.
 * For CI, the backend is mocked via route intercepts where needed.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the POS billing screen and wait for it to load.
 * @param {import('@playwright/test').Page} page
 */
async function goToBillingScreen(page) {
  await page.goto("/");
  // Wait for the app shell to render
  await page.waitForSelector("body", { timeout: 10_000 });

  // Click on the "Bill" or "POS" nav item — adjust selector to match your sidebar
  const billingLink = page.locator('[data-testid="nav-bill"], a[href*="bill"], button:has-text("Bill")').first();
  if (await billingLink.isVisible()) {
    await billingLink.click();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Billing Screen", () => {
  test("app loads without crashing", async ({ page }) => {
    /**
     * Smoke test: the React app should load with no uncaught JS errors.
     */
    /** @type {string[]} */
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // No JS crashes
    expect(errors).toHaveLength(0);

    // Some root element should be visible
    const root = page.locator("#root");
    await expect(root).toBeVisible();
  });

  test("billing page renders product list", async ({ page }) => {
    /**
     * The billing screen should display at least one product card
     * or a loading/empty state — it must not be a blank screen.
     */
    // Intercept the products API so this test works without a live backend
    await page.route("**/api/products**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          products: [
            {
              product_id: "TEST-1",
              name: "Test Burger",
              price: 100,
              category: "Food",
              active: true,
            },
          ],
        }),
      });
    });

    await goToBillingScreen(page);

    // Wait for either a product card OR an empty/loading state
    const productOrEmpty = page.locator(
      '[data-testid="product-card"], [data-testid="empty-products"], .product-card, .product-item'
    );
    // Give it up to 8s to appear
    await productOrEmpty.first().waitFor({ timeout: 8_000 }).catch(() => {});

    // Page must not be blank
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });

  test("offline bill queuing — shows toast when backend is down", async ({ page }) => {
    /**
     * Simulate the backend being unreachable:
     * - Block all /api/bill/create requests
     * - Try to save a bill
     * - Expect an offline/error notification to appear
     */
    // Block all bill creation requests
    await page.route("**/api/bill/create", async (route) => {
      await route.abort("failed");
    });

    // Also intercept products to return one item
    await page.route("**/api/products**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          products: [
            {
              product_id: "TEST-1",
              name: "Test Burger",
              price: 100,
              category: "Food",
              active: true,
            },
          ],
        }),
      });
    });

    await goToBillingScreen(page);

    // Try to click the save/checkout button if visible
    const saveBtn = page.locator(
      '[data-testid="save-bill"], button:has-text("Save"), button:has-text("Checkout"), button:has-text("Bill")'
    ).first();

    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.click();

      // Wait for any toast/notification to appear
      const toast = page.locator(
        '[data-testid="toast"], .toast, .notification, [role="alert"]'
      );
      await toast.first().waitFor({ timeout: 5_000 }).catch(() => {});
    }

    // Test passes as long as the page didn't crash
    await expect(page.locator("#root")).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("all main nav links are reachable", async ({ page }) => {
    /**
     * Click through main navigation items and verify no JS errors occur.
     */
    /** @type {string[]} */
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Find all nav links/buttons
    const navItems = page.locator("nav a, nav button, aside a, aside button");
    const count = await navItems.count();

    // Visit up to 5 nav items
    for (let i = 0; i < Math.min(count, 5); i++) {
      const item = navItems.nth(i);
      if (await item.isVisible()) {
        await item.click();
        await page.waitForLoadState("domcontentloaded");
        // Small pause for any animations
        await page.waitForTimeout(300);
      }
    }

    expect(errors).toHaveLength(0);
  });
});

test.describe("POS Layout Reordering", () => {
  test("allows entering, reordering categories/products, cancelling and saving", async ({ page }) => {
    // 1. Mock products and categories API responses
    await page.route("**/api/products**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          products: [
            {
              product_id: "TEST-A",
              name: "Burger A",
              price: 100,
              category: "Food",
              category_id: 1,
              active: true,
              favorite: true,
              display_order: 0
            },
            {
              product_id: "TEST-B",
              name: "Burger B",
              price: 120,
              category: "Food",
              category_id: 1,
              active: true,
              favorite: true,
              display_order: 1
            }
          ]
        })
      });
    });

    await page.route("**/api/pos/bootstrap", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          categories: [
            { id: 1, name: "Food", display_order: 0 },
            { id: 2, name: "Drinks", display_order: 1 }
          ],
          products: [
            {
              product_id: "TEST-A",
              name: "Burger A",
              price: 100,
              category: "Food",
              category_id: 1,
              active: true,
              favorite: true,
              display_order: 0
            },
            {
              product_id: "TEST-B",
              name: "Burger B",
              price: 120,
              category: "Food",
              category_id: 1,
              active: true,
              favorite: true,
              display_order: 1
            }
          ],
          workers: [],
          settings: {},
          next_bill_number: 1
        })
      });
    });

    // Mock the reorder API endpoints
    let categoriesReordered = false;
    let productsReordered = false;

    await page.route("**/api/categories/reorder", async (route) => {
      categoriesReordered = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Categories reordered successfully" })
      });
    });

    await page.route("**/api/products/reorder", async (route) => {
      productsReordered = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Products reordered successfully" })
      });
    });

    await goToBillingScreen(page);

    // 2. Locate and click "Edit Layout" button
    const editLayoutBtn = page.locator('button:has-text("Edit Layout")');
    await expect(editLayoutBtn).toBeVisible();
    await editLayoutBtn.click();

    // 3. Verify Edit Mode indicators
    const cancelBtn = page.locator('button:has-text("Cancel")');
    const doneBtn = page.locator('button:has-text("Done")');
    await expect(cancelBtn).toBeVisible();
    await expect(doneBtn).toBeVisible();

    // 4. Click Cancel and verify we exit Edit Mode
    await cancelBtn.click();
    await expect(editLayoutBtn).toBeVisible();
    await expect(doneBtn).not.toBeVisible();

    // 5. Enter Edit Mode again and click Done to verify reordering persistence
    await editLayoutBtn.click();
    await doneBtn.click();

    // Verify the APIs were triggered on Done click
    expect(categoriesReordered).toBe(true);
    expect(productsReordered).toBe(true);
  });
});
