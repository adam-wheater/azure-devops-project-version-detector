import { GitRestClient, GitRepository } from "azure-devops-extension-api/Git";
import {
  DetectedProject,
  ProjectType,
  ScanProgress,
  ScanResult,
  ScanSummary,
  LifecycleStatus,
  DotNetFlavor,
  FileContent,
  ContainerAppInfo,
  FrameworkLifecycle,
} from "../models/types";
import { ConcurrencyLimiter } from "../utils/ConcurrencyLimiter";
import { REPO_CONCURRENCY } from "./Constants";
import { discoverFiles, DiscoveredFiles } from "./FileDiscovery";
import { fetchFileContents } from "./FileContentFetcher";
import { detectProjects, parseGlobalJson, GlobalJsonInfo } from "./detectors/DotNetVersionDetector";
import { enrichProjectWithFunctionInfo } from "./detectors/FunctionAppDetector";
import {
  detectContainerApps,
  extractTemplateReferences,
  resolveTemplatePath,
} from "./detectors/ContainerAppDetector";
import { getKeyPackages } from "./detectors/NuGetPackageDetector";
import { isMauiProject, enrichMauiProject } from "./detectors/MauiDetector";
import { isXamarinProject, enrichXamarinProject } from "./detectors/XamarinDetector";
import {
  annotateProjectSignals,
  refineProjectType,
  resolveDeploymentTarget,
  extractPipelineDeploySignals,
  RepoDeploySignals,
} from "./detectors/DeploymentTargetDetector";
import { getRepoTree, getRepoHeadCommit, RepoItem } from "../services/RepoService";
import { getLifecycleForFramework } from "../lifecycle/DotNetLifecycle";

export type ProgressCallback = (progress: ScanProgress) => void;

/**
 * Bump this whenever a scan starts producing new/changed per-project fields.
 * Baselines stamped with a different version are ignored by incremental
 * scanning, forcing a full scan that populates the new fields.
 */
export const SCAN_SCHEMA_VERSION = 2;

export class ScanOrchestrator {
  private repoLimiter = new ConcurrencyLimiter(REPO_CONCURRENCY);
  private lifecycleData?: FrameworkLifecycle[] | null;

  constructor(lifecycleData?: FrameworkLifecycle[] | null) {
    this.lifecycleData = lifecycleData;
  }

  async scan(
    gitClient: GitRestClient,
    repos: GitRepository[],
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
    baseline?: ScanResult | null
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const allProjects: DetectedProject[] = [];
    let completed = 0;
    let unchangedRepos = 0;
    const repoCommits: Record<string, string> = {};

    // Previous scan's per-repo head commits and projects: repos whose head
    // hasn't moved are reused (with lifecycle fields recomputed for today's
    // date and config) instead of re-fetching their whole tree and files.
    // A baseline from a different scanner version is unusable — its projects
    // lack fields the current detectors produce.
    if (baseline && baseline.scanSchemaVersion !== SCAN_SCHEMA_VERSION) {
      baseline = null;
    }
    const baselineCommits = baseline?.repoCommits ?? {};
    const baselineProjects = new Map<string, DetectedProject[]>();
    if (baseline) {
      for (const p of baseline.projects) {
        const list = baselineProjects.get(p.repoId);
        if (list) {
          list.push(p);
        } else {
          baselineProjects.set(p.repoId, [p]);
        }
      }
    }

    onProgress?.({
      phase: "Scanning repositories",
      current: 0,
      total: repos.length,
    });

    await Promise.all(
      repos.map((repo) =>
        this.repoLimiter.run(async () => {
          if (signal?.aborted) return;
          try {
            const head = await getRepoHeadCommit(gitClient, repo, signal);
            if (signal?.aborted) return;

            if (head && baselineCommits[repo.id!] === head) {
              unchangedRepos++;
              repoCommits[repo.id!] = head;
              const cached = baselineProjects.get(repo.id!) ?? [];
              allProjects.push(...cached.map((p) => this.refreshLifecycle(p)));
              return;
            }

            const repoProjects = await this.scanRepo(gitClient, repo, signal);
            allProjects.push(...repoProjects.projects);
            // Record the head only after a successful scan. Recording it
            // before scanRepo would let a failed scan (zero projects) pass as
            // "unchanged" on the next incremental run, making the repo's
            // projects silently disappear until its next commit.
            if (head && !signal?.aborted) {
              repoCommits[repo.id!] = head;
            }
          } catch (err) {
            if (signal?.aborted) return;
            console.error(`Failed to scan repo ${repo.name}:`, err);
          } finally {
            completed++;
            onProgress?.({
              phase: "Scanning repositories",
              current: completed,
              total: repos.length,
              repoName: repo.name,
            });
          }
        })
      )
    );

    const duration = Date.now() - startTime;
    const summary = this.buildSummary(repos.length, allProjects);
    summary.unchangedRepos = unchangedRepos;

    return {
      projects: allProjects.sort((a, b) => {
        const statusOrder =
          this.statusSortOrder(a.lifecycleStatus) - this.statusSortOrder(b.lifecycleStatus);
        if (statusOrder !== 0) return statusOrder;
        return a.repoName.localeCompare(b.repoName);
      }),
      summary,
      scanDate: new Date().toISOString(),
      duration,
      repoCommits,
      scanSchemaVersion: SCAN_SCHEMA_VERSION,
    };
  }

