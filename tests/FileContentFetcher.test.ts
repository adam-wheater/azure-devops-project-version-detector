import { fetchFileContents } from "@/scanning/FileContentFetcher";

describe("FileContentFetcher", () => {
  function makeMockClient(responses: Record<string, string | Error>) {
    return {
      getItemContent: jest.fn(async (_repoId: string, path: string) => {
        const response = responses[path];
        if (response instanceof Error) throw response;
        // Return an ArrayBuffer (simulating binary response)
        const encoder = new TextEncoder();
        return encoder.encode(response).buffer;
      }),
    } as any;
  }

  it("should fetch content for all paths", async () => {
    const client = makeMockClient({
      "/App.csproj": "<Project></Project>",
      "/global.json": '{"sdk":{"version":"8.0.300"}}',
    });

    const results = await fetchFileContents(client, "repo-1", ["/App.csproj", "/global.json"]);

    expect(results).toHaveLength(2);
    expect(results[0].path).toBe("/App.csproj");
    expect(results[0].content).toBe("<Project></Project>");
    expect(results[1].path).toBe("/global.json");
    expect(results[1].content).toBe('{"sdk":{"version":"8.0.300"}}');
  });

  it("should skip files that throw errors", async () => {
    const client = makeMockClient({
      "/good.csproj": "<Project></Project>",
      "/bad.csproj": new Error("Not found"),
    });

    const results = await fetchFileContents(client, "repo-1", ["/good.csproj", "/bad.csproj"]);

    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("/good.csproj");
  });

  it("should skip files exceeding max file size", async () => {
    const largeContent = "x".repeat(1024 * 1024 + 1); // > 1 MB
    const client = makeMockClient({
      "/large.csproj": largeContent,
    });

    const results = await fetchFileContents(client, "repo-1", ["/large.csproj"]);

    expect(results).toHaveLength(0);
  });

  it("should return empty array for empty paths", async () => {
    const client = makeMockClient({});
    const results = await fetchFileContents(client, "repo-1", []);

    expect(results).toHaveLength(0);
  });

  it("should handle concurrent file fetches", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 15; i++) {
      files[`/file${i}.csproj`] = `<Project>${i}</Project>`;
    }
    const client = makeMockClient(files);

    const paths = Object.keys(files);
    const results = await fetchFileContents(client, "repo-1", paths);

    expect(results).toHaveLength(15);
  });

  it("should respect abort signal and skip files when aborted", async () => {
    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    const client = makeMockClient({
      "/App.csproj": "<Project></Project>",
    });

    const results = await fetchFileContents(
      client,
      "repo-1",
      ["/App.csproj"],
      undefined,
      controller.signal
    );

    // Should return empty since signal was already aborted
    expect(results).toHaveLength(0);
  });

  it("should accept a custom ConcurrencyLimiter", async () => {
    const { ConcurrencyLimiter } = await import("@/utils/ConcurrencyLimiter");
    const customLimiter = new ConcurrencyLimiter(1);

    const client = makeMockClient({
      "/a.csproj": "<A/>",
      "/b.csproj": "<B/>",
    });

    const results = await fetchFileContents(
      client,
      "repo-1",
      ["/a.csproj", "/b.csproj"],
      customLimiter
    );

    expect(results).toHaveLength(2);
  });
});
