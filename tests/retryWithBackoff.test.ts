import { retryWithBackoff, isRetryableError } from "@/utils/retryWithBackoff";

function httpError(status: number, message = "error"): any {
  const err: any = new Error(message);
  err.name = "TFS.WebApi.Exception";
  err.status = status;
  return err;
}

describe("isRetryableError", () => {
  it("treats 429 and gateway errors as retryable", () => {
    expect(isRetryableError(httpError(429))).toBe(true);
    expect(isRetryableError(httpError(502))).toBe(true);
    expect(isRetryableError(httpError(503))).toBe(true);
    expect(isRetryableError(httpError(504))).toBe(true);
  });

  it("treats network exceptions as retryable", () => {
    const err: any = new Error("offline");
    err.name = "NetworkException";
    expect(isRetryableError(err)).toBe(true);
  });

  it("treats other status codes and plain errors as non-retryable", () => {
    expect(isRetryableError(httpError(404))).toBe(false);
    expect(isRetryableError(httpError(401))).toBe(false);
    expect(isRetryableError(new Error("boom"))).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
});

describe("retryWithBackoff", () => {
  it("returns the result on first success without retrying", async () => {
    const fn = jest.fn(async () => "ok");
    const result = await retryWithBackoff(fn, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries retryable errors until success", async () => {
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 3) throw httpError(429);
      return "recovered";
    });

    const result = await retryWithBackoff(fn, { baseDelayMs: 1, maxAttempts: 5 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws immediately for non-retryable errors", async () => {
    const fn = jest.fn(async () => {
      throw httpError(404);
    });

    await expect(retryWithBackoff(fn, { baseDelayMs: 1 })).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and throws the last error", async () => {
    const fn = jest.fn(async () => {
      throw httpError(503);
    });

    await expect(retryWithBackoff(fn, { baseDelayMs: 1, maxAttempts: 3 })).rejects.toMatchObject({
      status: 503,
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying once the signal is aborted", async () => {
    const controller = new AbortController();
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls === 1) controller.abort();
      throw httpError(429);
    });

    await expect(
      retryWithBackoff(fn, { baseDelayMs: 1, maxAttempts: 10, signal: controller.signal })
    ).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("removes its abort listener once a backoff delay completes", async () => {
    const controller = new AbortController();
    const add = jest.spyOn(controller.signal, "addEventListener");
    const remove = jest.spyOn(controller.signal, "removeEventListener");
    let calls = 0;
    const fn = jest.fn(async () => {
      calls++;
      if (calls < 3) throw httpError(503);
      return "ok";
    });

    await expect(
      retryWithBackoff(fn, { baseDelayMs: 1, maxAttempts: 5, signal: controller.signal })
    ).resolves.toBe("ok");

    const added = add.mock.calls.filter(([type]) => type === "abort").length;
    const removed = remove.mock.calls.filter(([type]) => type === "abort").length;
    expect(added).toBe(2);
    expect(removed).toBe(added);
  });
});
