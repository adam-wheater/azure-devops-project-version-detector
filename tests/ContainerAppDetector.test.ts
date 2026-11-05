import {
  detectContainerApps,
  extractTemplateReferences,
  resolveTemplatePath,
} from "@/scanning/detectors/ContainerAppDetector";

describe("ContainerAppDetector", () => {
  it("should detect AzureContainerApps task", () => {
    const pipelineContent = `
trigger:
  - main

stages:
  - stage: Deploy
    jobs:
      - job: DeployContainerApp
        steps:
          - task: AzureContainerApps@1
            inputs:
              containerAppEnvironment: my-env-prod
              containerAppName: my-app
              imageToDeploy: myacr.azurecr.io/myapp:latest
              workloadProfileName: Consumption`;

    const results = detectContainerApps([
      { path: "azure-pipelines.yml", content: pipelineContent },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("my-env-prod");
    expect(results[0].hasWorkloadProfile).toBe(true);
    expect(results[0].pipelineFile).toBe("azure-pipelines.yml");
  });

  it("should detect az containerapp CLI commands", () => {
    const pipelineContent = `
steps:
  - script: |
      az containerapp create \\
        --name my-app \\
        --environment my-container-env \\
        --image myacr.azurecr.io/myapp:latest`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("my-container-env");
    expect(results[0].hasWorkloadProfile).toBe(false);
  });

  it("should detect variable references in environment", () => {
    const pipelineContent = `
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppEnvironment: $(ContainerAppEnv)`;

    const results = detectContainerApps([
      { path: "pipelines/deploy.yml", content: pipelineContent },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("[Variable: ContainerAppEnv]");
  });

  it("should return empty for non-container-app pipeline", () => {
    const pipelineContent = `
trigger:
  - main
steps:
  - task: DotNetCoreCLI@2
    inputs:
      command: build`;

    const results = detectContainerApps([
      { path: "azure-pipelines.yml", content: pipelineContent },
    ]);

    expect(results).toHaveLength(0);
  });

  it("should NOT false-positive on generic containerapp mentions", () => {
    const pipelineContent = `
trigger:
  - main
stages:
  - template: templates/deploy-containerapp.yml
    parameters:
      environment: prod`;

    const results = detectContainerApps([{ path: "infrastructure.yml", content: pipelineContent }]);

    expect(results).toHaveLength(0);
  });

  it("should detect via containerAppName config key", () => {
    const pipelineContent = `
steps:
  - task: AzureCLI@2
    inputs:
      inlineScript: |
        some script
  - task: AzureContainerApps@1
    inputs:
      containerAppName: my-api
      containerAppEnvironment: prod-env`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("prod-env");
  });

  it("should handle ${{ parameters.x }} environment references", () => {
    const pipelineContent = `
parameters:
  - name: containerAppEnvironment
    type: string
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppEnvironment: \${{ parameters.containerAppEnvironment }}
      containerAppName: my-app`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("[Parameter: parameters.containerAppEnvironment]");
  });

  it("should detect environment from merged template chain", () => {
    // infrastructure.yml passes the env value as a parameter
    const infrastructureYml = `
trigger:
  - main
stages:
  - template: templates/stage.yml
    parameters:
      containerAppEnvironment: my-prod-env`;

    // stage.yml passes through to deploy.yml
    const stageYml = `
parameters:
  - name: containerAppEnvironment
    type: string
jobs:
  - template: deploy.yml
    parameters:
      containerAppEnvironment: \${{ parameters.containerAppEnvironment }}`;

    // deploy.yml has the actual task with a param reference
    const deployYml = `
parameters:
  - name: containerAppEnvironment
    type: string
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppEnvironment: \${{ parameters.containerAppEnvironment }}
      containerAppName: my-app`;

    // Individual file detection: only deploy.yml triggers (has the task)
    // but environment is a parameter reference
    const individualResults = detectContainerApps([
      { path: "/pipelines/infrastructure.yml", content: infrastructureYml },
      { path: "/pipelines/templates/stage.yml", content: stageYml },
      { path: "/pipelines/templates/deploy.yml", content: deployYml },
    ]);

    // deploy.yml should be detected with a parameter reference
    const deployResult = individualResults.find(
      (r) => r.pipelineFile === "/pipelines/templates/deploy.yml"
    );
    expect(deployResult).toBeDefined();

    // Merged detection: combine all content — infrastructure.yml's concrete
    // "containerAppEnvironment: my-prod-env" is picked up first
    const mergedContent = [infrastructureYml, stageYml, deployYml].join("\n---\n");
    const mergedResults = detectContainerApps([
      { path: "/pipelines/infrastructure.yml", content: mergedContent },
    ]);

    expect(mergedResults).toHaveLength(1);
    expect(mergedResults[0].environment).toBe("my-prod-env");
  });

  it("should detect workload profile references", () => {
    const pipelineContent = `
steps:
  - script: |
      az containerapp update \\
        --name my-app \\
        --workload-profile-name Dedicated`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].hasWorkloadProfile).toBe(true);
  });

  it("should detect workload profile from a different file than the task", () => {
    // deploy.yml has the container app task but no workload mention
    const deployYml = `
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppName: my-app
      containerAppEnvironment: prod-env`;

    // stage.yml passes workloadProfileName as a parameter
    const stageYml = `
parameters:
  - name: workloadProfileName
    type: string
    default: Consumption
stages:
  - template: deploy.yml
    parameters:
      workloadProfileName: \${{ parameters.workloadProfileName }}`;

    const results = detectContainerApps([
      { path: "/pipelines/stage.yml", content: stageYml },
      { path: "/pipelines/deploy.yml", content: deployYml },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].hasWorkloadProfile).toBe(true);
  });
});

describe("extractTemplateReferences", () => {
  it("should extract template paths from stage templates", () => {
    const content = `
stages:
  - template: templates/deploy.yml
    parameters:
      environment: prod
  - template: templates/build.yml`;

    const refs = extractTemplateReferences(content);
    expect(refs).toEqual(["templates/deploy.yml", "templates/build.yml"]);
  });

  it("should extract template paths from job templates", () => {
    const content = `
jobs:
  - template: pipelines/jobs/deploy-container-app.yml
    parameters:
      appName: my-app`;

    const refs = extractTemplateReferences(content);
    expect(refs).toEqual(["pipelines/jobs/deploy-container-app.yml"]);
  });

  it("should extract template paths from step templates", () => {
    const content = `
steps:
  - template: steps/deploy.yml
  - script: echo done`;

    const refs = extractTemplateReferences(content);
    expect(refs).toEqual(["steps/deploy.yml"]);
  });

  it("should handle quoted template paths", () => {
    const content = `
  - template: 'templates/deploy.yml'
  - template: "templates/build.yml"`;

    const refs = extractTemplateReferences(content);
    expect(refs).toEqual(["templates/deploy.yml", "templates/build.yml"]);
  });

  it("should strip repository references (e.g. @self, @templates)", () => {
    const content = `
  - template: templates/deploy.yml@templates-repo`;

    const refs = extractTemplateReferences(content);
    expect(refs).toEqual(["templates/deploy.yml"]);
  });

  it("should deduplicate references", () => {
    const content = `
  - template: templates/deploy.yml
  - template: templates/deploy.yml`;

    const refs = extractTemplateReferences(content);
    expect(refs).toEqual(["templates/deploy.yml"]);
  });

  it("should return empty for no templates", () => {
    const content = `
steps:
  - script: echo hello`;

    const refs = extractTemplateReferences(content);
    expect(refs).toEqual([]);
  });
});

describe("resolveTemplatePath", () => {
  it("should resolve relative to pipeline directory", () => {
    expect(resolveTemplatePath("/pipelines/infrastructure.yml", "templates/deploy.yml")).toBe(
      "/pipelines/templates/deploy.yml"
    );
  });

  it("should resolve parent directory references", () => {
    expect(resolveTemplatePath("/pipelines/infrastructure.yml", "../templates/deploy.yml")).toBe(
      "/templates/deploy.yml"
    );
  });

  it("should handle absolute paths", () => {
    expect(resolveTemplatePath("/pipelines/infrastructure.yml", "/templates/deploy.yml")).toBe(
      "/templates/deploy.yml"
    );
  });

  it("should handle deeply nested templates", () => {
    expect(resolveTemplatePath("/pipelines/stages/deploy.yml", "../jobs/container-app.yml")).toBe(
      "/pipelines/jobs/container-app.yml"
    );
  });

  it("should handle current directory references", () => {
    expect(resolveTemplatePath("/pipelines/infrastructure.yml", "./deploy.yml")).toBe(
      "/pipelines/deploy.yml"
    );
  });
});

describe("detectContainerApps with template content", () => {
  it("should detect container app info from template files", () => {
    const infrastructureYml = `
trigger:
  - main
stages:
  - template: templates/deploy.yml
    parameters:
      environment: prod`;

    const deployYml = `
parameters:
  - name: environment
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppEnvironment: my-env-prod
      containerAppName: my-app
      imageToDeploy: myacr.azurecr.io/myapp:latest`;

    // Simulating the orchestrator having fetched both files
    const results = detectContainerApps([
      { path: "/pipelines/infrastructure.yml", content: infrastructureYml },
      { path: "/pipelines/templates/deploy.yml", content: deployYml },
    ]);

    // Only the template file has the actual container app task — infrastructure.yml
    // should NOT produce a result (no false positive from generic mentions)
    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("my-env-prod");
    expect(results[0].pipelineFile).toBe("/pipelines/templates/deploy.yml");
  });

  it("should find environment from merged chain when templates use parameters", () => {
    // Root passes concrete env value
    const root = `
stages:
  - template: deploy.yml
    parameters:
      containerAppEnvironment: production-env`;

    // Template uses parameter reference
    const deploy = `
parameters:
  - name: containerAppEnvironment
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppName: my-svc
      containerAppEnvironment: \${{ parameters.containerAppEnvironment }}`;

    // Merged content analysis
    const merged = root + "\n---\n" + deploy;
    const results = detectContainerApps([{ path: "pipeline.yml", content: merged }]);

    expect(results).toHaveLength(1);
    // The concrete parameter value "production-env" appears first
    expect(results[0].environment).toBe("production-env");
  });

  it("should detect container image from imageToDeploy", () => {
    const pipelineContent = `
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppEnvironment: my-env
      containerAppName: my-app
      imageToDeploy: myacr.azurecr.io/myapp:v1.0`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].containerImage).toBe("myacr.azurecr.io/myapp:v1.0");
  });

  it("should detect container image from --image CLI flag", () => {
    const pipelineContent = `
steps:
  - script: |
      az containerapp update \\
        --name my-app \\
        --image myacr.azurecr.io/myapp:latest`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].containerImage).toBe("myacr.azurecr.io/myapp:latest");
  });

  it("should detect environment from CONTAINER_APP_ENVIRONMENT variable", () => {
    const pipelineContent = `
variables:
  CONTAINER_APP_ENVIRONMENT: staging-env
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppName: my-app`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("staging-env");
  });

  it("should detect environment from --environment CLI flag", () => {
    const pipelineContent = `
steps:
  - script: |
      az containerapp create \\
        --name my-app \\
        --environment cli-env`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("cli-env");
  });

  it("should NOT false-positive on 'workload' without 'profile'", () => {
    const pipelineContent = `
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppEnvironment: my-env
      containerAppName: my-app
      # This is a heavy workload container`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].hasWorkloadProfile).toBe(false);
  });

  it("should detect az containerapp deploy command", () => {
    const pipelineContent = `
steps:
  - script: az containerapp deploy --name my-app --image myapp:latest
    displayName: Deploy`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
  });

  it("should detect az containerapp up command", () => {
    const pipelineContent = `
steps:
  - script: az containerapp up --name my-app --environment my-env
    displayName: Deploy`;

    const results = detectContainerApps([{ path: "deploy.yml", content: pipelineContent }]);

    expect(results).toHaveLength(1);
    expect(results[0].environment).toBe("my-env");
  });

  it("should propagate workload profiles across all results", () => {
    // deploy.yml has the task but no workload profile
    const deployYml = `
steps:
  - task: AzureContainerApps@1
    inputs:
      containerAppName: app-1
      containerAppEnvironment: env-1`;

    // config.yml mentions workload profiles
    const configYml = `
# Configuration for workload_profile setup
workloadProfileName: Dedicated-D4`;

    const results = detectContainerApps([
      { path: "deploy.yml", content: deployYml },
      { path: "config.yml", content: configYml },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].hasWorkloadProfile).toBe(true);
  });
});
