import {
  DetectedProject,
  DeploymentTarget,
  DeploymentConfidence,
  FileContent,
  ProjectType,
} from "../../models/types";

/**
 * Deployment signals read from a repo's Azure DevOps pipeline YAML
 * (root pipelines plus resolved templates, concatenated).
 */
export interface PipelineDeploySignals {
  hasWebAppDeploy: boolean;
  hasWebAppContainerDeploy: boolean;
  hasFunctionAppDeploy: boolean;
  hasContainerAppDeploy: boolean;
  hasStaticWebAppDeploy: boolean;
  hasKubernetesDeploy: boolean;
  hasDockerBuild: boolean;
}

export function extractPipelineDeploySignals(pipelineFiles: FileContent[]): PipelineDeploySignals {
  const yaml = pipelineFiles.map((f) => f.content).join("\n");

  return {
    hasWebAppDeploy:
      /task:\s*AzureWebApp@\d+/i.test(yaml) ||
      /task:\s*AzureRmWebAppDeployment@\d+/i.test(yaml) ||
      /az\s+webapp\s+(deploy|create|up)/i.test(yaml),
    hasWebAppContainerDeploy:
      /task:\s*AzureWebAppContainer@\d+/i.test(yaml) ||
      /appType:\s*['"]?webAppContainer/i.test(yaml),
    hasFunctionAppDeploy:
      /task:\s*AzureFunctionApp(Container)?@\d+/i.test(yaml) ||
      /func\s+azure\s+functionapp\s+publish/i.test(yaml) ||
      /az\s+functionapp\s+(deployment|create)/i.test(yaml),
    hasContainerAppDeploy:
      /task:\s*AzureContainerApps@\d+/i.test(yaml) ||
      /az\s+containerapp\s+(create|update|deploy|up)/i.test(yaml),
    hasStaticWebAppDeploy:
      /task:\s*AzureStaticWebApp@\d+/i.test(yaml) || /az\s+staticwebapp\s+/i.test(yaml),
    hasKubernetesDeploy:
      /task:\s*(KubernetesManifest|HelmDeploy|Kubernetes)@\d+/i.test(yaml) ||
      /kubectl\s+apply/i.test(yaml) ||
      /helm\s+(upgrade|install)/i.test(yaml),
    hasDockerBuild: /task:\s*Docker@\d+/i.test(yaml) || /docker\s+build/i.test(yaml),
  };
}

/** Repo-tree signals relevant to a single repo's deployment inference. */
export interface RepoDeploySignals {
  dockerfilePaths: string[];
  composeFilePaths: string[];
  kubernetesFilePaths: string[];
  controllerFilePaths: string[];
  razorFilePaths: string[];
}

function dirOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx <= 0 ? "/" : normalized.substring(0, idx);
}

function isUnderDir(path: string, dir: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (dir === "/") return true;
  return normalized.startsWith(dir + "/");
}

/**
 * Associate a Dockerfile with a project. In order of strength:
 * 1. A Dockerfile inside the project's own directory (the Visual Studio
 *    convention puts it right next to the .csproj).
 * 2. A Dockerfile whose name mentions the project (e.g. `Billing.Api.Dockerfile`).
 * 3. Any Dockerfile, but only when this is the repo's single project — in a
 *    multi-project repo a root Dockerfile can't be attributed blindly.
 */
export function findProjectDockerfile(
  projectFile: string,
  projectName: string,
  dockerfilePaths: string[],
  isOnlyProjectInRepo: boolean
): string | undefined {
  if (dockerfilePaths.length === 0) return undefined;

  const projectDir = dirOf(projectFile);
  const inProjectDir = dockerfilePaths.find((d) => isUnderDir(d, projectDir));
  if (inProjectDir) return inProjectDir;

  const nameLower = projectName.toLowerCase();
  if (nameLower.length >= 2) {
    const nameMatch = dockerfilePaths.find((d) => d.toLowerCase().includes(nameLower));
    if (nameMatch) return nameMatch;
  }

  if (isOnlyProjectInRepo) {
    return dockerfilePaths[0];
  }

  return undefined;
}

export function projectHasControllers(projectFile: string, controllerFilePaths: string[]): boolean {
  const projectDir = dirOf(projectFile);
  return controllerFilePaths.some((p) => isUnderDir(p, projectDir));
}

