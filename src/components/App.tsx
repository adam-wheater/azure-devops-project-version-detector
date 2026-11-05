import * as React from "react";
import { BRAND, BrandGlyph } from "../brand";
import { ScanOrchestrator } from "../scanning/ScanOrchestrator";
import {
  ScanResult,
  ScanProgress,
  FrameworkLifecycle,
  LifecycleConfigDocument,
  DetectedProject,
} from "../models/types";
import {
  getProjectName,
  getProjectId,
  getGitClient,
  listRepositories,
} from "../services/RepoService";
import {
  loadConfig,
  mergeWithDefaults,
  entriesToLifecycleData,
} from "../services/LifecycleConfigService";
import {
  getDefaultLifecycleData,
  setActiveLifecycleData,
  hasStaleLifecycleData,
} from "../lifecycle/DotNetLifecycle";
import { loadCachedScanResult, saveScanResultToCache } from "../services/ScanCacheService";
import { SummaryCards } from "./SummaryCards";
import { VersionTable } from "./VersionTable";
import { FilterToolbar, FilterState } from "./FilterToolbar";
import { LifecycleTable } from "./LifecycleTable";
import { LifecycleConfig } from "./LifecycleConfig";
import { ExportButton } from "./ExportButton";
import {
  AppShell,
  Banner,
  Button,
  EmptyState,
  ErrorBoundary,
  IconRefresh,
  IconStop,
  Progress,
  Tabs,
} from "./ui";

// If the cached scan result is younger than this, skip the automatic
// background rescan on page load. Every user opening the extension used to
// trigger a full org-wide scan unconditionally, so several people opening
// the page around the same time competed for the same Azure DevOps API
// rate limit and made scans slow to fail for everyone. A manual "Re-scan"
// is always available for on-demand freshness.
const CACHE_FRESH_THRESHOLD_MS = 15 * 60 * 1000;

type TabId = "projects" | "lifecycle" | "config";

/** "Scan cancelled." is information, not a failure, so it is shown in a neutral banner. */
interface Notice {
  text: string;
  tone: "error" | "info";
}

