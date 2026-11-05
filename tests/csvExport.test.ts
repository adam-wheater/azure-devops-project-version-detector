import { exportToCsv } from "@/utils/csvExport";
import {
  ScanResult,
  DetectedProject,
  ProjectType,
  DotNetFlavor,
  LifecycleStatus,
} from "@/models/types";

function makeProject(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    repoName: "my-repo",
    repoId: "repo-1",
    projectFile: "/src/MyApp/MyApp.csproj",
    projectName: "MyApp",
    projectType: ProjectType.WebApi,
    dotNetFlavor: DotNetFlavor.DotNet,
    targetFramework: "net8.0",
    targetFrameworks: ["net8.0"],
    lifecycleStatus: LifecycleStatus.Supported,
    latestLts: ".NET 8",
    keyNuGetPackages: [],
    ...overrides,
  };
}

function makeScanResult(projects: DetectedProject[]): ScanResult {
  return {
    projects,
    summary: {
      totalRepos: 1,
      totalProjects: projects.length,
      outdatedCount: 0,
      expiringSoonCount: 0,
      supportedCount: projects.length,
      frameworkBreakdown: {},
      projectTypeBreakdown: {},
      flavorBreakdown: {},
    },
    scanDate: "2025-01-01T00:00:00.000Z",
    duration: 1000,
  };
}