export function projectHasRazorFiles(projectFile: string, razorFilePaths: string[]): boolean {
  const projectDir = dirOf(projectFile);
  return razorFilePaths.some((p) => isUnderDir(p, projectDir));
}

/** Container tooling declared in the project file itself. */
export function hasContainerTooling(projectContent: string): string | null {
  if (/Microsoft\.NET\.Build\.Containers/i.test(projectContent)) {
    return "Microsoft.NET.Build.Containers package (SDK container publish)";
  }
  if (/Microsoft\.VisualStudio\.Azure\.Containers\.Tools\.Targets/i.test(projectContent)) {
    return "Visual Studio container tools package";
  }
  if (/<EnableSdkContainerSupport>\s*true/i.test(projectContent)) {
    return "EnableSdkContainerSupport property";
  }
  if (/<DockerfileFile>|<DockerfileContext>/i.test(projectContent)) {
    return "Dockerfile property in project file";
  }
  return null;
}

const WEB_SHAPED_TYPES = new Set<ProjectType>([
  ProjectType.WebApp,
  ProjectType.WebApi,
  ProjectType.BlazorServer,
  ProjectType.BlazorWasm,
]);

const DEPLOYABLE_TYPES = new Set<ProjectType>([
  ...WEB_SHAPED_TYPES,
  ProjectType.Worker,
  ProjectType.Console,
  ProjectType.FunctionApp,
  ProjectType.ContainerApp,
]);

export interface DeploymentVerdict {
  target: DeploymentTarget;
  confidence: DeploymentConfidence;
  evidence: string[];
}

/**
 * Decide where a project deploys, from strongest evidence to weakest:
 * explicit signals (Functions packages, a pipeline deploy task correlated to
 * this project) beat structural inference (Dockerfile → container platform,
 * Blazor/ASP.NET without container signals → App Service).
 */
