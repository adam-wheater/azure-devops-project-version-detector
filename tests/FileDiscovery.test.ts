import { discoverFiles } from "@/scanning/FileDiscovery";

describe("FileDiscovery", () => {
  it("should categorize project files", () => {
    const items = [
      { path: "/src/App/App.csproj", isFolder: false },
      { path: "/src/Lib/Lib.fsproj", isFolder: false },
      { path: "/src/VB/VB.vbproj", isFolder: false },
      { path: "/src", isFolder: true },
    ];

    const result = discoverFiles(items);
    expect(result.projectFiles).toHaveLength(3);
    expect(result.hasSignals).toBe(true);
  });

  it("should categorize config files", () => {
    const items = [
      { path: "/global.json", isFolder: false },
      { path: "/Directory.Build.props", isFolder: false },
      { path: "/src/packages.config", isFolder: false },
      { path: "/Directory.Packages.props", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.configFiles).toHaveLength(4);
  });

  it("should categorize function app files", () => {
    const items = [
      { path: "/host.json", isFolder: false },
      { path: "/local.settings.json", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.functionAppFiles).toHaveLength(2);
  });

  it("should categorize pipeline files", () => {
    const items = [
      { path: "/azure-pipelines.yml", isFolder: false },
      { path: "/.azure-pipelines/build.yml", isFolder: false },
      { path: "/pipelines/deploy.yaml", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.pipelineFiles).toHaveLength(3);
  });

  it("should skip folders", () => {
    const items = [
      { path: "/src", isFolder: true },
      { path: "/src/App", isFolder: true },
    ];

    const result = discoverFiles(items);
    expect(result.projectFiles).toHaveLength(0);
    expect(result.hasSignals).toBe(false);
  });

  it("should report no signals when no project files found", () => {
    const items = [
      { path: "/README.md", isFolder: false },
      { path: "/package.json", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.hasSignals).toBe(false);
  });

  it("should categorize Dockerfiles in any location and naming style", () => {
    const items = [
      { path: "/Dockerfile", isFolder: false },
      { path: "/src/Api/Dockerfile", isFolder: false },
      { path: "/docker/api.Dockerfile", isFolder: false },
      { path: "/Dockerfile.dev", isFolder: false },
      { path: "/src/NotADockerfileReadme.md", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.dockerfilePaths).toEqual([
      "/Dockerfile",
      "/src/Api/Dockerfile",
      "/docker/api.Dockerfile",
      "/Dockerfile.dev",
    ]);
  });

  it("should categorize compose files", () => {
    const items = [
      { path: "/docker-compose.yml", isFolder: false },
      { path: "/docker-compose.override.yaml", isFolder: false },
      { path: "/compose.yaml", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.composeFilePaths).toHaveLength(3);
  });

  it("should categorize kubernetes manifests separately from pipelines", () => {
    const items = [
      { path: "/k8s/deployment.yaml", isFolder: false },
      { path: "/charts/app/values.yaml", isFolder: false },
      { path: "/pipelines/deploy.yaml", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.kubernetesFilePaths).toEqual(["/k8s/deployment.yaml", "/charts/app/values.yaml"]);
    expect(result.pipelineFiles).toEqual(["/pipelines/deploy.yaml"]);
  });

  it("should categorize controller and razor files", () => {
    const items = [
      { path: "/src/Api/Controllers/UserController.cs", isFolder: false },
      { path: "/src/Api/Services/UserService.cs", isFolder: false },
      { path: "/src/Web/Pages/Index.razor", isFolder: false },
    ];

    const result = discoverFiles(items);
    expect(result.controllerFilePaths).toEqual(["/src/Api/Controllers/UserController.cs"]);
    expect(result.razorFilePaths).toEqual(["/src/Web/Pages/Index.razor"]);
  });
});
