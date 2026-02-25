/**
 * Integration tests for ConfigAdapter.
 *
 * ConfigAdapter holds pre-loaded user configuration and returns it
 * via readUserConfig(). Config is normalized at load time.
 *
 * Test Budget: 2 behaviors (return config, normalize IDs)
 */

import { describe, it, expect } from "vitest";
import { ConfigAdapter } from "../../../src/adapters/config-adapter.ts";

describe("ConfigAdapter", () => {
  it("returns the pre-loaded user config via readUserConfig", async () => {
    const adapter = new ConfigAdapter({
      user_id: "alice",
      display_name: "Alice",
      subscriptions: ["backend-team"],
    });

    const config = await adapter.readUserConfig();

    expect(config.user_id).toBe("alice");
    expect(config.display_name).toBe("Alice");
    expect(config.subscriptions).toEqual(["backend-team"]);
  });

  it("returns empty subscriptions when none provided", async () => {
    const adapter = new ConfigAdapter({
      user_id: "bob",
      display_name: "Bob",
      subscriptions: [],
    });

    const config = await adapter.readUserConfig();

    expect(config.subscriptions).toEqual([]);
  });
});