export function resolveDeploymentTarget(
  project: DetectedProject,
  projectContent: string,
  repoSignals: RepoDeploySignals,
  pipeline: PipelineDeploySignals,
  pipelineYamlLower: string,
  isOnlyDeployableProject: boolean
): DeploymentVerdict | null {
  if (!DEPLOYABLE_TYPES.has(project.projectType)) {
    return null;
  }

  const nameLower = project.projectName.toLowerCase();
  const nameInPipeline =
    nameLower.length >= 2 && pipelineYamlLower.includes(nameLower) ? true : isOnlyDeployableProject;

  // 1. Azure Functions: the worker/SDK package in the csproj is definitive.
  if (project.functionAppModel || project.projectType === ProjectType.FunctionApp) {
    const evidence = ["Azure Functions package in project file"];
    if (pipeline.hasFunctionAppDeploy && nameInPipeline) {
      evidence.push("Function App deploy task in pipeline");
    }
    return { target: DeploymentTarget.FunctionApp, confidence: "confirmed", evidence };
  }

  const dockerfile = project.dockerfilePath;
  const tooling = hasContainerTooling(projectContent);
  const containerized = !!dockerfile || !!tooling;
  const containerEvidence: string[] = [];
  if (dockerfile) containerEvidence.push(`Dockerfile at ${dockerfile}`);
  if (tooling) containerEvidence.push(tooling);

  // 2. Container Apps: the existing pipeline enrichment already correlated
  //    this project to an AzureContainerApps deployment.
  if (project.containerAppEnvironment) {
    return {
      target: DeploymentTarget.ContainerApp,
      confidence: "confirmed",
      evidence: [
        `Container Apps deployment in pipeline (environment: ${project.containerAppEnvironment})`,
        ...containerEvidence,
      ],
    };
  }
  if (pipeline.hasContainerAppDeploy && nameInPipeline && containerized) {
    return {
      target: DeploymentTarget.ContainerApp,
      confidence: "confirmed",
      evidence: ["Container Apps deploy task in pipeline", ...containerEvidence],
    };
  }

  // 3. Static Web Apps: Blazor WebAssembly with an SWA deploy in the pipeline.
  if (pipeline.hasStaticWebAppDeploy && project.projectType === ProjectType.BlazorWasm) {
    return {
      target: DeploymentTarget.StaticWebApp,
      confidence: "confirmed",
      evidence: ["Static Web Apps deploy task in pipeline", "Blazor WebAssembly project"],
    };
  }

  // 4. App Service: a Web App deploy task correlated to this project.
  if ((pipeline.hasWebAppDeploy || pipeline.hasWebAppContainerDeploy) && nameInPipeline) {
    const evidence = ["App Service deploy task in pipeline"];
    if (pipeline.hasWebAppContainerDeploy) {
      evidence.push("Deployed as a container (Web App for Containers)");
    }
    evidence.push(...containerEvidence);
    return { target: DeploymentTarget.AppService, confidence: "confirmed", evidence };
  }

  // 5. Kubernetes: containerized project plus k8s manifests or deploy tasks.
  if (
    containerized &&
    (pipeline.hasKubernetesDeploy || repoSignals.kubernetesFilePaths.length > 0)
  ) {
    const evidence = [...containerEvidence];
    if (pipeline.hasKubernetesDeploy) evidence.push("Kubernetes deploy task in pipeline");
    if (repoSignals.kubernetesFilePaths.length > 0) {
      evidence.push(`Kubernetes manifests in repo (${repoSignals.kubernetesFilePaths[0]})`);
    }
    return {
      target: DeploymentTarget.Kubernetes,
      confidence: pipeline.hasKubernetesDeploy ? "confirmed" : "likely",
      evidence,
    };
  }

  // 6. Containerized without a pinpointed platform → most likely Container Apps.
  if (containerized) {
    const evidence = [...containerEvidence];
    if (project.hasControllers) evidence.push("API project with a Controllers folder");
    if (pipeline.hasDockerBuild) evidence.push("Docker build step in pipeline");
    return { target: DeploymentTarget.ContainerApp, confidence: "likely", evidence };
  }

  // 7. Web-shaped project with no container signals → App Service.
  if (WEB_SHAPED_TYPES.has(project.projectType) || project.hasControllers) {
    const evidence: string[] = [];
    if (
      project.projectType === ProjectType.BlazorServer ||
      project.projectType === ProjectType.BlazorWasm
    ) {
      evidence.push(`${project.projectType} project`);
    } else if (project.hasControllers) {
      evidence.push("ASP.NET Core project with a Controllers folder");
    } else {
      evidence.push("ASP.NET Core web project");
    }
    evidence.push("No Dockerfile or container tooling found");
    return { target: DeploymentTarget.AppService, confidence: "likely", evidence };
  }

  // Workers/consoles with no signals: better to say nothing than to guess.
  return null;
}

/**
 * Sharpen the project type using repo-tree knowledge the csproj alone can't
 * provide:
 * - A Web SDK project with .razor components is Blazor. Modern Blazor Web
 *   App templates (.NET 8+) reference no Components package — it's implicit
 *   in the Web SDK — so package-based detection misses them entirely.
 * - A Web SDK project with a Controllers folder is an API even when it
 *   doesn't reference Swashbuckle/OpenAPI packages.
 * Blazor is checked first: a Blazor app that also exposes API controllers is
 * still primarily a Blazor app.
 */
export function refineProjectType(
  project: DetectedProject,
  repoSignals: RepoDeploySignals
): DetectedProject {
  if (
    project.projectType === ProjectType.WebApp &&
    projectHasRazorFiles(project.projectFile, repoSignals.razorFilePaths)
  ) {
    return { ...project, projectType: ProjectType.BlazorServer };
  }
  if (project.projectType === ProjectType.WebApp && project.hasControllers) {
    return { ...project, projectType: ProjectType.WebApi };
  }
  return project;
}

/** Stamp repo-tree facts (Dockerfile, Controllers) onto a project. */
export function annotateProjectSignals(
  project: DetectedProject,
  repoSignals: RepoDeploySignals,
  isOnlyProjectInRepo: boolean
): DetectedProject {
  return {
    ...project,
    dockerfilePath: findProjectDockerfile(
      project.projectFile,
      project.projectName,
      repoSignals.dockerfilePaths,
      isOnlyProjectInRepo
    ),
    hasControllers: projectHasControllers(project.projectFile, repoSignals.controllerFilePaths),
  };
}