function AppInner() {
  const [scanResult, setScanResult] = React.useState<ScanResult | null>(null);
  const [progress, setProgress] = React.useState<ScanProgress | null>(null);
  const [error, setError] = React.useState<Notice | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabId>("projects");
  const [filters, setFilters] = React.useState<FilterState>({
    search: "",
    status: null,
    flavor: null,
    projectType: null,
    functionAppModel: null,
    repoName: null,
    deploymentTarget: null,
  });
  const [configDoc, setConfigDoc] = React.useState<LifecycleConfigDocument | null>(null);
  const [configLoading, setConfigLoading] = React.useState(true);
  const [resolvedLifecycleData, setResolvedLifecycleData] = React.useState<
    FrameworkLifecycle[] | null
  >(null);
  const orchestratorRef = React.useRef(new ScanOrchestrator());
  const [cachedAt, setCachedAt] = React.useState<string | null>(null);
  const [isFromCache, setIsFromCache] = React.useState(false);
  const [showStaleWarning, setShowStaleWarning] = React.useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  // Cache and re-scans are namespaced by project id because Extension Data
  // Storage is org-wide, not per-project (see ScanCacheService).
  const projectIdRef = React.useRef<string>("");
  const skipInitialScanRef = React.useRef(false);
  // Most recent completed result (restored from cache or scanned live).
  // Passed to the orchestrator as the baseline for incremental scans: repos
  // whose default-branch head commit hasn't moved since this result are
  // reused instead of re-fetched, which is what makes re-scans fast.
  const baselineRef = React.useRef<ScanResult | null>(null);

  // Load lifecycle config and cached scan result on startup
  React.useEffect(() => {
    async function initConfig() {
      try {
        const doc = await loadConfig();
        setConfigDoc(doc);
        const defaults = getDefaultLifecycleData();
        const merged = mergeWithDefaults(defaults, doc);
        const lifecycleData = entriesToLifecycleData(merged);
        setActiveLifecycleData(lifecycleData);
        setResolvedLifecycleData(lifecycleData);

        // Check for stale lifecycle data
        if (hasStaleLifecycleData(defaults)) {
          setShowStaleWarning(true);
        }

        projectIdRef.current = await getProjectId();

        // Load cached scan result
        const cached = await loadCachedScanResult(projectIdRef.current);
        if (cached) {
          setScanResult(cached.scanResult);
          baselineRef.current = cached.scanResult;
          setCachedAt(cached.cachedAt);
          setIsFromCache(true);

          const ageMs = Date.now() - new Date(cached.cachedAt).getTime();
          if (ageMs >= 0 && ageMs < CACHE_FRESH_THRESHOLD_MS) {
            skipInitialScanRef.current = true;
          }
        }
      } catch {
        // Config loading failed, defaults will be used
      } finally {
        setConfigLoading(false);
      }
    }
    initConfig();
  }, []);

  const cancelScan = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const startScan = React.useCallback(
    async (fullRescan = false) => {
      // Cancel any in-progress scan
      cancelScan();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setScanning(true);
      setError(null);
      setIsFromCache(false);
      setProgress({ phase: "Initializing...", current: 0, total: 0 });

      try {
        const projectName = await getProjectName();
        if (controller.signal.aborted) return;

        const gitClient = await getGitClient();
        if (controller.signal.aborted) return;

        const repos = await listRepositories(projectName, controller.signal);
        if (controller.signal.aborted) return;

        if (repos.length === 0) {
          setError({ text: "No repositories found in this project.", tone: "error" });
          setScanning(false);
          return;
        }

        // Pass lifecycle data explicitly to the orchestrator so it does not
        // rely solely on the module-level singleton in DotNetLifecycle.ts.
        orchestratorRef.current = new ScanOrchestrator(resolvedLifecycleData);

        const result = await orchestratorRef.current.scan(
          gitClient,
          repos,
          (p) => setProgress(p),
          controller.signal,
          fullRescan ? null : baselineRef.current
        );

        if (controller.signal.aborted) return;

        setScanResult(result);
        baselineRef.current = result;
        setCachedAt(null);

        // Persist to cache
        saveScanResultToCache(result, projectIdRef.current).catch(() => {
          // Non-critical
        });
      } catch (err: any) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          setError({ text: "Scan cancelled.", tone: "info" });
        } else {
          setError({
            text: err?.message || "An unexpected error occurred during scanning.",
            tone: "error",
          });
        }
      } finally {
        setScanning(false);
        setProgress(null);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [resolvedLifecycleData, cancelScan]
  );

  // Start scan only after config has loaded. Skip the automatic scan once,
  // on first load, if a sufficiently fresh cached result was just restored.
  React.useEffect(() => {
    if (!configLoading) {
      if (skipInitialScanRef.current) {
        skipInitialScanRef.current = false;
        return;
      }
      startScan();
    }
  }, [startScan, configLoading]);

  // Stop any running scan when the hub unmounts, so it does not keep calling
  // the REST API (and setting state) for a page nobody is looking at.
  React.useEffect(() => cancelScan, [cancelScan]);

  const handleConfigSaved = React.useCallback(
    (entries: FrameworkLifecycle[], doc: LifecycleConfigDocument | null) => {
      setActiveLifecycleData(entries);
      setResolvedLifecycleData(entries);
      // The Configuration tab remounts from this document every time it is
      // opened. Without updating it, returning to the tab showed the values
      // from before the save, and saving again from there silently reverted
      // the earlier change for the whole organization.
      setConfigDoc(doc);
    },
    []
  );

  const filteredProjects = React.useMemo(() => {
    if (!scanResult) return [];
    return scanResult.projects.filter((p: DetectedProject) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchesPackage = p.keyNuGetPackages.some((pkg) => pkg.name.toLowerCase().includes(q));
        if (
          !p.repoName.toLowerCase().includes(q) &&
          !p.projectName.toLowerCase().includes(q) &&
          !p.targetFramework.toLowerCase().includes(q) &&
          !p.projectFile.toLowerCase().includes(q) &&
          !(p.deploymentTarget ?? "").toLowerCase().includes(q) &&
          !matchesPackage
        ) {
          return false;
        }
      }
      if (filters.status && p.lifecycleStatus !== filters.status) return false;
      if (filters.flavor && p.dotNetFlavor !== filters.flavor) return false;
      if (filters.projectType && p.projectType !== filters.projectType) return false;
      if (filters.functionAppModel && p.functionAppModel !== filters.functionAppModel) return false;
      if (filters.repoName && p.repoName !== filters.repoName) return false;
      if (filters.deploymentTarget && p.deploymentTarget !== filters.deploymentTarget) return false;
      return true;
    });
  }, [scanResult, filters]);

  const toggleStatusFilter = React.useCallback((status: FilterState["status"]) => {
    setActiveTab("projects");
    setFilters((prev) => ({
      ...prev,
      status: prev.status === status ? null : status,
    }));
  }, []);

  const tabs = [
    {
      id: "projects",
      label: "Projects",
      count: scanResult ? scanResult.projects.length : undefined,
    },
    { id: "lifecycle", label: ".NET Lifecycle Reference" },
    { id: "config", label: "Configuration" },
  ];

  const actions = (
    <>
      {scanResult && <ExportButton filteredProjects={filteredProjects} />}
      {scanning ? (
        <Button
          variant="danger"
          icon={<IconStop />}
          onClick={cancelScan}
          aria-label="Cancel ongoing scan"
        >
          Cancel
        </Button>
      ) : (
        <>
          {scanResult && (
            <Button
              onClick={() => startScan(true)}
              title="Re-scan every repository from scratch, ignoring the previous scan"
              aria-label="Full re-scan of all repositories, ignoring previous results"
            >
              Full re-scan
            </Button>
          )}
          <Button
            variant="primary"
            icon={<IconRefresh />}
            onClick={() => startScan()}
            title="Re-scan repositories; ones unchanged since the last scan are reused instantly"
            aria-label="Rescan all repositories"
          >
            Re-scan
          </Button>
        </>
      )}
    </>
  );

  return (
    <AppShell title={BRAND.name} subtitle={BRAND.tagline} mark={<BrandGlyph />} actions={actions}>
      {isFromCache && cachedAt && (
        <div className="ax-section">
          <Banner tone="info">
            Last scanned: {new Date(cachedAt).toLocaleString()}
            {scanning ? ". Refreshing..." : ". Click Re-scan for fresh results"}
          </Banner>
        </div>
      )}

      {showStaleWarning && (
        <div className="ax-section">
          <Banner tone="warn" onDismiss={() => setShowStaleWarning(false)}>
            Some built-in lifecycle data may be outdated. Visit the{" "}
            <button
              type="button"
              className="pvd-inline-link"
              onClick={() => setActiveTab("config")}
            >
              Configuration tab
            </button>{" "}
            to review or check the{" "}
            <a
              className="ax-link"
              href="https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core"
              target="_blank"
              rel="noopener noreferrer"
            >
              official Microsoft .NET lifecycle page
            </a>
            .
          </Banner>
        </div>
      )}

      {error && (
        <div className="ax-section">
          <Banner tone={error.tone}>{error.text}</Banner>
        </div>
      )}

      {scanning && progress && (
        <div className="ax-section" aria-label="Scan progress">
          <Progress
            label={`${progress.phase}${progress.repoName ? `: ${progress.repoName}` : ""}`}
            current={progress.current}
            total={progress.total}
            indeterminate={progress.total === 0}
          />
        </div>
      )}

      {/* Tab bar is always visible so config is accessible even without scan results */}
      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        aria-label="Main navigation tabs"
      />

      {scanResult && activeTab === "projects" && (
        <div role="tabpanel" aria-label="Projects">
          {!!scanResult.summary.unchangedRepos && (
            <p className="ax-muted ax-section" role="status">
              Incremental scan: {scanResult.summary.unchangedRepos} of{" "}
              {scanResult.summary.totalRepos} repositories were unchanged since the last scan and
              were reused. Use &quot;Full re-scan&quot; to scan everything from scratch.
            </p>
          )}
          <SummaryCards
            summary={scanResult.summary}
            duration={scanResult.duration}
            activeStatusFilter={filters.status}
            onStatusFilterClick={toggleStatusFilter}
          />
          <FilterToolbar
            filters={filters}
            onFilterChange={setFilters}
            projects={scanResult.projects}
            resultCount={filteredProjects.length}
            totalCount={scanResult.projects.length}
          />
          <VersionTable projects={filteredProjects} />
        </div>
      )}

      {activeTab === "lifecycle" && (
        <div role="tabpanel" aria-label=".NET Lifecycle Reference">
          <LifecycleTable resolvedLifecycleData={resolvedLifecycleData} />
        </div>
      )}

      {activeTab === "config" && (
        <div role="tabpanel" aria-label="Configuration">
          <LifecycleConfig configDocument={configDoc} onConfigSaved={handleConfigSaved} />
        </div>
      )}

      {!scanning && !scanResult && !error && activeTab === "projects" && (
        <EmptyState title="No scan results yet">
          Click &quot;Re-scan&quot; to analyze all repositories in this project.
        </EmptyState>
      )}
    </AppShell>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
