import {
  extractTargetFrameworks,
  extractNuGetPackageReferences,
  detectProjects,
  parseGlobalJson,
} from "@/scanning/detectors/DotNetVersionDetector";
import { ProjectType, DotNetFlavor } from "@/models/types";

describe("DotNetVersionDetector", () => {
  describe("extractTargetFrameworks", () => {
    it("should extract single TargetFramework", () => {
      const csproj = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
          </PropertyGroup>
        </Project>`;
      expect(extractTargetFrameworks(csproj)).toEqual(["net8.0"]);
    });

    it("should extract multiple TargetFrameworks", () => {
      const csproj = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFrameworks>net8.0;net6.0;netstandard2.0</TargetFrameworks>
          </PropertyGroup>
        </Project>`;
      expect(extractTargetFrameworks(csproj)).toEqual(["net8.0", "net6.0", "netstandard2.0"]);
    });

    it("should extract legacy TargetFrameworkVersion", () => {
      const csproj = `
        <Project>
          <PropertyGroup>
            <TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>
          </PropertyGroup>
        </Project>`;
      expect(extractTargetFrameworks(csproj)).toEqual(["net472"]);
    });

    it("should return empty for no target framework", () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk"></Project>`;
      expect(extractTargetFrameworks(csproj)).toEqual([]);
    });
  });

  describe("extractNuGetPackageReferences", () => {
    it("should extract inline PackageReference", () => {
      const csproj = `
        <ItemGroup>
          <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
          <PackageReference Include="Serilog" Version="3.1.0" />
        </ItemGroup>`;
      const packages = extractNuGetPackageReferences(csproj);
      expect(packages).toHaveLength(2);
      expect(packages[0]).toEqual({ name: "Newtonsoft.Json", version: "13.0.3" });
      expect(packages[1]).toEqual({ name: "Serilog", version: "3.1.0" });
    });

    it("should extract nested version elements", () => {
      const csproj = `
        <ItemGroup>
          <PackageReference Include="Microsoft.Extensions.Logging">
            <Version>8.0.0</Version>
          </PackageReference>
        </ItemGroup>`;
      const packages = extractNuGetPackageReferences(csproj);
      expect(packages).toHaveLength(1);
      expect(packages[0]).toEqual({
        name: "Microsoft.Extensions.Logging",
        version: "8.0.0",
      });
    });
  });

  describe("extractNuGetPackageReferences - other shapes", () => {
    it("reads Version wherever it sits among the attributes", () => {
      const csproj = `
        <ItemGroup>
          <PackageReference Include="coverlet.collector" PrivateAssets="all" Version="6.0.0" />
          <PackageReference Version="2.9.0" Include="xunit" />
        </ItemGroup>`;
      expect(extractNuGetPackageReferences(csproj)).toEqual([
        { name: "coverlet.collector", version: "6.0.0" },
        { name: "xunit", version: "2.9.0" },
      ]);
    });

    it("records Central Package Management references without a version", () => {
      const csproj = `
        <ItemGroup>
          <PackageReference Include="Microsoft.NET.Test.Sdk" />
          <PackageReference Include="Serilog" VersionOverride="4.0.0" />
        </ItemGroup>`;
      expect(extractNuGetPackageReferences(csproj)).toEqual([
        { name: "Microsoft.NET.Test.Sdk", version: "(central)" },
        { name: "Serilog", version: "4.0.0" },
      ]);
    });

    it("detects a CPM test project as a test project", () => {
      const projects = detectProjects(
        "repo",
        "repo-1",
        [
          {
            path: "/tests/App.Tests/App.Tests.csproj",
            content: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
  <ItemGroup><PackageReference Include="xunit" /></ItemGroup>
</Project>`,
          },
        ],
        [],
        {}
      );
      expect(projects[0].projectType).toBe(ProjectType.TestProject);
    });
  });

  describe("target frameworks from Directory.Build.props", () => {
    const project = (path: string) => ({
      path,
      content: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>`,
    });
    const props = (path: string, tfm: string) => ({
      path,
      content: `<Project><PropertyGroup><TargetFramework>${tfm}</TargetFramework></PropertyGroup></Project>`,
    });

    it("uses the framework a project inherits instead of skipping the project", () => {
      const projects = detectProjects(
        "repo",
        "repo-1",
        [project("/src/App/App.csproj")],
        [props("/Directory.Build.props", "net8.0")],
        {}
      );
      expect(projects).toHaveLength(1);
      expect(projects[0].targetFramework).toBe("net8.0");
    });

    it("prefers the nearest Directory.Build.props", () => {
      const projects = detectProjects(
        "repo",
        "repo-1",
        [project("/src/Legacy/Legacy.csproj")],
        [
          props("/Directory.Build.props", "net8.0"),
          props("/src/Legacy/Directory.Build.props", "net6.0"),
        ],
        {}
      );
      expect(projects[0].targetFramework).toBe("net6.0");
    });

    it("ignores props files in sibling folders and unresolved properties", () => {
      const projects = detectProjects(
        "repo",
        "repo-1",
        [project("/src/App/App.csproj")],
        [
          props("/src/Other/Directory.Build.props", "net6.0"),
          props("/Directory.Build.props", "$(DefaultTargetFramework)"),
        ],
        {}
      );
      expect(projects).toHaveLength(0);
    });
  });

  describe("parseGlobalJson", () => {
    it("should parse SDK version from global.json", () => {
      const content = JSON.stringify({
        sdk: { version: "8.0.100", rollForward: "latestMinor" },
      });
      expect(parseGlobalJson(content)).toEqual({ sdkVersion: "8.0.100" });
    });

    it("should handle missing sdk section", () => {
      expect(parseGlobalJson("{}")).toEqual({});
    });

    it("should handle invalid JSON", () => {
      expect(parseGlobalJson("not json")).toEqual({});
    });
  });

  describe("detectProjects", () => {
    it("should detect a .NET 8 Web API project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk.Web">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Swashbuckle.AspNetCore" Version="6.5.0" />
          </ItemGroup>
        </Project>`;

      const projects = detectProjects(
        "my-repo",
        "repo-id",
        [{ path: "/src/MyApi/MyApi.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectName).toBe("MyApi");
      expect(projects[0].projectType).toBe(ProjectType.WebApi);
      expect(projects[0].targetFramework).toBe("net8.0");
      expect(projects[0].dotNetFlavor).toBe(DotNetFlavor.DotNet);
    });

    it("should detect a .NET Framework 4.7.2 console app", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net472</TargetFramework>
            <OutputType>Exe</OutputType>
          </PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "legacy-repo",
        "repo-id-2",
        [{ path: "/src/LegacyApp/LegacyApp.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].dotNetFlavor).toBe(DotNetFlavor.DotNetFramework);
      expect(projects[0].projectType).toBe(ProjectType.Console);
    });

    it("should detect a Function App (isolated)", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
            <OutputType>Exe</OutputType>
            <AzureFunctionsVersion>v4</AzureFunctionsVersion>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.20.0" />
            <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="1.16.0" />
          </ItemGroup>
        </Project>`;

      const projects = detectProjects(
        "func-repo",
        "repo-id-3",
        [{ path: "/src/MyFunc/MyFunc.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectType).toBe(ProjectType.FunctionApp);
    });

    it("should detect a MAUI project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFrameworks>net8.0-android;net8.0-ios;net8.0-maccatalyst</TargetFrameworks>
            <UseMaui>true</UseMaui>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.Maui.Controls" Version="8.0.0" />
          </ItemGroup>
        </Project>`;

      const projects = detectProjects(
        "maui-repo",
        "repo-id-4",
        [{ path: "/src/MyApp/MyApp.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectType).toBe(ProjectType.Maui);
    });

    it("should detect a Xamarin.Forms project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>netstandard2.0</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Xamarin.Forms" Version="5.0.0.2578" />
            <PackageReference Include="Xamarin.Essentials" Version="1.8.1" />
          </ItemGroup>
        </Project>`;

      const projects = detectProjects(
        "xamarin-repo",
        "repo-id-5",
        [{ path: "/src/XamApp/XamApp.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectType).toBe(ProjectType.Xamarin);
    });

    it("should attach global.json SDK version", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "repo",
        "id",
        [{ path: "/src/App/App.csproj", content: projectContent }],
        [],
        { sdkVersion: "8.0.200" }
      );

      expect(projects[0].sdkVersion).toBe("8.0.200");
    });

    it("should detect a Blazor WebAssembly project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk.Web">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.AspNetCore.Components.WebAssembly" Version="8.0.0" />
          </ItemGroup>
        </Project>`;

      const projects = detectProjects(
        "blazor-repo",
        "repo-id-6",
        [{ path: "/src/BlazorApp/BlazorApp.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectType).toBe(ProjectType.BlazorWasm);
    });

    it("should detect a Worker Service project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk.Worker">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.Extensions.Hosting" Version="8.0.0" />
          </ItemGroup>
        </Project>`;

      const projects = detectProjects(
        "worker-repo",
        "repo-id-7",
        [{ path: "/src/Worker/Worker.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectType).toBe(ProjectType.Worker);
    });

    it("should detect a Test project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />
            <PackageReference Include="xunit" Version="2.6.0" />
          </ItemGroup>
        </Project>`;

      const projects = detectProjects(
        "test-repo",
        "repo-id-8",
        [{ path: "/tests/MyTests/MyTests.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectType).toBe(ProjectType.TestProject);
    });

    it("should detect a Class Library project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
          </PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "lib-repo",
        "repo-id-9",
        [{ path: "/src/MyLib/MyLib.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectType).toBe(ProjectType.ClassLibrary);
    });

    it("should detect a multi-targeting project", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFrameworks>net8.0;net6.0;netstandard2.0</TargetFrameworks>
          </PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "multi-repo",
        "repo-id-10",
        [{ path: "/src/MultiLib/MultiLib.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].targetFramework).toBe("net8.0");
      expect(projects[0].targetFrameworks).toEqual(["net8.0", "net6.0", "netstandard2.0"]);
    });

    it("should return empty for project without target framework", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <OutputType>Exe</OutputType>
          </PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "repo",
        "id",
        [{ path: "/src/App/App.csproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(0);
    });

    it("should use custom lifecycle data when provided", () => {
      const customLifecycle = [
        {
          framework: ".NET",
          version: "8.0",
          displayName: ".NET 8",
          releaseDate: "2023-11-14",
          endOfLifeDate: "2099-12-31",
          isLts: true,
          status: "Supported" as any,
        },
      ];

      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "repo",
        "id",
        [{ path: "/src/App/App.csproj", content: projectContent }],
        [],
        {},
        customLifecycle
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].eolDate).toBe("2099-12-31");
    });

    it("should extract project name from fsproj path", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "repo",
        "id",
        [{ path: "/src/MyFSharp/MyFSharp.fsproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectName).toBe("MyFSharp");
    });

    it("should extract project name from vbproj path", () => {
      const projectContent = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup><TargetFramework>net48</TargetFramework></PropertyGroup>
        </Project>`;

      const projects = detectProjects(
        "repo",
        "id",
        [{ path: "/src/MyVB/MyVB.vbproj", content: projectContent }],
        [],
        {}
      );

      expect(projects).toHaveLength(1);
      expect(projects[0].projectName).toBe("MyVB");
    });
  });
});
