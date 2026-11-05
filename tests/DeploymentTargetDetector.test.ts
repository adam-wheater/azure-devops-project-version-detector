import {
  extractPipelineDeploySignals,
  findProjectDockerfile,
  projectHasControllers,
  hasContainerTooling,
  resolveDeploymentTarget,
  refineProjectType,
  annotateProjectSignals,
  RepoDeploySignals,
  PipelineDeploySignals,
} from "@/scanning/detectors/DeploymentTargetDetector";
import {
  DetectedProject,
  DeploymentTarget,
  DotNetFlavor,
  FunctionAppModel,
  LifecycleStatus,
  ProjectType,
} from "@/models/types";

function makeProject(overrides: Partial<DetectedProject> = {}): DetectedProject {
  return {
    repoName: "repo",
    repoId: "repo-1",
    projectFile: "/src/Billing.Api/Billing.Api.csproj",
    projectName: "Billing.Api",
    projectType: ProjectType.WebApi,
    dotNetFlavor: DotNetFlavor.DotNet,
    targetFramework: "net8.0",
    targetFrameworks: ["net8.0"],
    lifecycleStatus: LifecycleStatus.Supported,
    latestLts: ".NET 10",
    keyNuGetPackages: [],
    ...overrides,
  };
}

const NO_REPO_SIGNALS: RepoDeploySignals = {
  dockerfilePaths: [],
  composeFilePaths: [],
  kubernetesFilePaths: [],
  controllerFilePaths: [],
  razorFilePaths: [],
};

const NO_PIPELINE_SIGNALS: PipelineDeploySignals = {
  hasWebAppDeploy: false,
  hasWebAppContainerDeploy: false,
  hasFunctionAppDeploy: false,
  hasContainerAppDeploy: false,
  hasStaticWebAppDeploy: false,
  hasKubernetesDeploy: false,
  hasDockerBuild: false,
};

describe("extractPipelineDeploySignals", () => {
  it("detects App Service deploy tasks", () => {
    const signals = extractPipelineDeploySignals([
      {
        path: "/azure-pipelines.yml",
        content: "steps:\n- task: AzureWebApp@1\n  inputs:\n    appName: billing",
      },
    ]);
    expect(signals.hasWebAppDeploy).toBe(true);
    expect(signals.hasContainerAppDeploy).toBe(false);
  });

  it("detects classic AzureRmWebAppDeployment tasks", () => {
    const signals = extractPipelineDeploySignals([
      { path: "/p.yml", content: "- task: AzureRmWebAppDeployment@4" },
    ]);
    expect(signals.hasWebAppDeploy).toBe(true);
  });

  it("detects Web App for Containers", () => {
    const signals = extractPipelineDeploySignals([
      {
        path: "/p.yml",
        content: "- task: AzureRmWebAppDeployment@4\n  inputs:\n    appType: webAppContainer",
      },
    ]);
    expect(signals.hasWebAppContainerDeploy).toBe(true);
  });

  it("detects function app, container app, static web app, kubernetes and docker builds", () => {
    const signals = extractPipelineDeploySignals([
      {
        path: "/p.yml",
        content: [
          "- task: AzureFunctionApp@2",
          "- task: AzureContainerApps@1",
          "- task: AzureStaticWebApp@0",
          "- task: KubernetesManifest@1",
          "- task: Docker@2",
        ].join("\n"),
      },
    ]);
    expect(signals.hasFunctionAppDeploy).toBe(true);
    expect(signals.hasContainerAppDeploy).toBe(true);
    expect(signals.hasStaticWebAppDeploy).toBe(true);
    expect(signals.hasKubernetesDeploy).toBe(true);
    expect(signals.hasDockerBuild).toBe(true);
  });

  it("detects az cli deployments", () => {
    const signals = extractPipelineDeploySignals([
      {
        path: "/p.yml",
        content: "script: az webapp deploy --name billing\nscript: az containerapp update",
      },
    ]);
    expect(signals.hasWebAppDeploy).toBe(true);
    expect(signals.hasContainerAppDeploy).toBe(true);
  });

  it("returns all false for empty pipelines", () => {
    const signals = extractPipelineDeploySignals([]);
    expect(Object.values(signals).every((v) => v === false)).toBe(true);
  });
});

