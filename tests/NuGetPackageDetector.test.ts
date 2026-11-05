import { extractAllNuGetPackages, getKeyPackages } from "@/scanning/detectors/NuGetPackageDetector";

describe("NuGetPackageDetector", () => {
  describe("extractAllNuGetPackages", () => {
    it("should extract from SDK-style project file", () => {
      const content = `
        <ItemGroup>
          <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
          <PackageReference Include="Serilog" Version="3.1.0" />
          <PackageReference Include="Microsoft.Extensions.Logging" Version="8.0.0" />
        </ItemGroup>`;

      const result = extractAllNuGetPackages([{ path: "/src/App/App.csproj", content }], []);

      expect(result.size).toBe(1);
      const packages = result.get("/src/App/App.csproj")!;
      expect(packages).toHaveLength(3);
      expect(packages[0].name).toBe("Newtonsoft.Json");
      expect(packages[2].name).toBe("Microsoft.Extensions.Logging");
    });

    it("should extract from packages.config", () => {
      const content = `<?xml version="1.0" encoding="utf-8"?>
        <packages>
          <package id="Newtonsoft.Json" version="13.0.3" targetFramework="net48" />
          <package id="EntityFramework" version="6.4.4" targetFramework="net48" />
        </packages>`;

      const result = extractAllNuGetPackages(
        [],
        [{ path: "/src/LegacyApp/packages.config", content }]
      );

      const packages = result.get("/src/LegacyApp/packages.config")!;
      expect(packages).toHaveLength(2);
      expect(packages[0].targetFramework).toBe("net48");
    });

    it("should extract from Directory.Packages.props", () => {
      const content = `
        <Project>
          <PropertyGroup>
            <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
          </PropertyGroup>
          <ItemGroup>
            <PackageVersion Include="Serilog" Version="3.1.0" />
            <PackageVersion Include="Polly" Version="8.2.0" />
          </ItemGroup>
        </Project>`;

      const result = extractAllNuGetPackages([], [{ path: "/Directory.Packages.props", content }]);

      const packages = result.get("/Directory.Packages.props")!;
      expect(packages).toHaveLength(2);
    });
  });

  describe("getKeyPackages", () => {
    it("should filter to key packages only", () => {
      const packages = [
        { name: "Microsoft.Extensions.Logging", version: "8.0.0" },
        { name: "Newtonsoft.Json", version: "13.0.3" },
        { name: "Serilog", version: "3.1.0" },
        { name: "Contoso.Internal.Utils", version: "1.0.0" },
        { name: "Polly", version: "8.2.0" },
        { name: "AutoMapper", version: "12.0.0" },
      ];

      const key = getKeyPackages(packages);
      expect(key.map((p) => p.name)).toEqual([
        "Microsoft.Extensions.Logging",
        "Newtonsoft.Json",
        "Serilog",
        "Polly",
        "AutoMapper",
      ]);
    });

    it("should return empty for no key packages", () => {
      const packages = [
        { name: "Contoso.Internal.Utils", version: "1.0.0" },
        { name: "SomeOther.Library", version: "2.0.0" },
      ];
      expect(getKeyPackages(packages)).toEqual([]);
    });
  });
});
