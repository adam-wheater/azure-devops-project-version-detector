import { DetectedProject, ProjectType, DotNetFlavor } from "../../models/types";

export function isMauiProject(projectContent: string): boolean {
  // Check for <UseMaui>true</UseMaui>
  if (/<UseMaui>\s*true\s*<\/UseMaui>/i.test(projectContent)) {
    return true;
  }

  // Check for MAUI-specific SDK
  if (/Sdk="Microsoft\.NET\.Sdk\.Maui"/i.test(projectContent)) {
    return true;
  }

  // Check for MAUI packages
  if (/Include="Microsoft\.Maui/i.test(projectContent)) {
    return true;
  }

  // Check for MAUI-specific TFMs
  const tfmMatch = projectContent.match(/<TargetFrameworks?>\s*([^<]+)\s*<\/TargetFrameworks?>/i);
  if (tfmMatch) {
    const tfms = tfmMatch[1].split(";").map((t) => t.trim().toLowerCase());
    // "-windows" alone is not MAUI evidence: every WPF and WinForms project on
    // modern .NET targets e.g. net8.0-windows, and used to be reported as MAUI.
    const mauiPlatforms = ["-android", "-ios", "-maccatalyst", "-tizen"];
    const hasMauiTfm = tfms.some((tfm) => mauiPlatforms.some((p) => tfm.includes(p)));
    // MAUI exists from .NET 6 onwards; the check used to stop at .NET 9.
    const isMauiEra = (tfm: string) => {
      const m = tfm.match(/^net(\d+)\.\d/);
      return !!m && Number(m[1]) >= 6;
    };
    if (hasMauiTfm && tfms.some(isMauiEra)) {
      return true;
    }
  }

  return false;
}

export function enrichMauiProject(project: DetectedProject): DetectedProject {
  return {
    ...project,
    projectType: ProjectType.Maui,
    dotNetFlavor: DotNetFlavor.Maui,
  };
}

export function getMauiPlatforms(targetFrameworks: string[]): string[] {
  const platforms: string[] = [];
  for (const tfm of targetFrameworks) {
    const lower = tfm.toLowerCase();
    if (lower.includes("-android")) platforms.push("Android");
    if (lower.includes("-ios")) platforms.push("iOS");
    if (lower.includes("-maccatalyst")) platforms.push("macOS (Mac Catalyst)");
    if (lower.includes("-windows")) platforms.push("Windows");
    if (lower.includes("-tizen")) platforms.push("Tizen");
  }
  return [...new Set(platforms)];
}
