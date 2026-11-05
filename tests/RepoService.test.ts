import { getRepoHeadCommit, getRepoTree } from "@/services/RepoService";

function makeClient(getBranch: jest.Mock) {
  return { getBranch } as any;
}

describe("getRepoHeadCommit", () => {
  it("returns the head commit of the default branch", async () => {
    const getBranch = jest.fn().mockResolvedValue({ commit: { commitId: "abc123" } });
    const repo = { id: "repo-1", name: "repo", defaultBranch: "refs/heads/main" } as any;

    const sha = await getRepoHeadCommit(makeClient(getBranch), repo);

    expect(sha).toBe("abc123");
    expect(getBranch).toHaveBeenCalledWith("repo-1", "main");
  });

  it("strips only the refs/heads/ prefix from the branch ref", async () => {
    const getBranch = jest.fn().mockResolvedValue({ commit: { commitId: "abc123" } });
    const repo = { id: "repo-1", name: "repo", defaultBranch: "refs/heads/feature/x" } as any;

    await getRepoHeadCommit(makeClient(getBranch), repo);

    expect(getBranch).toHaveBeenCalledWith("repo-1", "feature/x");
  });

  it("returns empty string for a repo without a default branch", async () => {
    const getBranch = jest.fn();
    const repo = { id: "repo-1", name: "empty-repo" } as any;

    const sha = await getRepoHeadCommit(makeClient(getBranch), repo);

    expect(sha).toBe("");
    expect(getBranch).not.toHaveBeenCalled();
  });

  it("returns empty string when the branch lookup fails", async () => {
    const getBranch = jest.fn().mockRejectedValue(new Error("not found"));
    const repo = { id: "repo-1", name: "repo", defaultBranch: "refs/heads/main" } as any;

    const sha = await getRepoHeadCommit(makeClient(getBranch), repo);

    expect(sha).toBe("");
  });

  it("returns empty string when the response has no commit", async () => {
    const getBranch = jest.fn().mockResolvedValue({});
    const repo = { id: "repo-1", name: "repo", defaultBranch: "refs/heads/main" } as any;

    const sha = await getRepoHeadCommit(makeClient(getBranch), repo);

    expect(sha).toBe("");
  });
});

describe("getRepoTree", () => {
  it("maps items to paths and folder flags", async () => {
    const getItems = jest
      .fn()
      .mockResolvedValue([{ path: "/src", isFolder: true }, { path: "/src/App.csproj" }]);

    const items = await getRepoTree({ getItems } as any, "repo-1");

    expect(items).toEqual([
      { path: "/src", isFolder: true },
      { path: "/src/App.csproj", isFolder: false },
    ]);
  });

  it("propagates a failed tree fetch instead of reporting an empty repository", async () => {
    // An empty result would let the orchestrator record the head commit and
    // reuse zero projects for this repo on every later incremental scan.
    const getItems = jest.fn().mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));

    await expect(getRepoTree({ getItems } as any, "repo-1")).rejects.toThrow("boom");
  });
});
