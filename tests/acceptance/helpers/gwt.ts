/**
 * Given-When-Then test helpers for acceptance tests.
 *
 * These provide lightweight structure for writing BDD-style tests
 * inside Vitest describe/it blocks without requiring Cucumber.
 *
 * Usage:
 *   it("customer places an order", async () => {
 *     await given("customer has items in cart", async () => { ... });
 *     await when("customer submits order", async () => { ... });
 *     await thenAssert("order is confirmed", async () => { ... });
 *   });
 *
 * Note: The "then" step is named thenAssert to avoid the module
 * being treated as a thenable (a module that exports `then` is
 * interpreted as a Promise-like object by dynamic import).
 */

/**
 * Execute a "Given" setup step. Throws with the step label on failure.
 */
export async function given(description: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (error) {
    throw new Error(
      `[Given] ${description} -- ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Execute a "When" action step. Throws with the step label on failure.
 */
export async function when(description: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (error) {
    throw new Error(
      `[When] ${description} -- ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Execute a "Then" assertion step. Throws with the step label on failure.
 *
 * Named thenAssert (not "then") because exporting "then" from a module
 * makes the module namespace object thenable, causing dynamic import()
 * to resolve to undefined instead of the module.
 */
export async function thenAssert(description: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (error) {
    throw new Error(
      `[Then] ${description} -- ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
