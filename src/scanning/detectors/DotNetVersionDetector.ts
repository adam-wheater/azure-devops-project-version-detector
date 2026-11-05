import {
  DetectedProject,
  ProjectType,
  FileContent,
  NuGetPackageInfo,
  FrameworkLifecycle,
} from "../../models/types";
import { getLifecycleForFramework, getFlavorFromTfm } from "../../lifecycle/DotNetLifecycle";

export interface GlobalJsonInfo {
  sdkVersion?: string;
}

export function parseGlobalJson(content: string): GlobalJsonInfo {
  try {
    const json = JSON.parse(content);
    return { sdkVersion: json?.sdk?.version };
  } catch {
    return {};
  }
}

export function detectProjects(
  repoName: string,
  repoId: string,
  projectFiles: FileContent[],
  configFiles: FileContent[],
  globalJsonInfo: GlobalJsonInfo,
  lifecycleData?: FrameworkLifecycle[] | null
): DetectedProject[] {
  const projects: DetectedProject[] = [];

  for (const file of projectFiles) {
    const detected = parseProjectFile(
      repoName,
      repoId,
      file,
      configFiles,
      globalJsonInfo,
      lifecycleData
    );
    if (detected.length > 0) {
      projects.push(...detected);
    }
  }

  return projects;
}

function parseProjectFile(
  repoName: string,
  repoId: string,
  file: FileContent,
  configFiles: FileContent[],
  globalJsonInfo: GlobalJsonInfo,
  lifecycleData?: FrameworkLifecycle[] | null
): DetectedProject[] {
  const content = file.content;
  const projectName = extractProjectName(file.path);

  // Extract target framework(s). SDK-style repos often set them once in a
  // Directory.Build.props instead of in every project file; those projects
  // used to be skipped entirely because the config files were never read.
  let targetFrameworks = extractTargetFrameworks(content);
  if (targetFrameworks.length === 0) {
    targetFrameworks = inheritedTargetFrameworks(file.path, configFiles);
  }
  if (targetFrameworks.length === 0) {
    return [];
  }

  // Extract NuGet packages
  const nugetPackages = extractNuGetPackageReferences(content);

  // Detect project type
  const projectType = detectProjectType(content, nugetPackages);

  // Determine flavor from primary TFM
  const primaryTfm = targetFrameworks[0];
  const flavor = getFlavorFromTfm(primaryTfm);
  const lifecycle = getLifecycleForFramework(primaryTfm, lifecycleData);

  return [
    {
      repoName,
      repoId,
      projectFile: file.path,
      projectName,
      projectType,
      dotNetFlavor: flavor,
      targetFramework: primaryTfm,
      targetFrameworks,
      sdkVersion: globalJsonInfo.sdkVersion,
      lifecycleStatus: lifecycle.status,
      eolDate: lifecycle.eolDate,
      latestLts: lifecycle.latestLts,
      keyNuGetPackages: nugetPackages,
    },
  ];
}

function directoryOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(0, slash).toLowerCase() : "";
}

/**
 * Target frameworks a project inherits from the nearest Directory.Build.props
 * in its own folder or an ancestor that sets them. MSBuild imports only the
 * nearest file automatically, which usually imports its parent in turn, so
 * the nearest file that actually names a framework is the one that applies.
 * Values that are still MSBuild properties (`$(...)`) cannot be resolved here
 * and are ignored.
 */
export function inheritedTargetFrameworks(
  projectPath: string,
  configFiles: FileContent[]
): string[] {
  const projectDir = directoryOf(projectPath);
  const candidates = configFiles
    .filter((f) => /(^|[\\/])directory\.build\.props$/i.test(f.path))
    .map((f) => ({ file: f, dir: directoryOf(f.path) }))
    .filter((c) => projectDir === c.dir || projectDir.startsWith(`${c.dir}/`))
    .sort((a, b) => b.dir.length - a.dir.length);

  for (const candidate of candidates) {
    const frameworks = extractTargetFrameworks(candidate.file.content).filter(
      (tfm) => !tfm.includes("$(")
    );
    if (frameworks.length > 0) return frameworks;
  }
  return [];
}

function extractProjectName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  const fileName = parts[parts.length - 1];
  return fileName.replace(/\.(csproj|fsproj|vbproj)$/i, "");
}

