import { describe, expect, it } from "vitest";

import { buildParams } from "./endpoints";

describe("buildParams", () => {
  it("drops empty values and repeats array keys", () => {
    const params = buildParams({ search: "", page: 2, severity: ["HIGH", "CRITICAL"], asset: undefined, archived: false, x: null });
    expect(params.toString()).toBe("page=2&severity=HIGH&severity=CRITICAL&archived=false");
  });
});