  /**
   * Recompute the lifecycle fields of a project reused from a previous scan.
   * Statuses are date-dependent (a framework can pass its EOL date between
   * scans) and config-dependent (an admin may have edited lifecycle dates),
   * so a cached project's detection data can be reused but its lifecycle
   * verdict cannot.
   */
  private refreshLifecycle(project: DetectedProject): DetectedProject {
    // Xamarin projects carry a fixed EndOfLife verdict from the Xamarin
    // enricher that a TFM lookup can't reproduce (the TFM alone may read as
    // supported .NET Framework); their cached fields are constants, so keep
    // them as-is.
    if (project.dotNetFlavor === DotNetFlavor.Xamarin) {
      return project;
    }
    const lifecycle = getLifecycleForFramework(project.targetFramework, this.lifecycleData);
    return {
      ...project,
      lifecycleStatus: lifecycle.status,
      eolDate: lifecycle.eolDate,
      latestLts: lifecycle.latestLts,
    };
  }

  private async scanRepo(
    gitClient: GitRestClient,
    repo: GitRepository,
    signal?: AbortSignal
  ): Promise<{ projects: DetectedProject[]; containerApps: ContainerAppInfo[] }> {
    const repoId = repo.id!;
    const repoName = repo.name!;

    // Phase 1: Discover files
    const items: RepoItem[] = await getRepoTree(gitClient, repoId, signal);
    if (signal?.aborted || items.length === 0) {
      return { projects: [], containerApps: [] };
    }

    const discovered: DiscoveredFiles = discoverFiles(items);
    if (!discovered.hasSignals) {
      // Still check pipeline files for container apps even without .NET projects
      if (discovered.pipelineFiles.length > 0) {
        const pipelineContents = await fetchFileContents(
          gitClient,
          repoId,
          discovered.pipelineFiles,
          undefined,
          signal
        );

        // Resolve template references iteratively (up to 5 levels)
        const allPipelineContents = [...pipelineContents];
        const seen = new Set<string>(pipelineContents.map((p) => p.path));
        let frontier = [...pipelineContents];
        for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
          const refsToFetch: string[] = [];
          for (const pf of frontier) {
            for (const ref of extractTemplateReferences(pf.content)) {
              const resolved = resolveTemplatePath(pf.path, ref);
              if (!seen.has(resolved)) {
                seen.add(resolved);
                refsToFetch.push(resolved);
              }
            }
          }
          if (refsToFetch.length === 0) break;
          const fetched = await fetchFileContents(
            gitClient,
            repoId,
            refsToFetch,
            undefined,
            signal
          );
          allPipelineContents.push(...fetched);
          frontier = fetched;
        }

        const containerApps = detectContainerApps(allPipelineContents);

        // Also try merged-content detection
        if (allPipelineContents.length > 1) {
          const rootFile =
            discovered.pipelineFiles[0] || allPipelineContents[0]?.path || "pipeline";
          const merged = allPipelineContents.map((pf) => pf.content).join("\n---\n");
          const mergedResults = detectContainerApps([{ path: rootFile, content: merged }]);
          for (const mr of mergedResults) {
            if (
              mr.environment !== "Unknown" &&
              !containerApps.some((ca) => ca.environment === mr.environment)
            ) {
              containerApps.push(mr);
            }
          }
        }

        return {
          projects: [],
          containerApps: containerApps.map((ca) => ({ ...ca })),
        };
      }
      return { projects: [], containerApps: [] };
    }

