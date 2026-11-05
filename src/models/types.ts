export enum ProjectType {
  ClassLibrary = "Class Library",
  WebApp = "Web App",
  WebApi = "Web API",
  Console = "Console",
  FunctionApp = "Function App",
  ContainerApp = "Container App",
  Maui = "MAUI",
  Xamarin = "Xamarin",
  XamarinForms = "Xamarin.Forms",
  WPF = "WPF",
  WinForms = "WinForms",
  BlazorServer = "Blazor Server",
  BlazorWasm = "Blazor WebAssembly",
  Worker = "Worker Service",
  TestProject = "Test Project",
  Unknown = "Unknown",
}

export enum DotNetFlavor {
  DotNet = ".NET",
  DotNetCore = ".NET Core",
  DotNetFramework = ".NET Framework",
  DotNetStandard = ".NET Standard",
  Xamarin = "Xamarin",
  Maui = "MAUI",
  Unknown = "Unknown",
}

export enum LifecycleStatus {
  Current = "Current",
  Supported = "Supported",
  ExpiringSoon = "Expiring Soon",
  EndOfLife = "End of Life",
  Preview = "Preview",
}

export enum FunctionAppModel {
  InProcess = "In-Process",
  Isolated = "Isolated Worker",
}

export enum DeploymentTarget {
  AppService = "Azure App Service",
  ContainerApp = "Azure Container App",
  FunctionApp = "Azure Function App",
  StaticWebApp = "Azure Static Web Apps",
  Kubernetes = "Kubernetes",
}

/**
 * How sure the scanner is about a project's deployment target.
 * "confirmed" — an explicit deployment signal exists (a pipeline deploy task
 * for this target, or a Functions worker package in the project).
 * "likely" — inferred from project shape (Dockerfile, controllers, Blazor)
 * without a pipeline that proves where it actually ships.
 */
export type DeploymentConfidence = "confirmed" | "likely";

export interface DetectedProject {
  repoName: string;
  repoId: string;
  projectFile: string;
  projectName: string;
  projectType: ProjectType;
  dotNetFlavor: DotNetFlavor;
  targetFramework: string;
  targetFrameworks: string[];
  sdkVersion?: string;
  lifecycleStatus: LifecycleStatus;
  eolDate?: string;
  latestLts: string;
  functionAppModel?: FunctionAppModel;
  functionRuntimeVersion?: string;
  containerAppEnvironment?: string;
  hasWorkloadProfile?: boolean;
  pipelineFile?: string;
  keyNuGetPackages: NuGetPackageInfo[];
  deploymentTarget?: DeploymentTarget;
  deploymentConfidence?: DeploymentConfidence;
  /** Human-readable reasons behind the deployment target verdict. */
  deploymentEvidence?: string[];
  /** Path of the Dockerfile associated with this project, if one was found. */
  dockerfilePath?: string;
  /** True when the project has a Controllers folder with .cs files. */
  hasControllers?: boolean;
}

export interface NuGetPackageInfo {
  name: string;
  version: string;
  targetFramework?: string;
}

export interface FrameworkLifecycle {
  framework: string;
  version: string;
  displayName: string;
  releaseDate: string;
  endOfLifeDate: string;
  isLts: boolean;
  status: LifecycleStatus;
}

export interface ScanProgress {
  phase: string;
  current: number;
  total: number;
  repoName?: string;
}

export interface ScanResult {
  projects: DetectedProject[];
  summary: ScanSummary;
  scanDate: string;
  duration: number;
  /**
   * Head commit of each repo's default branch at scan time, keyed by repo id.
   * A later scan compares against these to skip repos that haven't changed.
   */
  repoCommits?: Record<string, string>;
  /**
   * Version of the scanner that produced this result. Incremental scans only
   * reuse a baseline produced by the same version — otherwise projects from
   * unchanged repos would forever miss fields added by newer detectors.
   */
  scanSchemaVersion?: number;
}

export interface ScanSummary {
  totalRepos: number;
  totalProjects: number;
  outdatedCount: number;
  expiringSoonCount: number;
  supportedCount: number;
  /** Repos skipped this scan because their head commit matched the previous scan. */
  unchangedRepos?: number;
  frameworkBreakdown: Record<string, number>;
  projectTypeBreakdown: Record<string, number>;
  flavorBreakdown: Record<string, number>;
}

export interface ContainerAppInfo {
  environment: string;
  hasWorkloadProfile: boolean;
  containerImage?: string;
  pipelineFile: string;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface LifecycleConfigEntry extends FrameworkLifecycle {
  key: string;
  isCustom: boolean;
  isModified: boolean;
}

export interface LifecycleConfigDocument {
  id: string;
  lastUpdated: string;
  overrides: Record<string, LifecycleConfigOverride>;
  deletedDefaults: string[];
}

export interface LifecycleConfigOverride {
  framework: string;
  version: string;
  displayName: string;
  releaseDate: string;
  endOfLifeDate: string;
  isLts: boolean;
  isCustom: boolean;
}
