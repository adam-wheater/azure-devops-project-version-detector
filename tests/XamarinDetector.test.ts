import {
  isXamarinProject,
  enrichXamarinProject,
  getXamarinPlatform,
} from "@/scanning/detectors/XamarinDetector";
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

describe("XamarinDetector", () => {
  describe("isXamarinProject", () => {
    it("should detect Xamarin.Forms reference", () => {
      const content = '<PackageReference Include="Xamarin.Forms" Version="5.0.0" />';
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect Xamarin.Essentials reference", () => {
      const content = '<PackageReference Include="Xamarin.Essentials" Version="1.7.0" />';
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect Xamarin.Android project GUID", () => {
      const content = "<ProjectTypeGuids>{EFBA0AD7-5A72-4C68-AF49-83D382785DCF}</ProjectTypeGuids>";
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect Xamarin.iOS project GUID", () => {
      const content = "<ProjectTypeGuids>{6BC8ED88-2882-458C-8E55-DFD12B67127B}</ProjectTypeGuids>";
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect Xamarin.Mac project GUID", () => {
      const content = "<ProjectTypeGuids>{F5B4F3BC-B597-4E2B-B552-EF5D8A32436F}</ProjectTypeGuids>";
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect Xamarin.Android imports", () => {
      const content =
        '<Import Project="$(MSBuildExtensionsPath)\\Xamarin.Android.CSharp.targets" />';
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect Xamarin.iOS imports", () => {
      const content = '<Import Project="$(MSBuildExtensionsPath)\\Xamarin.iOS.CSharp.targets" />';
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect MonoAndroid TFM", () => {
      const content = "<TargetFramework>monoandroid12.0</TargetFramework>";
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should detect Xamarin TFM", () => {
      const content = "<TargetFramework>xamarinios10</TargetFramework>";
      expect(isXamarinProject(content)).toBe(true);
    });

    it("should return false for non-Xamarin project", () => {
      const content = `
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`;
      expect(isXamarinProject(content)).toBe(false);
    });

    it("should return false for empty content", () => {
      expect(isXamarinProject("")).toBe(false);
    });
  });

  describe("enrichXamarinProject", () => {
    it("should set flavor to Xamarin and status to EndOfLife", () => {
      const project = makeProject();
      const enriched = enrichXamarinProject(project);

      expect(enriched.dotNetFlavor).toBe(DotNetFlavor.Xamarin);
      expect(enriched.lifecycleStatus).toBe(LifecycleStatus.EndOfLife);
      expect(enriched.eolDate).toBe("2024-05-01");
      expect(enriched.latestLts).toBe(".NET MAUI (.NET 10)");
    });

    it("should set project type to Xamarin when Unknown", () => {
      const project = makeProject({ projectType: ProjectType.Unknown });
      const enriched = enrichXamarinProject(project);

      expect(enriched.projectType).toBe(ProjectType.Xamarin);
    });

    it("should preserve existing project type when not Unknown", () => {
      const project = makeProject({ projectType: ProjectType.XamarinForms });
      const enriched = enrichXamarinProject(project);

      expect(enriched.projectType).toBe(ProjectType.XamarinForms);
    });

    it("should not mutate the original project", () => {
      const project = makeProject();
      const enriched = enrichXamarinProject(project);

      expect(enriched).not.toBe(project);
      expect(project.dotNetFlavor).toBe(DotNetFlavor.DotNet);
    });
  });

  describe("getXamarinPlatform", () => {
    it("should detect Android via MonoAndroid", () => {
      expect(getXamarinPlatform("<TargetFramework>monoandroid12.0</TargetFramework>")).toBe(
        "Android"
      );
    });

    it("should detect Android via Xamarin.Android", () => {
      expect(getXamarinPlatform('<Import Project="Xamarin.Android.stuff" />')).toBe("Android");
    });

    it("should detect Android via GUID", () => {
      expect(getXamarinPlatform("EFBA0AD7-5A72-4C68-AF49-83D382785DCF")).toBe("Android");
    });

    it("should detect iOS via Xamarin.iOS", () => {
      expect(getXamarinPlatform('<Import Project="Xamarin.iOS.stuff" />')).toBe("iOS");
    });

    it("should detect iOS via xamarinios TFM", () => {
      expect(getXamarinPlatform("<TargetFramework>xamarinios10</TargetFramework>")).toBe("iOS");
    });

    it("should detect iOS via GUID", () => {
      expect(getXamarinPlatform("6BC8ED88-2882-458C-8E55-DFD12B67127B")).toBe("iOS");
    });

    it("should detect macOS via Xamarin.Mac", () => {
      expect(getXamarinPlatform('<PackageReference Include="Xamarin.Mac" />')).toBe("macOS");
    });

    it("should detect macOS via GUID", () => {
      expect(getXamarinPlatform("F5B4F3BC-B597-4E2B-B552-EF5D8A32436F")).toBe("macOS");
    });

    it("should detect cross-platform via Xamarin.Forms", () => {
      expect(
        getXamarinPlatform('<PackageReference Include="Xamarin.Forms" Version="5.0.0" />')
      ).toBe("Cross-platform (Xamarin.Forms)");
    });

    it("should return Unknown for unrecognized content", () => {
      expect(getXamarinPlatform("<TargetFramework>net8.0</TargetFramework>")).toBe("Unknown");
    });
  });
});
