import { NuGetPackageInfo, FileContent } from "../../models/types";

export function extractAllNuGetPackages(
  projectFiles: FileContent[],
  configFiles: FileContent[]
): Map<string, NuGetPackageInfo[]> {
  const results = new Map<string, NuGetPackageInfo[]>();

  for (const file of projectFiles) {
    const packages = extractFromProjectFile(file.content);
    if (packages.length > 0) {
      results.set(file.path, packages);
    }
  }

  for (const file of configFiles) {
    if (file.path.toLowerCase().endsWith("packages.config")) {
      const packages = extractFromPackagesConfig(file.content);
      if (packages.length > 0) {
        results.set(file.path, packages);
      }
    }

    if (file.path.toLowerCase().endsWith("directory.packages.props")) {
      const packages = extractFromDirectoryPackagesProps(file.content);
      if (packages.length > 0) {
        results.set(file.path, packages);
      }
    }
  }

  return results;
}

function extractFromProjectFile(content: string): NuGetPackageInfo[] {
  const packages: NuGetPackageInfo[] = [];

  // <PackageReference Include="Name" Version="1.0.0" />
  const inlineRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/gi;
  let match;
  while ((match = inlineRegex.exec(content)) !== null) {
    packages.push({ name: match[1], version: match[2] });
  }

  // <PackageReference Include="Name"><Version>1.0.0</Version></PackageReference>
  const nestedRegex = /<PackageReference\s+Include="([^"]+)"[^>]*>\s*<Version>([^<]+)<\/Version>/gi;
  while ((match = nestedRegex.exec(content)) !== null) {
    if (!packages.some((p) => p.name === match![1])) {
      packages.push({ name: match[1], version: match[2] });
    }
  }

  // <PackageReference Include="Name" /> (Central Package Management - version comes from Directory.Packages.props)
  const cpmRegex = /<PackageReference\s+Include="([^"]+)"\s*\/>/gi;
  while ((match = cpmRegex.exec(content)) !== null) {
    if (!packages.some((p) => p.name === match![1])) {
      packages.push({ name: match[1], version: "(central)" });
    }
  }

  return packages;
}

function extractFromPackagesConfig(content: string): NuGetPackageInfo[] {
  const packages: NuGetPackageInfo[] = [];

  // <package id="Newtonsoft.Json" version="13.0.3" targetFramework="net48" />
  const regex = /<package\s+id="([^"]+)"\s+version="([^"]+)"(?:\s+targetFramework="([^"]+)")?/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    packages.push({
      name: match[1],
      version: match[2],
      targetFramework: match[3],
    });
  }

  return packages;
}

function extractFromDirectoryPackagesProps(content: string): NuGetPackageInfo[] {
  const packages: NuGetPackageInfo[] = [];

  // <PackageVersion Include="Name" Version="1.0.0" />
  const regex = /<PackageVersion\s+Include="([^"]+)"\s+Version="([^"]+)"/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    packages.push({ name: match[1], version: match[2] });
  }

  return packages;
}

export function getKeyPackages(packages: NuGetPackageInfo[]): NuGetPackageInfo[] {
  const keyPrefixes = [
    "microsoft.aspnetcore",
    "microsoft.entityframeworkcore",
    "microsoft.extensions",
    "microsoft.azure.functions",
    "microsoft.net.sdk",
    "microsoft.maui",
    "xamarin",
    "system.text.json",
    "newtonsoft.json",
    "swashbuckle",
    "polly",
    "mediatr",
    "automapper",
    "fluentvalidation",
    "serilog",
    "nlog",
    "dapper",
    "grpc",
    "microsoft.identity",
    "azure.",
  ];

  return packages.filter((p) =>
    keyPrefixes.some((prefix) => p.name.toLowerCase().startsWith(prefix))
  );
}
