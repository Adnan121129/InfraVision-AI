import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { toApiError } from "./client";

function axiosError(status: number | null, data?: unknown) {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError("failed", status ? "ERR_BAD_RESPONSE" : "ERR_NETWORK", config, null, status ? { status, data, statusText: "", headers: {}, config } : undefined);
}

describe("toApiError", () => {
  it("uses the API detail and field errors", () => {
    const error = toApiError(axiosError(400, { detail: "File: Unsupported file type", code: "validation_error", errors: { file: ["Unsupported file type"] } }));
    expect(error.status).toBe(400);
    expect(error.message).toBe("File: Unsupported file type");
    expect(error.fieldErrors).toEqual({ file: ["Unsupported file type"] });
  });

  it("explains network interruptions", () => {
    const error = toApiError(axiosError(null));
    expect(error.code).toBe("network_error");
    expect(error.message).toMatch(/Network connection lost/);
  });

  it("falls back to friendly messages for server errors", () => {
    expect(toApiError(axiosError(503, {})).message).toMatch(/server encountered an error/);
    expect(toApiError(axiosError(403, {})).message).toMatch(/permission/);
  });
});
