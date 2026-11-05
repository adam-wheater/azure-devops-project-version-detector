// Sample data for the demo build: a fictional "Contoso" project with eight .NET
// repositories. The hub scans them with its real detectors, so each repo here is a
// file tree with realistic project files, pipelines and a global.json; nothing
// below is a pre-computed result. See demo/kit.ts for the helpers.
import { CommonServiceIds, clientFactory, delay, extensionDataService, projectPageService } from "./kit";

export { CommonServiceIds };

/** Path to file content. Files the scanner only lists (Dockerfiles, controllers) are "". */
type Files = Record<string, string>;

const ref = (name: string, version: string) =>
  `    <PackageReference Include="${name}" Version="${version}" />`;
const refs = (...pkgs: [string, string][]) =>
  `  <ItemGroup>\n${pkgs.map(([name, version]) => ref(name, version)).join("\n")}\n  </ItemGroup>`;

/** Stable 40-character commit id per repo, so the head commit never changes between runs. */
const commitOf = (name: string) => {
  let hash = 5381;
  let out = "";
  for (let i = 0; out.length < 40; i++) {
    hash = (hash * 33 + name.charCodeAt(i % name.length) + i) % 4294967296;
    out += hash.toString(16).padStart(8, "0");
  }
  return out.slice(0, 40);
};

