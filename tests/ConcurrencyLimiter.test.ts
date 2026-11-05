import { ConcurrencyLimiter } from "@/utils/ConcurrencyLimiter";

describe("ConcurrencyLimiter", () => {
  it("should run a single task", async () => {
    const limiter = new ConcurrencyLimiter(2);
    const result = await limiter.run(async () => 42);
    expect(result).toBe(42);
  });

  it("should propagate errors from tasks", async () => {
    const limiter = new ConcurrencyLimiter(2);
    await expect(
      limiter.run(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });

  it("should limit concurrency to the configured maximum", async () => {
    const limiter = new ConcurrencyLimiter(2);
    let running = 0;
    let maxRunning = 0;

    const createTask = () =>
      limiter.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 50));
        running--;
      });

    await Promise.all([createTask(), createTask(), createTask(), createTask(), createTask()]);

    expect(maxRunning).toBe(2);
  });

  it("should process queued tasks after earlier tasks complete", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const order: number[] = [];

    const task = (id: number) =>
      limiter.run(async () => {
        order.push(id);
        return id;
      });

    const results = await Promise.all([task(1), task(2), task(3)]);

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("should release slot even when a task throws", async () => {
    const limiter = new ConcurrencyLimiter(1);

    await expect(
      limiter.run(async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow("fail");

    // Should still be able to run another task after the failure
    const result = await limiter.run(async () => "recovered");
    expect(result).toBe("recovered");
  });

  it("should handle a concurrency of 1 correctly", async () => {
    const limiter = new ConcurrencyLimiter(1);
    let running = 0;
    let maxRunning = 0;

    const createTask = () =>
      limiter.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
      });

    await Promise.all([createTask(), createTask(), createTask()]);

    expect(maxRunning).toBe(1);
  });

  it("should return values from concurrent tasks", async () => {
    const limiter = new ConcurrencyLimiter(3);

    const results = await Promise.all([
      limiter.run(async () => "a"),
      limiter.run(async () => "b"),
      limiter.run(async () => "c"),
      limiter.run(async () => "d"),
    ]);

    expect(results).toEqual(["a", "b", "c", "d"]);
  });

  it("should handle high concurrency limit with fewer tasks", async () => {
    const limiter = new ConcurrencyLimiter(100);

    const results = await Promise.all([limiter.run(async () => 1), limiter.run(async () => 2)]);

    expect(results).toEqual([1, 2]);
  });

  it("should handle tasks that resolve to different types", async () => {
    const limiter = new ConcurrencyLimiter(2);

    const num = await limiter.run(async () => 42);
    const str = await limiter.run(async () => "hello");
    const arr = await limiter.run(async () => [1, 2, 3]);

    expect(num).toBe(42);
    expect(str).toBe("hello");
    expect(arr).toEqual([1, 2, 3]);
  });

  it("should continue processing queue after multiple errors", async () => {
    const limiter = new ConcurrencyLimiter(1);

    const results: string[] = [];

    await limiter
      .run(async () => {
        results.push("first");
      })
      .catch(() => {});
    await limiter
      .run(async () => {
        throw new Error("err1");
      })
      .catch(() => {});
    await limiter
      .run(async () => {
        throw new Error("err2");
      })
      .catch(() => {});
    await limiter.run(async () => {
      results.push("recovered");
    });

    expect(results).toEqual(["first", "recovered"]);
  });
});
