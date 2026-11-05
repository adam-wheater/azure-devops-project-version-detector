import { ScanOrchestrator } from "@/scanning/ScanOrchestrator";
import { DeploymentTarget, LifecycleStatus, ProjectType } from "@/models/types";

// Mock all dependencies
jest.mock("@/services/RepoService", () => ({
  getRepoTree: jest.fn(),
  getRepoHeadCommit: jest.fn(),
}));

jest.mock("@/scanning/FileContentFetcher", () => ({
  fetchFileContents: jest.fn(),
}));

import { getRepoTree, getRepoHeadCommit } from "@/services/RepoService";
import { fetchFileContents } from "@/scanning/FileContentFetcher";

const mockGetRepoTree = getRepoTree as jest.MockedFunction<typeof getRepoTree>;
const mockGetRepoHeadCommit = getRepoHeadCommit as jest.MockedFunction<typeof getRepoHeadCommit>;
const mockFetchFileContents = fetchFileContents as jest.MockedFunction<typeof fetchFileContents>;

function makeRepo(name: string, id: string) {
  return { id, name } as any;
}

describe("ScanOrchestrator", () => {
  let orchestrator: ScanOrchestrator;

  beforeEach(() => {
    orchestrator = new ScanOrchestrator();
    jest.clearAllMocks();
    // Default: head commit unknown, which always forces a full repo scan.
    mockGetRepoHeadCommit.mockResolvedValue("");
  });

  it("should return empty results for repos with no files", async () => {
    mockGetRepoTree.mockResolvedValue([]);

    const result = await orchestrator.scan({} as any, [makeRepo("empty-repo", "1")]);

    expect(result.projects).toHaveLength(0);
    expect(result.summary.totalRepos).toBe(1);
    expect(result.summary.totalProjects).toBe(0);
  });

  it("should scan a repo with a .NET project file", async () => {
    mockGetRepoTree.mockResolvedValue([{ path: "/src/MyApp/MyApp.csproj", isFolder: false }]);

    mockFetchFileContents.mockResolvedValue([
      {
        path: "/src/MyApp/MyApp.csproj",
        content: `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`,
      },
    ]);

    const result = await orchestrator.scan({} as any, [makeRepo("my-repo", "repo-1")]);

    expect(result.projects.length).toBeGreaterThanOrEqual(1);
    expect(result.projects[0].repoName).toBe("my-repo");
    expect(result.projects[0].targetFramework).toBe("net8.0");
  });

  it("should call progress callback", async () => {
    mockGetRepoTree.mockResolvedValue([]);

    const onProgress = jest.fn();
    await orchestrator.scan({} as any, [makeRepo("repo", "1")], onProgress);

    expect(onProgress).toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "Scanning repositories", total: 1 })
    );
  });

  it("should handle scan errors gracefully", async () => {
    mockGetRepoTree.mockRejectedValue(new Error("API failed"));

    const result = await orchestrator.scan({} as any, [makeRepo("bad-repo", "1")]);

    // Should not throw, just return empty
    expect(result.projects).toHaveLength(0);
  });

  it("should sort results by lifecycle status then repo name", async () => {
    // Repo 1: .NET 7 (EOL)
    mockGetRepoTree.mockImplementation(async (_client, _repoId) => {
      return [{ path: "/App.csproj", isFolder: false }];
    });

    mockFetchFileContents.mockImplementation(async (_client, repoId) => {
      const tfm = repoId === "eol-repo" ? "net7.0" : "net8.0";
      return [
        {
          path: "/App.csproj",
          content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>${tfm}</TargetFramework></PropertyGroup></Project>`,
        },
      ];
    });

    const result = await orchestrator.scan({} as any, [
      makeRepo("z-repo", "net8-repo"),
      makeRepo("a-repo", "eol-repo"),
    ]);

    if (result.projects.length >= 2) {
      // EOL should come first
      expect(result.projects[0].lifecycleStatus).toBe(LifecycleStatus.EndOfLife);
    }
  });

  it("should build correct summary breakdown", async () => {
    mockGetRepoTree.mockResolvedValue([{ path: "/App.csproj", isFolder: false }]);

    mockFetchFileContents.mockResolvedValue([
      {
        path: "/App.csproj",
        content: `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`,
      },
    ]);

    const result = await orchestrator.scan({} as any, [makeRepo("repo", "1")]);

    expect(result.summary.totalRepos).toBe(1);
    expect(result.summary.totalProjects).toBeGreaterThanOrEqual(1);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.scanDate).toBeTruthy();
  });

  it("should detect container apps from pipelines even without .NET projects", async () => {
    mockGetRepoTree.mockResolvedValue([{ path: "/azure-pipelines.yml", isFolder: false }]);

    mockFetchFileContents.mockResolvedValue([
      {
        path: "/azure-pipelines.yml",
        content: `
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppEnvironment: prod-env
      containerAppName: my-app`,
      },
    ]);

    const result = await orchestrator.scan({} as any, [makeRepo("infra-repo", "1")]);

    // Container apps detected but no .NET projects, so projects may be empty
    // But the orchestrator should not crash
    expect(result).toBeDefined();
  });

  it("should scan multiple repos concurrently", async () => {
    mockGetRepoTree.mockResolvedValue([]);

    const repos = Array.from({ length: 10 }, (_, i) => makeRepo(`repo-${i}`, `${i}`));
    const result = await orchestrator.scan({} as any, repos);

    expect(result.summary.totalRepos).toBe(10);
    expect(mockGetRepoTree).toHaveBeenCalledTimes(10);
  });

  it("should respect abort signal and stop scanning", async () => {
    const controller = new AbortController();

    mockGetRepoTree.mockImplementation(async () => {
      // Abort during scanning
      controller.abort();
      return [{ path: "/App.csproj", isFolder: false }];
    });

    mockFetchFileContents.mockResolvedValue([]);

    const result = await orchestrator.scan(
      {} as any,
      [makeRepo("repo", "1")],
      undefined,
      controller.signal
    );

    // Should complete gracefully with empty or partial results
    expect(result).toBeDefined();
    expect(result.summary.totalRepos).toBe(1);
  });

  it("should pass lifecycle data to project detection", async () => {
    const customLifecycle = [
      {
        framework: ".NET",
        version: "8.0",
        displayName: ".NET 8",
        releaseDate: "2023-11-14",
        endOfLifeDate: "2099-12-31",
        isLts: true,
        status: LifecycleStatus.Supported,
      },
    ];

    const orch = new ScanOrchestrator(customLifecycle);

    mockGetRepoTree.mockResolvedValue([{ path: "/App.csproj", isFolder: false }]);

    mockFetchFileContents.mockResolvedValue([
      {
        path: "/App.csproj",
        content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`,
      },
    ]);

    const result = await orch.scan({} as any, [makeRepo("repo", "1")]);

    if (result.projects.length > 0) {
      expect(result.projects[0].eolDate).toBe("2099-12-31");
    }
  });

  describe("deployment target detection", () => {
    it("marks an API with controllers and a Dockerfile as a likely Container App", async () => {
      mockGetRepoTree.mockResolvedValue([
        { path: "/src/Billing.Api/Billing.Api.csproj", isFolder: false },
        { path: "/src/Billing.Api/Dockerfile", isFolder: false },
        { path: "/src/Billing.Api/Controllers/InvoiceController.cs", isFolder: false },
      ]);
      mockFetchFileContents.mockResolvedValue([
        {
          path: "/src/Billing.Api/Billing.Api.csproj",
          content: `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`,
        },
      ]);

      const result = await orchestrator.scan({} as any, [makeRepo("billing", "repo-1")]);

      expect(result.projects).toHaveLength(1);
      const project = result.projects[0];
      // Controllers folder upgrades WebApp -> WebApi even without OpenAPI packages
      expect(project.projectType).toBe(ProjectType.WebApi);
      expect(project.hasControllers).toBe(true);
      expect(project.dockerfilePath).toBe("/src/Billing.Api/Dockerfile");
      expect(project.deploymentTarget).toBe(DeploymentTarget.ContainerApp);
      expect(project.deploymentConfidence).toBe("likely");
    });

    it("marks a Blazor app without container signals as a likely App Service", async () => {
      mockGetRepoTree.mockResolvedValue([
        { path: "/src/Portal/Portal.csproj", isFolder: false },
        { path: "/src/Portal/Pages/Index.razor", isFolder: false },
      ]);
      mockFetchFileContents.mockResolvedValue([
        {
          path: "/src/Portal/Portal.csproj",
          content: `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.AspNetCore.Components" Version="8.0.0" /></ItemGroup></Project>`,
        },
      ]);

      const result = await orchestrator.scan({} as any, [makeRepo("portal", "repo-1")]);

      const project = result.projects[0];
      expect(project.projectType).toBe(ProjectType.BlazorServer);
      expect(project.deploymentTarget).toBe(DeploymentTarget.AppService);
      expect(project.deploymentConfidence).toBe("likely");
    });

    it("confirms App Service from a pipeline web app deploy task", async () => {
      mockGetRepoTree.mockResolvedValue([
        { path: "/src/Shop.Web/Shop.Web.csproj", isFolder: false },
        { path: "/azure-pipelines.yml", isFolder: false },
      ]);
      mockFetchFileContents.mockImplementation(async (_client, _repoId, paths: string[]) => {
        const contents = [];
        for (const p of paths) {
          if (p.endsWith(".csproj")) {
            contents.push({
              path: p,
              content: `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`,
            });
          }
          if (p.endsWith(".yml")) {
            contents.push({
              path: p,
              content: "steps:\n- task: AzureWebApp@1\n  inputs:\n    appName: shop-web",
            });
          }
        }
        return contents;
      });

      const result = await orchestrator.scan({} as any, [makeRepo("shop", "repo-1")]);

      const project = result.projects[0];
      expect(project.deploymentTarget).toBe(DeploymentTarget.AppService);
      expect(project.deploymentConfidence).toBe("confirmed");
    });

    it("confirms Function App deployment target for functions projects", async () => {
      mockGetRepoTree.mockResolvedValue([{ path: "/src/Jobs/Jobs.csproj", isFolder: false }]);
      mockFetchFileContents.mockResolvedValue([
        {
          path: "/src/Jobs/Jobs.csproj",
          content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.21.0" /></ItemGroup></Project>`,
        },
      ]);

      const result = await orchestrator.scan({} as any, [makeRepo("jobs", "repo-1")]);

      const project = result.projects[0];
      expect(project.deploymentTarget).toBe(DeploymentTarget.FunctionApp);
      expect(project.deploymentConfidence).toBe("confirmed");
    });
  });

  describe("incremental scanning", () => {
    const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`;

    function setupFullScan() {
      mockGetRepoTree.mockResolvedValue([{ path: "/App.csproj", isFolder: false }]);
      mockFetchFileContents.mockResolvedValue([{ path: "/App.csproj", content: CSPROJ }]);
    }

    it("records each repo's head commit in the result", async () => {
      setupFullScan();
      mockGetRepoHeadCommit.mockResolvedValue("sha-1");

      const result = await orchestrator.scan({} as any, [makeRepo("repo", "repo-1")]);

      expect(result.repoCommits).toEqual({ "repo-1": "sha-1" });
    });

    it("skips fetching a repo whose head commit matches the baseline", async () => {
      setupFullScan();
      mockGetRepoHeadCommit.mockResolvedValue("sha-1");

      const first = await orchestrator.scan({} as any, [makeRepo("repo", "repo-1")]);
      expect(first.projects).toHaveLength(1);
      expect(mockGetRepoTree).toHaveBeenCalledTimes(1);

      const second = await orchestrator.scan(
        {} as any,
        [makeRepo("repo", "repo-1")],
        undefined,
        undefined,
        first
      );

      // No new tree/content fetch: the repo was reused from the baseline
      expect(mockGetRepoTree).toHaveBeenCalledTimes(1);
      expect(second.projects).toHaveLength(1);
      expect(second.projects[0].targetFramework).toBe("net8.0");
      expect(second.summary.unchangedRepos).toBe(1);
      expect(second.repoCommits).toEqual({ "repo-1": "sha-1" });
    });

    it("rescans a repo whose head commit changed since the baseline", async () => {
      setupFullScan();
      mockGetRepoHeadCommit.mockResolvedValueOnce("sha-1").mockResolvedValueOnce("sha-2");

      const first = await orchestrator.scan({} as any, [makeRepo("repo", "repo-1")]);
      const second = await orchestrator.scan(
        {} as any,
        [makeRepo("repo", "repo-1")],
        undefined,
        undefined,
        first
      );

      expect(mockGetRepoTree).toHaveBeenCalledTimes(2);
      expect(second.summary.unchangedRepos).toBe(0);
      expect(second.repoCommits).toEqual({ "repo-1": "sha-2" });
    });

    it("never treats an unknown head commit as a match", async () => {
      setupFullScan();
      mockGetRepoHeadCommit.mockResolvedValue("");

      const first = await orchestrator.scan({} as any, [makeRepo("repo", "repo-1")]);
      const second = await orchestrator.scan(
        {} as any,
        [makeRepo("repo", "repo-1")],
        undefined,
        undefined,
        first
      );

      expect(mockGetRepoTree).toHaveBeenCalledTimes(2);
      expect(second.summary.unchangedRepos).toBe(0);
    });

    it("recomputes lifecycle fields for reused projects with current config", async () => {
      setupFullScan();
      mockGetRepoHeadCommit.mockResolvedValue("sha-1");

      const first = await orchestrator.scan({} as any, [makeRepo("repo", "repo-1")]);

      // Second scan runs with a lifecycle config whose .NET 8 EOL has passed
      const eolLifecycle = [
        {
          framework: ".NET",
          version: "8.0",
          displayName: ".NET 8",
          releaseDate: "2023-11-14",
          endOfLifeDate: "2024-01-01",
          isLts: true,
          status: LifecycleStatus.Supported,
        },
      ];
      const orch = new ScanOrchestrator(eolLifecycle);
      const second = await orch.scan(
        {} as any,
        [makeRepo("repo", "repo-1")],
        undefined,
        undefined,
        first
      );

      expect(second.summary.unchangedRepos).toBe(1);
      expect(second.projects[0].lifecycleStatus).toBe(LifecycleStatus.EndOfLife);
      expect(second.projects[0].eolDate).toBe("2024-01-01");
    });

    it("does not record a head commit for a repo whose scan failed", async () => {
      mockGetRepoHeadCommit.mockResolvedValue("sha-1");
      mockGetRepoTree.mockRejectedValue(new Error("API failed"));

      const result = await orchestrator.scan({} as any, [makeRepo("flaky", "repo-1")]);

      // If the head were recorded, the next incremental scan would treat the
      // failed (empty) result as valid and the repo's projects would vanish.
      expect(result.repoCommits).toEqual({});
    });

    it("ignores a baseline produced by a different scanner schema version", async () => {
      setupFullScan();
      mockGetRepoHeadCommit.mockResolvedValue("sha-1");

      const first = await orchestrator.scan({} as any, [makeRepo("repo", "repo-1")]);
      expect(first.scanSchemaVersion).toBeDefined();

      const staleBaseline = { ...first, scanSchemaVersion: (first.scanSchemaVersion ?? 0) - 1 };
      const second = await orchestrator.scan(
        {} as any,
        [makeRepo("repo", "repo-1")],
        undefined,
        undefined,
        staleBaseline
      );

      // Full scan happened despite the matching head commit
      expect(mockGetRepoTree).toHaveBeenCalledTimes(2);
      expect(second.summary.unchangedRepos).toBe(0);
    });

    it("ignores a baseline with no schema version (pre-versioning cache)", async () => {
      setupFullScan();
      mockGetRepoHeadCommit.mockResolvedValue("sha-1");

      const first = await orchestrator.scan({} as any, [makeRepo("repo", "repo-1")]);
      const legacyBaseline = { ...first, scanSchemaVersion: undefined };

      const second = await orchestrator.scan(
        {} as any,
        [makeRepo("repo", "repo-1")],
        undefined,
        undefined,
        legacyBaseline
      );

      expect(mockGetRepoTree).toHaveBeenCalledTimes(2);
      expect(second.summary.unchangedRepos).toBe(0);
    });

    it("reuses a baseline repo that had zero projects", async () => {
      mockGetRepoTree.mockResolvedValue([]);
      mockGetRepoHeadCommit.mockResolvedValue("sha-1");

      const first = await orchestrator.scan({} as any, [makeRepo("empty", "repo-1")]);
      expect(first.projects).toHaveLength(0);

      const second = await orchestrator.scan(
        {} as any,
        [makeRepo("empty", "repo-1")],
        undefined,
        undefined,
        first
      );

      expect(mockGetRepoTree).toHaveBeenCalledTimes(1);
      expect(second.projects).toHaveLength(0);
      expect(second.summary.unchangedRepos).toBe(1);
    });
  });
});