    // Phase 2: Fetch file contents
    const allPaths = [
      ...discovered.projectFiles,
      ...discovered.configFiles,
      ...discovered.functionAppFiles,
      ...discovered.pipelineFiles,
    ];

    const allContents = await fetchFileContents(gitClient, repoId, allPaths, undefined, signal);
    if (signal?.aborted) {
      return { projects: [], containerApps: [] };
    }
    const contentMap = new Map<string, string>();
    for (const fc of allContents) {
      contentMap.set(fc.path, fc.content);
    }

    // Parse global.json if present
    const globalJsonFile = discovered.configFiles.find((p) =>
      p.toLowerCase().endsWith("global.json")
    );
    const globalJsonInfo: GlobalJsonInfo =
      globalJsonFile && contentMap.has(globalJsonFile)
        ? parseGlobalJson(contentMap.get(globalJsonFile)!)
        : {};

    // Phase 3: Detect .NET projects
    const projectFileContents: FileContent[] = discovered.projectFiles
      .filter((p) => contentMap.has(p))
      .map((p) => ({ path: p, content: contentMap.get(p)! }));

    const configFileContents: FileContent[] = discovered.configFiles
      .filter((p) => contentMap.has(p))
      .map((p) => ({ path: p, content: contentMap.get(p)! }));

    let projects = detectProjects(
      repoName,
      repoId,
      projectFileContents,
      configFileContents,
      globalJsonInfo,
      this.lifecycleData
    );

    // Phase 4: Enrich with Function App info
    const hostJsonFile = discovered.functionAppFiles.find((p) =>
      p.toLowerCase().endsWith("host.json")
    );
    const hostJsonContent = hostJsonFile ? contentMap.get(hostJsonFile) : undefined;

    projects = projects.map((project) => {
      const projContent = contentMap.get(project.projectFile);
      if (!projContent) return project;

      let enriched = enrichProjectWithFunctionInfo(project, projContent, hostJsonContent);

      // Enrich MAUI
      if (isMauiProject(projContent)) {
        enriched = enrichMauiProject(enriched);
      }

      // Enrich Xamarin
      if (isXamarinProject(projContent)) {
        enriched = enrichXamarinProject(enriched);
      }

      // Trim NuGet packages to key ones
      enriched = {
        ...enriched,
        keyNuGetPackages: getKeyPackages(enriched.keyNuGetPackages),
      };

      return enriched;
    });

    // Phase 5: Detect Container Apps from pipelines (including referenced templates)
    const pipelineFileContents: FileContent[] = discovered.pipelineFiles
      .filter((p) => contentMap.has(p))
      .map((p) => ({ path: p, content: contentMap.get(p)! }));

    // Resolve template references iteratively (up to 5 levels deep)
    let newlyFetched: FileContent[] = [...pipelineFileContents];
    for (let depth = 0; depth < 5 && newlyFetched.length > 0; depth++) {
      const refsToFetch: string[] = [];

      for (const pf of newlyFetched) {
        const refs = extractTemplateReferences(pf.content);
        for (const ref of refs) {
          const resolved = resolveTemplatePath(pf.path, ref);
          if (!contentMap.has(resolved)) {
            refsToFetch.push(resolved);
          }
        }
      }

      if (refsToFetch.length === 0) break;

      const uniqueRefs = [...new Set(refsToFetch)];
      const fetched = await fetchFileContents(gitClient, repoId, uniqueRefs, undefined, signal);
      newlyFetched = [];
      for (const fc of fetched) {
        contentMap.set(fc.path, fc.content);
        pipelineFileContents.push(fc);
        newlyFetched.push(fc);
      }
    }

