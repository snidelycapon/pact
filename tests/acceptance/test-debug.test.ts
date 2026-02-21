import { describe, it, expect } from "vitest";
import * as gwt from "./helpers/gwt";

describe("debug", () => {
  it("works", () => {
    expect(typeof gwt.given).toBe("function");
  });
});