export function extractTargetFrameworks(content: string): string[] {
  // Multi-targeting: <TargetFrameworks>
  const multiMatch = content.match(/<TargetFrameworks>\s*([^<]+)\s*<\/TargetFrameworks>/i);
  if (multiMatch) {
    return multiMatch[1]
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Single target: <TargetFramework>
  const singleMatch = content.match(/<TargetFramework>\s*([^<]+)\s*<\/TargetFramework>/i);
  if (singleMatch) {
    return [singleMatch[1].trim()];
  }

  // Legacy .NET Framework project: <TargetFrameworkVersion>
  const legacyMatch = content.match(
    /<TargetFrameworkVersion>\s*v([^<]+)\s*<\/TargetFrameworkVersion>/i
  );
  if (legacyMatch) {
    const version = legacyMatch[1].replace(/\./g, "");
    return [`net${version}`];
  }

  return [];
}

/**
 * PackageReference items in document order, whatever order their attributes
 * are written in. The version comes from a Version / VersionOverride
 * attribute, a child <Version> element, or - under Central Package
 * Management, where the project names no version at all - "(central)".
 * Matching only `Include="..." Version="..."` in that exact order missed every
 * CPM reference and any reference with another attribute in between, which
 * in turn hid test, Functions and Blazor projects from project-type detection.
 */
export function extractNuGetPackageReferences(content: string): NuGetPackageInfo[] {
  const packages: NuGetPackageInfo[] = [];
  const seen = new Set<string>();
  const tagRegex = /<PackageReference\b([^>]*?)(\/?)>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    const attributes = match[1];
    const name = readAttribute(attributes, "Include");
    if (!name || seen.has(name.toLowerCase())) continue;

    let version =
      readAttribute(attributes, "Version") ?? readAttribute(attributes, "VersionOverride");
    if (!version && match[2] !== "/") {
      const rest = content.slice(tagRegex.lastIndex);
      const close = rest.search(/<\/PackageReference\s*>/i);
      const body = close >= 0 ? rest.slice(0, close) : "";
      const child = body.match(/<(Version|VersionOverride)>\s*([^<]+?)\s*<\/\1>/i);
      version = child?.[2];
    }

    seen.add(name.toLowerCase());
    packages.push({ name, version: version || "(central)" });
  }

  return packages;
}

function readAttribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
  );
  if (!match) return undefined;
  const value = (match[1] ?? match[2] ?? "").trim();
  return value || undefined;
}

function detectProjectType(content: string, nugetPackages: NuGetPackageInfo[]): ProjectType {
  const packageNames = nugetPackages.map((p) => p.name.toLowerCase());
  const contentLower = content.toLowerCase();

  // MAUI
  if (
    /<UseMaui>\s*true\s*<\/UseMaui>/i.test(content) ||
    packageNames.some((p) => p.startsWith("microsoft.maui"))
  ) {
    return ProjectType.Maui;
  }

  // Xamarin
  if (
    packageNames.some(
      (p) =>
        p === "xamarin.forms" ||
        p === "xamarin.essentials" ||
        p.startsWith("xamarin.android") ||
        p.startsWith("xamarin.ios")
    )
  ) {
    return ProjectType.Xamarin;
  }

  // Azure Functions
  if (
    packageNames.some(
      (p) =>
        p === "microsoft.azure.functions.worker" ||
        p === "microsoft.azure.functions.worker.sdk" ||
        p === "microsoft.net.sdk.functions"
    )
  ) {
    return ProjectType.FunctionApp;
  }

  // Test project
  if (
    packageNames.some(
      (p) =>
        p === "microsoft.net.test.sdk" ||
        p === "xunit" ||
        p === "nunit" ||
        p === "mstest.testframework"
    ) ||
    contentLower.includes("<ispackable>false</ispackable>")
  ) {
    return ProjectType.TestProject;
  }

  // Blazor WebAssembly
  if (packageNames.some((p) => p === "microsoft.aspnetcore.components.webassembly")) {
    return ProjectType.BlazorWasm;
  }

  // Blazor Server
  if (
    packageNames.some(
      (p) =>
        p === "microsoft.aspnetcore.components.webassembly.server" ||
        p === "microsoft.aspnetcore.components"
    ) &&
    contentLower.includes("microsoft.net.sdk.web")
  ) {
    return ProjectType.BlazorServer;
  }

  // Worker Service
  if (
    packageNames.some((p) => p === "microsoft.extensions.hosting") &&
    contentLower.includes("microsoft.net.sdk.worker")
  ) {
    return ProjectType.Worker;
  }

  // Web API / Web App
  if (contentLower.includes("microsoft.net.sdk.web")) {
    if (
      packageNames.some(
        (p) => p === "swashbuckle.aspnetcore" || p === "microsoft.aspnetcore.openapi"
      )
    ) {
      return ProjectType.WebApi;
    }
    return ProjectType.WebApp;
  }

  // WPF
  if (
    contentLower.includes("<useWPF>true</useWPF>".toLowerCase()) ||
    (contentLower.includes("microsoft.net.sdk.windowsdesktop") &&
      contentLower.includes("<usewpf>true</usewpf>"))
  ) {
    return ProjectType.WPF;
  }

  // WinForms
  if (contentLower.includes("<useWindowsForms>true</useWindowsForms>".toLowerCase())) {
    return ProjectType.WinForms;
  }

  // Console app
  if (contentLower.includes("<outputtype>exe</outputtype>")) {
    return ProjectType.Console;
  }

  // Default: Class Library
  if (
    contentLower.includes("<outputtype>library</outputtype>") ||
    contentLower.includes("microsoft.net.sdk")
  ) {
    return ProjectType.ClassLibrary;
  }

  return ProjectType.Unknown;
}