    // Per-file detection
    const containerApps = detectContainerApps(pipelineFileContents);

    // Also try merged-content detection: combine all pipeline content so that
    // parameter values from calling templates and task definitions from
    // referenced templates are analysed together.
    if (pipelineFileContents.length > 1) {
      const rootFile = discovered.pipelineFiles[0] || pipelineFileContents[0]?.path || "pipeline";
      const mergedContent = pipelineFileContents.map((pf) => pf.content).join("\n---\n");
      const mergedResults = detectContainerApps([{ path: rootFile, content: mergedContent }]);
      for (const mr of mergedResults) {
        // Only add if it provides a better (non-Unknown) environment
        if (
          mr.environment !== "Unknown" &&
          !containerApps.some((ca) => ca.environment === mr.environment)
        ) {
          containerApps.push(mr);
        }
      }
    }

    // Enrich projects with container app info from pipelines within this repo.
    // We have access to both the pipeline YAML content and the projects, so we
    // can correlate by checking whether a project's name appears in the YAML.
    const allPipelineYaml = pipelineFileContents.map((pf) => pf.content).join("\n");
    this.enrichWithContainerApps(projects, containerApps, allPipelineYaml);

    // Phase 6: Infer deployment targets (App Service, Container Apps,
    // Functions, Static Web Apps, Kubernetes) from project shape, repo tree
    // (Dockerfiles, Controllers folders, k8s manifests), and pipeline tasks.
    const repoSignals: RepoDeploySignals = {
      dockerfilePaths: discovered.dockerfilePaths,
      composeFilePaths: discovered.composeFilePaths,
      kubernetesFilePaths: discovered.kubernetesFilePaths,
      controllerFilePaths: discovered.controllerFilePaths,
      razorFilePaths: discovered.razorFilePaths,
    };
    const pipelineSignals = extractPipelineDeploySignals(pipelineFileContents);
    const pipelineYamlLower = allPipelineYaml.toLowerCase();
    const isOnlyProjectInRepo = projects.length === 1;
    const deployableCount = projects.filter((p) => this.isDeployableType(p.projectType)).length;

    projects = projects.map((project) => {
      let annotated = annotateProjectSignals(project, repoSignals, isOnlyProjectInRepo);
      annotated = refineProjectType(annotated, repoSignals);

      const projContent = contentMap.get(annotated.projectFile) ?? "";
      const verdict = resolveDeploymentTarget(
        annotated,
        projContent,
        repoSignals,
        pipelineSignals,
        pipelineYamlLower,
        deployableCount === 1 && this.isDeployableType(annotated.projectType)
      );

      if (verdict) {
        annotated = {
          ...annotated,
          deploymentTarget: verdict.target,
          deploymentConfidence: verdict.confidence,
          deploymentEvidence: verdict.evidence,
        };
      }
      return annotated;
    });

