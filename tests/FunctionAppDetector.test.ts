import {
  detectFunctionAppModel,
  parseHostJson,
  enrichProjectWithFunctionInfo,
} from "@/scanning/detectors/FunctionAppDetector";
import {
  FunctionAppModel,
  DetectedProject,
  ProjectType,
  DotNetFlavor,
  LifecycleStatus,
} from "@/models/types";

describe("FunctionAppDetector", () => {
  describe("detectFunctionAppModel", () => {
    it("should detect isolated worker model", () => {
      const content = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
            <AzureFunctionsVersion>v4</AzureFunctionsVersion>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.20.0" />
            <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="1.16.0" />
          </ItemGroup>
        </Project>`;

      const result = detectFunctionAppModel(content);
      expect(result).not.toBeNull();
      expect(result!.model).toBe(FunctionAppModel.Isolated);
      expect(result!.runtimeVersion).toBe("v4");
    });

    it("should detect the model when Include is not the first attribute", () => {
      const content = `
        <Project Sdk="Microsoft.NET.Sdk">
          <ItemGroup>
            <PackageReference Version="1.20.0" Include="Microsoft.Azure.Functions.Worker" />
          </ItemGroup>
        </Project>`;

      expect(detectFunctionAppModel(content)?.model).toBe(FunctionAppModel.Isolated);
    });

    it("should detect in-process model", () => {
      const content = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net6.0</TargetFramework>
            <AzureFunctionsVersion>v4</AzureFunctionsVersion>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.NET.Sdk.Functions" Version="4.2.0" />
          </ItemGroup>
        </Project>`;

      const result = detectFunctionAppModel(content);
      expect(result).not.toBeNull();
      expect(result!.model).toBe(FunctionAppModel.InProcess);
    });

    it("should return null for non-function app project", () => {
      const content = `
        <Project Sdk="Microsoft.NET.Sdk.Web">
          <PropertyGroup>
            <TargetFramework>net8.0</TargetFramework>
          </PropertyGroup>
        </Project>`;

      expect(detectFunctionAppModel(content)).toBeNull();
    });

    it("should infer runtime version from target framework", () => {
      const content = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net9.0</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.0.0" />
          </ItemGroup>
        </Project>`;

      const result = detectFunctionAppModel(content);
      expect(result!.runtimeVersion).toBe("v4 (.NET 9)");
    });
  });

  describe("runtime version for newer frameworks", () => {
    it("names any modern .NET major, including .NET 10", () => {
      const content = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net10.0</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.0.0" />
          </ItemGroup>
        </Project>`;

      expect(detectFunctionAppModel(content)!.runtimeVersion).toBe("v4 (.NET 10)");
    });

    it("still reports .NET Framework function apps", () => {
      const content = `
        <Project Sdk="Microsoft.NET.Sdk">
          <PropertyGroup>
            <TargetFramework>net48</TargetFramework>
          </PropertyGroup>
          <ItemGroup>
            <PackageReference Include="Microsoft.NET.Sdk.Functions" Version="4.0.0" />
          </ItemGroup>
        </Project>`;

      expect(detectFunctionAppModel(content)!.runtimeVersion).toBe("v4 (.NET Framework)");
    });
  });

  describe("parseHostJson", () => {
    it("should parse extension bundle version", () => {
      const content = JSON.stringify({
        version: "2.0",
        extensionBundle: {
          id: "Microsoft.Azure.Functions.ExtensionBundle",
          version: "[4.*, 5.0.0)",
        },
      });

      const result = parseHostJson(content);
      expect(result.runtime).toBe("2.0");
      expect(result.extensionBundleVersion).toBe("[4.*, 5.0.0)");
    });

    it("should handle invalid JSON", () => {
      expect(parseHostJson("not json")).toEqual({});
    });
  });

  describe("enrichProjectWithFunctionInfo", () => {
    const baseProject: DetectedProject = {
      repoName: "func-repo",
      repoId: "id",
      projectFile: "/src/Func/Func.csproj",
      projectName: "Func",
      projectType: ProjectType.FunctionApp,
      dotNetFlavor: DotNetFlavor.DotNet,
      targetFramework: "net8.0",
      targetFrameworks: ["net8.0"],
      lifecycleStatus: LifecycleStatus.Supported,
      eolDate: "2026-11-10",
      latestLts: ".NET 8",
      keyNuGetPackages: [],
    };

    it("should enrich project with function info", () => {
      const projContent = `
        <ItemGroup>
          <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="1.20.0" />
          <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="1.16.0" />
        </ItemGroup>
        <PropertyGroup>
          <TargetFramework>net8.0</TargetFramework>
          <AzureFunctionsVersion>v4</AzureFunctionsVersion>
        </PropertyGroup>`;

      const hostJson = JSON.stringify({ version: "2.0" });

      const enriched = enrichProjectWithFunctionInfo(baseProject, projContent, hostJson);
      expect(enriched.functionAppModel).toBe(FunctionAppModel.Isolated);
      expect(enriched.functionRuntimeVersion).toContain("v2.0 runtime");
    });

    it("should return unchanged project if not a function app", () => {
      const projContent = `<PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup>`;
      const enriched = enrichProjectWithFunctionInfo(baseProject, projContent);
      expect(enriched.functionAppModel).toBeUndefined();
    });
  });
});
