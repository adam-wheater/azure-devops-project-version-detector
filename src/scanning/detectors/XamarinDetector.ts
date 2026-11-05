import { DetectedProject, ProjectType, DotNetFlavor, LifecycleStatus } from "../../models/types";
import { getLatestLts } from "../../lifecycle/DotNetLifecycle";

export function isXamarinProject(projectContent: string): boolean {
  // Xamarin.Forms reference
  if (/Include="Xamarin\.Forms"/i.test(projectContent)) {
    return true;
  }

  // Xamarin.Essentials reference
  if (/Include="Xamarin\.Essentials"/i.test(projectContent)) {
    return true;
  }

  // Xamarin-specific project type GUIDs
  const xamarinGuids = [
    "EFBA0AD7-5A72-4C68-AF49-83D382785DCF", // Xamarin.Android
    "6BC8ED88-2882-458C-8E55-DFD12B67127B", // Xamarin.iOS
    "F5B4F3BC-B597-4E2B-B552-EF5D8A32436F", // Xamarin.Mac
  ];
  for (const guid of xamarinGuids) {
    if (projectContent.toUpperCase().includes(guid)) {
      return true;
    }
  }

  // Xamarin.Android or Xamarin.iOS imports
  if (
    /Import.*Xamarin\.Android/i.test(projectContent) ||
    /Import.*Xamarin\.iOS/i.test(projectContent)
  ) {
    return true;
  }

  // MonoAndroid or Xamarin TFMs
  if (
    /TargetFramework.*monoandroid/i.test(projectContent) ||
    /TargetFramework.*xamarin/i.test(projectContent)
  ) {
    return true;
  }

  return false;
}

export function enrichXamarinProject(project: DetectedProject): DetectedProject {
  return {
    ...project,
    projectType:
      project.projectType === ProjectType.Unknown ? ProjectType.Xamarin : project.projectType,
    dotNetFlavor: DotNetFlavor.Xamarin,
    lifecycleStatus: LifecycleStatus.EndOfLife,
    eolDate: "2024-05-01",
    latestLts: `.NET MAUI (${getLatestLts()})`,
  };
}

export function getXamarinPlatform(projectContent: string): string {
  if (
    /monoandroid/i.test(projectContent) ||
    /Xamarin\.Android/i.test(projectContent) ||
    /EFBA0AD7/i.test(projectContent)
  ) {
    return "Android";
  }
  if (
    /xamarin\.ios/i.test(projectContent) ||
    /xamarinios/i.test(projectContent) ||
    /6BC8ED88/i.test(projectContent)
  ) {
    return "iOS";
  }
  if (/xamarin\.mac/i.test(projectContent) || /F5B4F3BC/i.test(projectContent)) {
    return "macOS";
  }
  if (/Xamarin\.Forms/i.test(projectContent)) {
    return "Cross-platform (Xamarin.Forms)";
  }
  return "Unknown";
}