describe("findProjectDockerfile", () => {
  it("prefers a Dockerfile in the project's own directory", () => {
    const result = findProjectDockerfile(
      "/src/Billing.Api/Billing.Api.csproj",
      "Billing.Api",
      ["/Dockerfile", "/src/Billing.Api/Dockerfile"],
      false
    );
    expect(result).toBe("/src/Billing.Api/Dockerfile");
  });

  it("falls back to a name-matched Dockerfile", () => {
    const result = findProjectDockerfile(
      "/src/Billing.Api/Billing.Api.csproj",
      "Billing.Api",
      ["/docker/billing.api.Dockerfile", "/docker/orders.Dockerfile"],
      false
    );
    expect(result).toBe("/docker/billing.api.Dockerfile");
  });

  it("uses any Dockerfile only for single-project repos", () => {
    const single = findProjectDockerfile("/src/App/App.csproj", "App", ["/Dockerfile"], true);
    expect(single).toBe("/Dockerfile");

    const multi = findProjectDockerfile("/src/Web/Web.csproj", "Web", ["/Dockerfile"], false);
    expect(multi).toBeUndefined();
  });

  it("returns undefined when there are no Dockerfiles", () => {
    expect(findProjectDockerfile("/src/App/App.csproj", "App", [], true)).toBeUndefined();
  });
});

describe("projectHasControllers", () => {
  it("finds controllers under the project directory", () => {
    expect(
      projectHasControllers("/src/Billing.Api/Billing.Api.csproj", [
        "/src/Billing.Api/Controllers/InvoiceController.cs",
      ])
    ).toBe(true);
  });

  it("ignores controllers belonging to other projects", () => {
    expect(
      projectHasControllers("/src/Billing.Api/Billing.Api.csproj", [
        "/src/Orders.Api/Controllers/OrderController.cs",
      ])
    ).toBe(false);
  });
});

describe("hasContainerTooling", () => {
  it("detects the SDK container publish package", () => {
    expect(
      hasContainerTooling(
        '<PackageReference Include="Microsoft.NET.Build.Containers" Version="8.0.0" />'
      )
    ).toContain("Microsoft.NET.Build.Containers");
  });

  it("detects Visual Studio container tools", () => {
    expect(
      hasContainerTooling(
        '<PackageReference Include="Microsoft.VisualStudio.Azure.Containers.Tools.Targets" Version="1.19.5" />'
      )
    ).toContain("Visual Studio container tools");
  });

  it("detects EnableSdkContainerSupport", () => {
    expect(
      hasContainerTooling("<EnableSdkContainerSupport>true</EnableSdkContainerSupport>")
    ).toContain("EnableSdkContainerSupport");
  });

  it("returns null for a plain project", () => {
    expect(hasContainerTooling('<Project Sdk="Microsoft.NET.Sdk.Web"></Project>')).toBeNull();
  });
});

describe("resolveDeploymentTarget", () => {
  it("returns null for class libraries and test projects", () => {
    for (const projectType of [ProjectType.ClassLibrary, ProjectType.TestProject]) {
      const verdict = resolveDeploymentTarget(
        makeProject({ projectType }),
        "",
        NO_REPO_SIGNALS,
        NO_PIPELINE_SIGNALS,
        "",
        false
      );
      expect(verdict).toBeNull();
    }
  });

  it("confirms Function App from the functions package", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({
        projectType: ProjectType.FunctionApp,
        functionAppModel: FunctionAppModel.Isolated,
      }),
      "",
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.FunctionApp);
    expect(verdict.confidence).toBe("confirmed");
  });

  it("confirms Container App when pipeline enrichment already matched it", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ containerAppEnvironment: "prod-env" }),
      "",
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.ContainerApp);
    expect(verdict.confidence).toBe("confirmed");
    expect(verdict.evidence.join(" ")).toContain("prod-env");
  });

  it("confirms App Service from a correlated web app deploy task", () => {
    const verdict = resolveDeploymentTarget(
      makeProject(),
      "",
      NO_REPO_SIGNALS,
      { ...NO_PIPELINE_SIGNALS, hasWebAppDeploy: true },
      "deploy billing.api to production",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.AppService);
    expect(verdict.confidence).toBe("confirmed");
  });

  it("confirms Static Web Apps for Blazor WASM with an SWA deploy", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ projectType: ProjectType.BlazorWasm, projectName: "Portal" }),
      "",
      NO_REPO_SIGNALS,
      { ...NO_PIPELINE_SIGNALS, hasStaticWebAppDeploy: true },
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.StaticWebApp);
    expect(verdict.confidence).toBe("confirmed");
  });

  it("infers Kubernetes for a containerized project with k8s manifests", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ dockerfilePath: "/src/Billing.Api/Dockerfile" }),
      "",
      { ...NO_REPO_SIGNALS, kubernetesFilePaths: ["/k8s/deployment.yaml"] },
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.Kubernetes);
    expect(verdict.confidence).toBe("likely");
  });

  it("marks Kubernetes confirmed when the pipeline deploys manifests", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ dockerfilePath: "/src/Billing.Api/Dockerfile" }),
      "",
      NO_REPO_SIGNALS,
      { ...NO_PIPELINE_SIGNALS, hasKubernetesDeploy: true },
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.Kubernetes);
    expect(verdict.confidence).toBe("confirmed");
  });

  it("infers Container App for an API with controllers and a Dockerfile", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({
        dockerfilePath: "/src/Billing.Api/Dockerfile",
        hasControllers: true,
      }),
      "",
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.ContainerApp);
    expect(verdict.confidence).toBe("likely");
    expect(verdict.evidence.join(" ")).toContain("Dockerfile");
    expect(verdict.evidence.join(" ")).toContain("Controllers");
  });

  it("treats container tooling in the csproj as containerization", () => {
    const verdict = resolveDeploymentTarget(
      makeProject(),
      '<PackageReference Include="Microsoft.NET.Build.Containers" Version="8.0.0" />',
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.ContainerApp);
    expect(verdict.confidence).toBe("likely");
  });

  it("infers App Service for a Blazor app without container signals", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ projectType: ProjectType.BlazorServer }),
      "",
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.AppService);
    expect(verdict.confidence).toBe("likely");
    expect(verdict.evidence.join(" ")).toContain("Blazor Server");
  });

  it("infers App Service for a plain web app without a Dockerfile", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ projectType: ProjectType.WebApp }),
      "",
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.AppService);
    expect(verdict.confidence).toBe("likely");
  });

  it("returns null for a worker with no deployment signals", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ projectType: ProjectType.Worker }),
      "",
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    );
    expect(verdict).toBeNull();
  });

  it("correlates by sole-deployable-project when the name is not in the pipeline", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({ projectName: "Web" }),
      "",
      NO_REPO_SIGNALS,
      { ...NO_PIPELINE_SIGNALS, hasWebAppDeploy: true },
      "deploy $(appName) to $(slot)",
      true
    )!;
    expect(verdict.target).toBe(DeploymentTarget.AppService);
    expect(verdict.confidence).toBe("confirmed");
  });

  it("prefers Function App over Dockerfile heuristics", () => {
    const verdict = resolveDeploymentTarget(
      makeProject({
        projectType: ProjectType.FunctionApp,
        functionAppModel: FunctionAppModel.InProcess,
        dockerfilePath: "/Dockerfile",
      }),
      "",
      NO_REPO_SIGNALS,
      NO_PIPELINE_SIGNALS,
      "",
      false
    )!;
    expect(verdict.target).toBe(DeploymentTarget.FunctionApp);
  });
});