const repos: { name: string; files: Files }[] = [
  {
    name: "billing-api",
    files: {
      "/global.json": `{\n  "sdk": {\n    "version": "10.0.100",\n    "rollForward": "latestFeature"\n  }\n}\n`,
      "/Directory.Build.props": `<Project>
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
  </PropertyGroup>
</Project>
`,
      "/azure-pipelines.yml": `trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

variables:
  imageRepository: billing-api
  containerRegistry: contoso.azurecr.io

stages:
  - stage: Build
    jobs:
      - job: BuildAndTest
        steps:
          - task: UseDotNet@2
            inputs:
              useGlobalJson: true
          - task: DotNetCoreCLI@2
            displayName: Run tests
            inputs:
              command: test
              projects: "**/*.Tests.csproj"
          - task: Docker@2
            displayName: Build and push image
            inputs:
              containerRegistry: contoso-acr
              repository: $(imageRepository)
              command: buildAndPush
              Dockerfile: src/Billing.Api/Dockerfile
              tags: $(Build.BuildId)

  - stage: Deploy
    dependsOn: Build
    jobs:
      - deployment: DeployProd
        environment: billing-prod
        strategy:
          runOnce:
            deploy:
              steps:
                - task: AzureContainerApps@1
                  inputs:
                    azureSubscription: contoso-prod
                    containerAppName: billing-api
                    resourceGroup: rg-billing-prod
                    containerAppEnvironment: contoso-prod-env
                    imageToDeploy: $(containerRegistry)/$(imageRepository):$(Build.BuildId)
                - script: az containerapp update --name billing-api --resource-group rg-billing-prod --workload-profile-name Dedicated-D4
                  displayName: Pin workload profile
`,
      "/src/Billing.Api/Billing.Api.csproj": `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <UserSecretsId>contoso-billing-api</UserSecretsId>
    <DockerDefaultTargetOS>Linux</DockerDefaultTargetOS>
  </PropertyGroup>
${refs(
  ["Azure.Identity", "1.13.2"],
  ["FluentValidation", "11.11.0"],
  ["Microsoft.AspNetCore.OpenApi", "10.0.0"],
  ["Microsoft.EntityFrameworkCore.SqlServer", "10.0.0"],
  ["Microsoft.VisualStudio.Azure.Containers.Tools.Targets", "1.21.0"],
  ["Serilog.AspNetCore", "9.0.0"]
)}
  <ItemGroup>
    <ProjectReference Include="..\\Billing.Core\\Billing.Core.csproj" />
  </ItemGroup>
</Project>
`,
      "/src/Billing.Api/Dockerfile": "",
      "/src/Billing.Api/Program.cs": "",
      "/src/Billing.Api/Controllers/InvoicesController.cs": "",
      "/src/Billing.Api/Controllers/PaymentsController.cs": "",
      "/src/Billing.Core/Billing.Core.csproj": `<Project Sdk="Microsoft.NET.Sdk">
${refs(
  ["Microsoft.EntityFrameworkCore", "10.0.0"],
  ["Microsoft.Extensions.Logging.Abstractions", "10.0.0"]
)}
</Project>
`,
      "/src/Billing.Core/Invoice.cs": "",
      "/tests/Billing.Api.Tests/Billing.Api.Tests.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
${refs(
  ["Microsoft.AspNetCore.Mvc.Testing", "10.0.0"],
  ["Microsoft.NET.Test.Sdk", "17.12.0"],
  ["xunit", "2.9.2"],
  ["xunit.runner.visualstudio", "2.8.2"]
)}
  <ItemGroup>
    <ProjectReference Include="..\\..\\src\\Billing.Api\\Billing.Api.csproj" />
  </ItemGroup>
</Project>
`,
    },
  },
  {
    name: "web-portal",
    files: {
      "/global.json": `{\n  "sdk": {\n    "version": "8.0.404",\n    "rollForward": "latestPatch"\n  }\n}\n`,
      "/azure-pipelines.yml": `trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: UseDotNet@2
    inputs:
      useGlobalJson: true
  - task: DotNetCoreCLI@2
    displayName: Publish
    inputs:
      command: publish
      projects: src/Portal.Web/Portal.Web.csproj
      arguments: --configuration Release --output $(Build.ArtifactStagingDirectory)
      zipAfterPublish: true
  - task: AzureWebApp@1
    displayName: Deploy to App Service
    inputs:
      azureSubscription: contoso-prod
      appType: webAppLinux
      appName: contoso-portal-prod
      package: $(Build.ArtifactStagingDirectory)/**/Portal.Web.zip
`,
      "/src/Portal.Web/Portal.Web.csproj": `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>
${refs(
  ["Microsoft.AspNetCore.Authentication.OpenIdConnect", "8.0.11"],
  ["Microsoft.Extensions.Http.Resilience", "8.10.0"],
  ["Microsoft.Identity.Web", "3.5.0"],
  ["Serilog.AspNetCore", "8.0.3"]
)}
  <ItemGroup>
    <ProjectReference Include="..\\Portal.Shared\\Portal.Shared.csproj" />
  </ItemGroup>
</Project>
`,
      "/src/Portal.Web/Program.cs": "",
      "/src/Portal.Web/Components/App.razor": "",
      "/src/Portal.Web/Components/Routes.razor": "",
      "/src/Portal.Web/Components/Layout/MainLayout.razor": "",
      "/src/Portal.Web/Components/Pages/Home.razor": "",
      "/src/Portal.Web/Components/Pages/Account.razor": "",
      "/src/Portal.Shared/Portal.Shared.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.1</TargetFramework>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
${refs(["System.Text.Json", "8.0.5"])}
</Project>
`,
      "/src/Portal.Shared/PortalSettings.cs": "",
    },
  },
  {
    name: "payments-worker",
    files: {
      "/global.json": `{\n  "sdk": {\n    "version": "9.0.203",\n    "rollForward": "latestFeature"\n  }\n}\n`,
      "/azure-pipelines.yml": `trigger:
  - main

pool:
  vmImage: ubuntu-latest

variables:
  imageRepository: payments-worker

steps:
  - task: Docker@2
    displayName: Build and push image
    inputs:
      containerRegistry: contoso-acr
      repository: $(imageRepository)
      command: buildAndPush
      Dockerfile: src/Payments.Worker/Dockerfile
      tags: $(Build.BuildId)
  - task: KubernetesManifest@1
    displayName: Deploy to AKS
    inputs:
      action: deploy
      connectionType: azureResourceManager
      azureSubscriptionConnection: contoso-prod
      azureResourceGroup: rg-payments-prod
      kubernetesCluster: aks-contoso-prod
      namespace: payments
      manifests: deploy/k8s/*.yaml
`,
      "/src/Payments.Worker/Payments.Worker.csproj": `<Project Sdk="Microsoft.NET.Sdk.Worker">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <UserSecretsId>contoso-payments-worker</UserSecretsId>
    <DockerDefaultTargetOS>Linux</DockerDefaultTargetOS>
  </PropertyGroup>
${refs(
  ["Azure.Messaging.ServiceBus", "7.18.2"],
  ["Microsoft.Extensions.Hosting", "9.0.0"],
  ["Microsoft.VisualStudio.Azure.Containers.Tools.Targets", "1.21.0"],
  ["Polly", "8.5.0"],
  ["Serilog.Extensions.Hosting", "9.0.0"]
)}
  <ItemGroup>
    <ProjectReference Include="..\\Payments.Contracts\\Payments.Contracts.csproj" />
  </ItemGroup>
</Project>
`,
      "/src/Payments.Worker/Dockerfile": "",
      "/src/Payments.Worker/Program.cs": "",
      "/src/Payments.Worker/SettlementWorker.cs": "",
      "/src/Payments.Contracts/Payments.Contracts.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
${refs(["System.Text.Json", "8.0.5"])}
</Project>
`,
      "/src/Payments.Contracts/PaymentMessage.cs": "",
      "/deploy/k8s/deployment.yaml": "",
      "/deploy/k8s/configmap.yaml": "",
    },
  },
  {
    name: "notifications-func",
    files: {
      "/azure-pipelines.yml": `trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: DotNetCoreCLI@2
    displayName: Publish
    inputs:
      command: publish
      publishWebProjects: false
      projects: src/Notifications.Functions/Notifications.Functions.csproj
      arguments: --configuration Release --output $(Build.ArtifactStagingDirectory)
  - task: AzureFunctionApp@2
    displayName: Deploy function app
    inputs:
      azureSubscription: contoso-prod
      appType: functionApp
      appName: contoso-notifications-prod
      package: $(Build.ArtifactStagingDirectory)/**/*.zip
`,
      "/src/Notifications.Functions/Notifications.Functions.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
    <OutputType>Exe</OutputType>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <FrameworkReference Include="Microsoft.AspNetCore.App" />
  </ItemGroup>
${refs(
  ["Microsoft.Azure.Functions.Worker", "2.0.0"],
  ["Microsoft.Azure.Functions.Worker.Extensions.Http.AspNetCore", "2.0.0"],
  ["Microsoft.Azure.Functions.Worker.Extensions.ServiceBus", "5.22.0"],
  ["Microsoft.Azure.Functions.Worker.Sdk", "2.0.0"]
)}
</Project>
`,
      "/src/Notifications.Functions/host.json": `{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true, "excludedTypes": "Request" }
    }
  }
}
`,
      "/src/Notifications.Functions/Program.cs": "",
      "/src/Notifications.Functions/SendEmailFunction.cs": "",
      "/src/Notifications.Functions/SendSmsFunction.cs": "",
    },
  },
  {
    name: "ordering-service",
    files: {
      // Build only: the release is a classic release pipeline, so there is no deploy task to find.
      "/azure-pipelines.yml": `trigger:
  - main

pool:
  vmImage: windows-latest

steps:
  - task: DotNetCoreCLI@2
    displayName: Build
    inputs:
      command: build
      arguments: --configuration Release
  - task: DotNetCoreCLI@2
    displayName: Publish
    inputs:
      command: publish
      publishWebProjects: true
      arguments: --configuration Release --output $(Build.ArtifactStagingDirectory)
  - task: PublishBuildArtifacts@1
    inputs:
      pathToPublish: $(Build.ArtifactStagingDirectory)
      artifactName: ordering-api
`,
      "/src/Ordering.Api/Ordering.Api.csproj": `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>netcoreapp3.1</TargetFramework>
  </PropertyGroup>
${refs(
  ["Microsoft.AspNetCore.Mvc.NewtonsoftJson", "3.1.32"],
  ["Microsoft.EntityFrameworkCore.SqlServer", "3.1.32"],
  ["Serilog.AspNetCore", "3.4.0"],
  ["Swashbuckle.AspNetCore", "5.6.3"]
)}
  <ItemGroup>
    <ProjectReference Include="..\\Ordering.Data\\Ordering.Data.csproj" />
  </ItemGroup>
</Project>
`,
      "/src/Ordering.Api/Startup.cs": "",
      "/src/Ordering.Api/Controllers/OrdersController.cs": "",
      "/src/Ordering.Api/Controllers/HealthController.cs": "",
      "/src/Ordering.Data/Ordering.Data.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netcoreapp3.1</TargetFramework>
  </PropertyGroup>
${refs(["Dapper", "2.0.123"], ["Microsoft.EntityFrameworkCore", "3.1.32"])}
</Project>
`,
      "/src/Ordering.Data/OrderRepository.cs": "",
    },
  },
  {
    name: "inventory-sync",
    files: {
      "/azure-pipelines.yml": `trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
  - task: DotNetCoreCLI@2
    displayName: Publish
    inputs:
      command: publish
      publishWebProjects: false
      projects: src/Inventory.Sync/Inventory.Sync.csproj
      arguments: --configuration Release --output $(Build.ArtifactStagingDirectory)
  - task: AzureFunctionApp@1
    displayName: Deploy function app
    inputs:
      azureSubscription: contoso-prod
      appType: functionApp
      appName: contoso-inventory-sync
      package: $(Build.ArtifactStagingDirectory)/**/*.zip
`,
      "/src/Inventory.Sync/Inventory.Sync.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <AzureFunctionsVersion>v4</AzureFunctionsVersion>
  </PropertyGroup>
${refs(
  ["Azure.Storage.Blobs", "12.19.1"],
  ["Microsoft.Azure.Functions.Extensions", "1.1.0"],
  ["Microsoft.NET.Sdk.Functions", "4.2.0"],
  ["Newtonsoft.Json", "13.0.3"]
)}
</Project>
`,
      "/src/Inventory.Sync/host.json": `{\n  "version": "2.0",\n  "extensionBundle": {\n    "id": "Microsoft.Azure.Functions.ExtensionBundle",\n    "version": "[4.*, 5.0.0)"\n  }\n}\n`,
      "/src/Inventory.Sync/Startup.cs": "",
      "/src/Inventory.Sync/SyncStockLevels.cs": "",
    },
  },
  {
    name: "field-service-desktop",
    files: {
      "/azure-pipelines.yml": `trigger:
  - main

pool:
  vmImage: windows-latest

steps:
  - task: NuGetCommand@2
    inputs:
      restoreSolution: FieldService.sln
  - task: VSBuild@1
    inputs:
      solution: FieldService.sln
      configuration: Release
`,
      "/src/FieldService.Desktop/FieldService.Desktop.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net48</TargetFramework>
    <UseWPF>true</UseWPF>
    <LangVersion>10.0</LangVersion>
  </PropertyGroup>
${refs(
  ["Microsoft.Extensions.DependencyInjection", "6.0.1"],
  ["Newtonsoft.Json", "13.0.3"],
  ["Serilog", "2.12.0"]
)}
  <ItemGroup>
    <ProjectReference Include="..\\FieldService.Reports\\FieldService.Reports.csproj" />
  </ItemGroup>
</Project>
`,
      "/src/FieldService.Desktop/App.xaml": "",
      "/src/FieldService.Desktop/MainWindow.xaml": "",
      "/src/FieldService.Reports/FieldService.Reports.csproj": `<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props" Condition="Exists('$(MSBuildExtensionsPath)\\$(MSBuildToolsVersion)\\Microsoft.Common.props')" />
  <PropertyGroup>
    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>
    <Platform Condition=" '$(Platform)' == '' ">AnyCPU</Platform>
    <ProjectGuid>{5C0F4B8E-3D2A-4E71-9A64-1B7D8E2F6A30}</ProjectGuid>
    <OutputType>Library</OutputType>
    <RootNamespace>FieldService.Reports</RootNamespace>
    <AssemblyName>FieldService.Reports</AssemblyName>
    <TargetFrameworkVersion>v4.6.2</TargetFrameworkVersion>
    <FileAlignment>512</FileAlignment>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System" />
    <Reference Include="System.Core" />
    <Reference Include="System.Data" />
  </ItemGroup>
${refs(["Dapper", "2.0.123"], ["Newtonsoft.Json", "12.0.3"])}
  <ItemGroup>
    <Compile Include="ReportBuilder.cs" />
    <Compile Include="Properties\\AssemblyInfo.cs" />
  </ItemGroup>
  <Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" />
</Project>
`,
      "/src/FieldService.Reports/ReportBuilder.cs": "",
    },
  },
  {
    name: "mobile-app",
    files: {
      "/src/Mobile.App/Mobile.App.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>net9.0-android;net9.0-ios;net9.0-maccatalyst</TargetFrameworks>
    <OutputType>Exe</OutputType>
    <RootNamespace>Mobile.App</RootNamespace>
    <UseMaui>true</UseMaui>
    <SingleProject>true</SingleProject>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <ApplicationTitle>Field Service</ApplicationTitle>
    <ApplicationId>com.contoso.fieldservice</ApplicationId>
  </PropertyGroup>
${refs(
  ["CommunityToolkit.Maui", "9.1.1"],
  ["Microsoft.Extensions.Logging.Debug", "9.0.0"],
  ["Microsoft.Maui.Controls", "$(MauiVersion)"]
)}
</Project>
`,
      "/src/Mobile.App/MauiProgram.cs": "",
      "/src/Mobile.App/MainPage.xaml": "",
      "/src/Mobile.Forms/Mobile.Forms.csproj": `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
${refs(["Xamarin.Essentials", "1.8.1"], ["Xamarin.Forms", "5.0.0.2622"])}
</Project>
`,
      "/src/Mobile.Forms/App.xaml": "",
      "/src/Mobile.Forms/JobListPage.xaml": "",
    },
  },
];

