import { DetectedProject, DotNetFlavor, LifecycleStatus, ProjectType } from "@/models/types";

export function makeProject(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    repoName: "contoso-web",
    repoId: "repo-1",
    projectFile: "/src/Contoso.Web/Contoso.Web.csproj",
    projectName: "Contoso.Web",
    projectType: ProjectType.WebApp,
    dotNetFlavor: DotNetFlavor.DotNet,
    targetFramework: "net8.0",
    targetFrameworks: ["net8.0"],
    lifecycleStatus: LifecycleStatus.Supported,
    eolDate: "2099-11-10",
    latestLts: ".NET 10",
    keyNuGetPackages: [],
    ...overrides,
  };
}