    return { projects, containerApps };
  }

  /**
   * Enrich projects with container app deployment info from pipeline YAML.
   *
   * Heuristic (applied per-repo — this method is called within scanRepo):
   * 1. First, try to match by project name: if the project's name or path
   *    appears in the pipeline YAML content or container image reference,
   *    that is a strong signal the pipeline deploys that specific project.
   * 2. If no name-based match is found for a given container app, fall back
   *    to deployable project types only (web apps, APIs, workers, consoles,
   *    function apps — excluding test projects and class libraries).
   * This prevents blindly assigning container app info to every project.
   */
  private enrichWithContainerApps(
    projects: DetectedProject[],
    containerApps: ContainerAppInfo[],
    pipelineYaml: string = ""
  ): void {
    // Sort so entries with known environments come first
    const sorted = [...containerApps].sort((a, b) => {
      const aKnown = a.environment !== "Unknown" ? 0 : 1;
      const bKnown = b.environment !== "Unknown" ? 0 : 1;
      return aKnown - bKnown;
    });

    const pipelineYamlLower = pipelineYaml.toLowerCase();

    for (const ca of sorted) {
      const containerImage = (ca.containerImage ?? "").toLowerCase();

      // First pass: find projects whose name appears in the pipeline YAML
      // or container image (strong correlation by name).
      const nameMatchedProjects = projects.filter((p) => {
        if (
          p.projectType === ProjectType.TestProject ||
          p.projectType === ProjectType.ClassLibrary
        ) {
          return false;
        }
        const projNameLower = p.projectName.toLowerCase();
        if (projNameLower.length < 2) return false; // Avoid trivially short names
        const nameInYaml = pipelineYamlLower.includes(projNameLower);
        const nameInImage = containerImage.includes(projNameLower);
        return nameInYaml || nameInImage;
      });

      // Second pass: if no name-matched projects, fall back to deployable
      // project types (within the same repo, since this is called per-repo).
      const candidateProjects =
        nameMatchedProjects.length > 0
          ? nameMatchedProjects
          : projects.filter(
              (p) =>
                p.projectType !== ProjectType.TestProject &&
                p.projectType !== ProjectType.ClassLibrary &&
                this.isDeployableType(p.projectType)
            );

      for (const project of candidateProjects) {
        if (!project.containerAppEnvironment) {
          // First assignment
          project.containerAppEnvironment = ca.environment;
          project.hasWorkloadProfile = ca.hasWorkloadProfile;
          project.pipelineFile = ca.pipelineFile;
        } else if (project.containerAppEnvironment === "Unknown" && ca.environment !== "Unknown") {
          // Upgrade from Unknown to a known value
          project.containerAppEnvironment = ca.environment;
          project.pipelineFile = ca.pipelineFile;
        }

        // Merge workload profile info from any source
        if (ca.hasWorkloadProfile && !project.hasWorkloadProfile) {
          project.hasWorkloadProfile = true;
        }
      }
    }
  }

  /** Returns true for project types that are likely deployment targets. */
  private isDeployableType(projectType: ProjectType): boolean {
    return (
      projectType === ProjectType.WebApp ||
      projectType === ProjectType.WebApi ||
      projectType === ProjectType.Worker ||
      projectType === ProjectType.Console ||
      projectType === ProjectType.FunctionApp ||
      projectType === ProjectType.BlazorServer ||
      projectType === ProjectType.BlazorWasm ||
      projectType === ProjectType.ContainerApp
    );
  }

  private buildSummary(totalRepos: number, projects: DetectedProject[]): ScanSummary {
    const frameworkBreakdown: Record<string, number> = {};
    const projectTypeBreakdown: Record<string, number> = {};
    const flavorBreakdown: Record<string, number> = {};
    let outdatedCount = 0;
    let expiringSoonCount = 0;
    let supportedCount = 0;

    for (const p of projects) {
      // Framework breakdown by TFM
      frameworkBreakdown[p.targetFramework] = (frameworkBreakdown[p.targetFramework] || 0) + 1;

      // Project type breakdown
      projectTypeBreakdown[p.projectType] = (projectTypeBreakdown[p.projectType] || 0) + 1;

      // Flavor breakdown
      flavorBreakdown[p.dotNetFlavor] = (flavorBreakdown[p.dotNetFlavor] || 0) + 1;

      // Status counts
      switch (p.lifecycleStatus) {
        case LifecycleStatus.EndOfLife:
          outdatedCount++;
          break;
        case LifecycleStatus.ExpiringSoon:
          expiringSoonCount++;
          break;
        case LifecycleStatus.Supported:
        case LifecycleStatus.Current:
          supportedCount++;
          break;
      }
    }

    return {
      totalRepos,
      totalProjects: projects.length,
      outdatedCount,
      expiringSoonCount,
      supportedCount,
      frameworkBreakdown,
      projectTypeBreakdown,
      flavorBreakdown,
    };
  }

  private statusSortOrder(status: LifecycleStatus): number {
    switch (status) {
      case LifecycleStatus.EndOfLife:
        return 0;
      case LifecycleStatus.ExpiringSoon:
        return 1;
      case LifecycleStatus.Supported:
        return 2;
      case LifecycleStatus.Current:
        return 3;
      case LifecycleStatus.Preview:
        return 4;
      default:
        return 5;
    }
  }
}