describe("refineProjectType", () => {
  it("upgrades WebApp to WebApi when the project has controllers", () => {
    const refined = refineProjectType(
      makeProject({ projectType: ProjectType.WebApp, hasControllers: true }),
      NO_REPO_SIGNALS
    );
    expect(refined.projectType).toBe(ProjectType.WebApi);
  });

  it("upgrades WebApp to BlazorServer when the project has .razor components", () => {
    const refined = refineProjectType(
      makeProject({
        projectType: ProjectType.WebApp,
        projectFile: "/src/Portal/Portal.csproj",
        projectName: "Portal",
      }),
      { ...NO_REPO_SIGNALS, razorFilePaths: ["/src/Portal/Components/App.razor"] }
    );
    expect(refined.projectType).toBe(ProjectType.BlazorServer);
  });

  it("prefers Blazor over WebApi when a project has both razor files and controllers", () => {
    const refined = refineProjectType(
      makeProject({
        projectType: ProjectType.WebApp,
        projectFile: "/src/Portal/Portal.csproj",
        hasControllers: true,
      }),
      { ...NO_REPO_SIGNALS, razorFilePaths: ["/src/Portal/Components/App.razor"] }
    );
    expect(refined.projectType).toBe(ProjectType.BlazorServer);
  });

  it("ignores razor files belonging to other projects", () => {
    const refined = refineProjectType(
      makeProject({ projectType: ProjectType.WebApp, projectFile: "/src/Api/Api.csproj" }),
      { ...NO_REPO_SIGNALS, razorFilePaths: ["/src/Portal/Components/App.razor"] }
    );
    expect(refined.projectType).toBe(ProjectType.WebApp);
  });

  it("leaves other types alone", () => {
    const blazor = refineProjectType(
      makeProject({ projectType: ProjectType.BlazorServer, hasControllers: true }),
      NO_REPO_SIGNALS
    );
    expect(blazor.projectType).toBe(ProjectType.BlazorServer);

    const noControllers = refineProjectType(
      makeProject({ projectType: ProjectType.WebApp, hasControllers: false }),
      NO_REPO_SIGNALS
    );
    expect(noControllers.projectType).toBe(ProjectType.WebApp);
  });
});

describe("annotateProjectSignals", () => {
  it("stamps dockerfile and controllers facts onto the project", () => {
    const annotated = annotateProjectSignals(
      makeProject(),
      {
        ...NO_REPO_SIGNALS,
        dockerfilePaths: ["/src/Billing.Api/Dockerfile"],
        controllerFilePaths: ["/src/Billing.Api/Controllers/InvoiceController.cs"],
      },
      false
    );
    expect(annotated.dockerfilePath).toBe("/src/Billing.Api/Dockerfile");
    expect(annotated.hasControllers).toBe(true);
  });
});