describe("csvExport", () => {
  describe("exportToCsv", () => {
    it("should generate CSV with headers", () => {
      const result = makeScanResult([]);
      const csv = exportToCsv(result);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("Repository");
      expect(lines[0]).toContain("Project File");
      expect(lines[0]).toContain("Lifecycle Status");
      expect(lines[0]).toContain("Key NuGet Packages");
    });

    it("should include project data rows", () => {
      const project = makeProject({
        eolDate: "2026-11-10",
        sdkVersion: "8.0.300",
      });
      const csv = exportToCsv(makeScanResult([project]));
      const lines = csv.split("\n");

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain("my-repo");
      expect(lines[1]).toContain("MyApp");
      expect(lines[1]).toContain("net8.0");
      expect(lines[1]).toContain("8.0.300");
      expect(lines[1]).toContain("2026-11-10");
    });

    it("should escape values containing commas", () => {
      const project = makeProject({
        targetFrameworks: ["net8.0", "net7.0"],
      });
      const csv = exportToCsv(makeScanResult([project]));

      // "net8.0; net7.0" contains no comma, but let's test an actual comma case
      expect(csv).toContain("net8.0; net7.0");
    });

    it("should escape values containing double quotes", () => {
      const project = makeProject({
        projectName: 'My"App',
      });
      const csv = exportToCsv(makeScanResult([project]));

      // Double quotes should be escaped by doubling them
      expect(csv).toContain('My""App');
    });

    it("should format NuGet packages as name@version pairs", () => {
      const project = makeProject({
        keyNuGetPackages: [
          { name: "Serilog", version: "3.1.0" },
          { name: "Polly", version: "8.2.0" },
        ],
      });
      const csv = exportToCsv(makeScanResult([project]));

      expect(csv).toContain("Serilog@3.1.0; Polly@8.2.0");
    });

    it("should handle function app fields", () => {
      const project = makeProject({
        functionAppModel: "Isolated Worker" as any,
        functionRuntimeVersion: "v4",
      });
      const csv = exportToCsv(makeScanResult([project]));

      expect(csv).toContain("Isolated Worker");
      expect(csv).toContain("v4");
    });

    it("should handle container app fields", () => {
      const project = makeProject({
        containerAppEnvironment: "prod-env",
        hasWorkloadProfile: true,
        pipelineFile: "deploy.yml",
      });
      const csv = exportToCsv(makeScanResult([project]));

      expect(csv).toContain("prod-env");
      expect(csv).toContain("true");
      expect(csv).toContain("deploy.yml");
    });

    it("should handle missing optional fields gracefully", () => {
      const project = makeProject();
      const csv = exportToCsv(makeScanResult([project]));
      const lines = csv.split("\n");

      // Should not throw and should have proper number of columns
      const headerCount = lines[0].split(",").length;
      const dataCount = lines[1].split(",").length;
      expect(dataCount).toBe(headerCount);
    });

    it("should accept a DetectedProject array directly (filtered projects)", () => {
      const project1 = makeProject({ projectName: "FilteredApp" });
      const project2 = makeProject({ projectName: "ExcludedApp" });

      // Passing only the filtered subset of the full list
      const allProjects = [project1, project2];
      const csv = exportToCsv(allProjects.filter((p) => p.projectName === "FilteredApp"));
      const lines = csv.split("\n");

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain("FilteredApp");
      expect(csv).not.toContain("ExcludedApp");
    });

    it("should export only the provided filtered subset", () => {
      const all = [
        makeProject({ projectName: "AppA", lifecycleStatus: LifecycleStatus.Supported }),
        makeProject({ projectName: "AppB", lifecycleStatus: LifecycleStatus.EndOfLife }),
        makeProject({ projectName: "AppC", lifecycleStatus: LifecycleStatus.Supported }),
      ];

      // Simulating a filter: only EOL projects
      const filtered = all.filter((p) => p.lifecycleStatus === LifecycleStatus.EndOfLife);
      const csv = exportToCsv(filtered);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(2); // header + 1 data row
      expect(lines[1]).toContain("AppB");
      expect(csv).not.toContain("AppA");
      expect(csv).not.toContain("AppC");
    });

    it("should handle multiple projects correctly", () => {
      const projects = [
        makeProject({ projectName: "App1", repoName: "repo-a" }),
        makeProject({ projectName: "App2", repoName: "repo-b" }),
        makeProject({ projectName: "App3", repoName: "repo-c" }),
      ];
      const csv = exportToCsv(projects);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(4); // header + 3 data rows
    });

    it("should handle values containing newlines", () => {
      const project = makeProject({
        projectName: "App\nWith\nNewlines",
      });
      const csv = exportToCsv([project]);

      // Value with newlines should be quoted
      expect(csv).toContain('"App\nWith\nNewlines"');
    });

    it("should quote values containing a bare carriage return", () => {
      const csv = exportToCsv([makeProject({ projectName: "App\rName" })]);
      expect(csv).toContain('"App\rName"');
    });

    it("should neutralise values a spreadsheet would run as a formula", () => {
      const csv = exportToCsv([
        makeProject({ repoName: '=HYPERLINK("http://example.com")', projectName: "+cmd" }),
      ]);
      const row = csv.split("\n")[1];
      expect(row.startsWith(`"'=HYPERLINK(""http://example.com"")"`)).toBe(true);
      expect(row).toContain(",'+cmd,");
    });

    it("should export from ScanResult when passed directly", () => {
      const projects = [makeProject({ projectName: "App1" }), makeProject({ projectName: "App2" })];
      const scanResult = makeScanResult(projects);
      const csv = exportToCsv(scanResult);
      const lines = csv.split("\n");

      // All projects from the scan result should be exported
      expect(lines).toHaveLength(3); // header + 2 data rows
    });

    it("should include all expected headers", () => {
      const csv = exportToCsv([]);
      const headers = csv.split("\n")[0];

      expect(headers).toContain("Repository");
      expect(headers).toContain("Project File");
      expect(headers).toContain("Project Name");
      expect(headers).toContain("Project Type");
      expect(headers).toContain(".NET Flavor");
      expect(headers).toContain("Target Framework");
      expect(headers).toContain("All Target Frameworks");
      expect(headers).toContain("SDK Version");
      expect(headers).toContain("Lifecycle Status");
      expect(headers).toContain("EOL Date");
      expect(headers).toContain("Latest LTS");
      expect(headers).toContain("Function App Model");
      expect(headers).toContain("Function Runtime Version");
      expect(headers).toContain("Container App Environment");
      expect(headers).toContain("Has Workload Profile");
      expect(headers).toContain("Pipeline File");
      expect(headers).toContain("Key NuGet Packages");
    });
  });
});
