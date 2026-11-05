import {
  isMauiProject,
  enrichMauiProject,
  getMauiPlatforms,
} from "@/scanning/detectors/MauiDetector";
import { DetectedProject, ProjectType, DotNetFlavor, LifecycleStatus } from "@/models/types";

function makeProject(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    repoName: "my-repo",
    repoId: "repo-1",
    projectFile: "/src/MyApp/MyApp.csproj",
    projectName: "MyApp",
    projectType: ProjectType.Unknown,
    dotNetFlavor: DotNetFlavor.DotNet,
    targetFramework: "net8.0",
    targetFrameworks: ["net8.0"],
    lifecycleStatus: LifecycleStatus.Supported,
    latestLts: ".NET 8",
    keyNuGetPackages: [],
    ...overrides,
  };
}

describe("MauiDetector", () => {
  describe("isMauiProject", () => {
    it("should detect UseMaui property", () => {
      expect(isMauiProject("<UseMaui>true</UseMaui>")).toBe(true);
    });

    it("should detect UseMaui with whitespace", () => {
      expect(isMauiProject("<UseMaui> true </UseMaui>")).toBe(true);
    });

    it("should detect MAUI SDK", () => {
      const content = '<Project Sdk="Microsoft.NET.Sdk.Maui">';
      expect(isMauiProject(content)).toBe(true);
    });

    it("should detect MAUI package reference", () => {
      const content = '<PackageReference Include="Microsoft.Maui.Controls" Version="8.0.0" />';
      expect(isMauiProject(content)).toBe(true);
    });

    it("should detect MAUI via platform TFMs with net8+", () => {
      const content = `<TargetFrameworks>net8.0-android;net8.0-ios;net8.0-maccatalyst</TargetFrameworks>`;
      expect(isMauiProject(content)).toBe(true);
    });

    it("should detect MAUI via platform TFMs on .NET 10", () => {
      const content = `<TargetFrameworks>net10.0-android;net10.0-ios</TargetFrameworks>`;
      expect(isMauiProject(content)).toBe(true);
    });

    it("should not treat a WPF or WinForms -windows target as MAUI", () => {
      const content = `
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows</TargetFramework>
    <UseWPF>true</UseWPF>
  </PropertyGroup>
</Project>`;
      expect(isMauiProject(content)).toBe(false);
    });

    it("should not detect non-MAUI projects", () => {
      const content = `
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`;
      expect(isMauiProject(content)).toBe(false);
    });

    it("should return false for empty content", () => {
      expect(isMauiProject("")).toBe(false);
    });
  });

  describe("enrichMauiProject", () => {
    it("should set project type to MAUI and flavor to MAUI", () => {
      const project = makeProject();
      const enriched = enrichMauiProject(project);

      expect(enriched.projectType).toBe(ProjectType.Maui);
      expect(enriched.dotNetFlavor).toBe(DotNetFlavor.Maui);
    });

    it("should not mutate the original project", () => {
      const project = makeProject();
      const enriched = enrichMauiProject(project);

      expect(enriched).not.toBe(project);
      expect(project.projectType).toBe(ProjectType.Unknown);
    });
  });

  describe("getMauiPlatforms", () => {
    it("should extract Android platform", () => {
      expect(getMauiPlatforms(["net8.0-android"])).toEqual(["Android"]);
    });

    it("should extract iOS platform", () => {
      expect(getMauiPlatforms(["net8.0-ios"])).toEqual(["iOS"]);
    });

    it("should extract macOS platform", () => {
      expect(getMauiPlatforms(["net8.0-maccatalyst"])).toEqual(["macOS (Mac Catalyst)"]);
    });

    it("should extract Windows platform", () => {
      expect(getMauiPlatforms(["net8.0-windows10.0.19041.0"])).toEqual(["Windows"]);
    });

    it("should extract Tizen platform", () => {
      expect(getMauiPlatforms(["net8.0-tizen"])).toEqual(["Tizen"]);
    });

    it("should extract multiple platforms and deduplicate", () => {
      const platforms = getMauiPlatforms([
        "net8.0-android",
        "net8.0-ios",
        "net8.0-maccatalyst",
        "net8.0-windows10.0.19041.0",
      ]);
      expect(platforms).toEqual(["Android", "iOS", "macOS (Mac Catalyst)", "Windows"]);
    });

    it("should return empty for non-platform TFMs", () => {
      expect(getMauiPlatforms(["net8.0"])).toEqual([]);
    });
  });
});