const gitRepositories = repos.map((repo) => ({
  id: `repo-${repo.name}`,
  name: repo.name,
  defaultBranch: "refs/heads/main",
  project: { id: "6ce954b1-ce1f-45d1-b94d-e6bf2464ba2c", name: "Contoso" },
}));
const byId = new Map(gitRepositories.map((r, i) => [r.id, repos[i]]));

/** The tree Azure DevOps returns for a recursive listing: the root, every folder, every file. */
const treeOf = (files: Files) => {
  const folders = new Set<string>(["/"]);
  for (const path of Object.keys(files)) {
    const parts = path.split("/").slice(1, -1);
    parts.forEach((_, i) => folders.add("/" + parts.slice(0, i + 1).join("/")));
  }
  return [
    ...[...folders].sort().map((path) => ({ path, isFolder: true })),
    ...Object.keys(files).map((path) => ({ path, isFolder: false })),
  ];
};

// Lifecycle settings an admin saved earlier: the org's own label for .NET 8, and
// .NET 11, which Contoso is already planning for.
const settings = extensionDataService({
  LifecycleSettings: {
    "lifecycle-config": {
      lastUpdated: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      deletedDefaults: [],
      overrides: {
        ".NET|8.0": {
          framework: ".NET",
          version: "8.0",
          displayName: ".NET 8 (LTS)",
          releaseDate: "2023-11-14",
          endOfLifeDate: "2026-11-10",
          isLts: true,
          isCustom: false,
        },
        ".NET|11.0": {
          framework: ".NET",
          version: "11.0",
          displayName: ".NET 11",
          releaseDate: "2026-11-10",
          endOfLifeDate: "2028-11-14",
          isLts: false,
          isCustom: true,
        },
      },
    },
  },
});

export const services: Record<string, unknown> = {
  [CommonServiceIds.ProjectPageService]: projectPageService("Contoso"),
  [CommonServiceIds.ExtensionDataService]: settings,
};

export const getClient = clientFactory({
  GitRestClient: {
    getRepositories: () => delay(gitRepositories, 250),
    getBranch: (repoId: string) =>
      delay({ commit: { commitId: commitOf(byId.get(repoId)!.name) } }, 120),
    getItems: (repoId: string) => delay(treeOf(byId.get(repoId)!.files), 400),
    // Real clients hand back the file as bytes; the hub decodes them as UTF-8.
    getItemContent: (repoId: string, path: string) => {
      const content = byId.get(repoId)?.files[path];
      return content === undefined
        ? Promise.reject({ status: 404, message: `${path} not found` })
        : delay(new TextEncoder().encode(content).buffer, 300);
    },
  },
});
