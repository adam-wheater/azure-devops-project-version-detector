import * as React from "react";
import {
  DetectedProject,
  LifecycleStatus,
  DotNetFlavor,
  ProjectType,
  FunctionAppModel,
  DeploymentTarget,
} from "../models/types";
import { Button, IconSearch } from "./ui";

export interface FilterState {
  search: string;
  status: LifecycleStatus | null;
  flavor: DotNetFlavor | null;
  projectType: ProjectType | null;
  functionAppModel: FunctionAppModel | null;
  repoName: string | null;
  deploymentTarget: DeploymentTarget | null;
}

interface FilterToolbarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  projects: DetectedProject[];
  resultCount?: number;
  totalCount?: number;
}

const SEARCH_DEBOUNCE_MS = 250;

export function FilterToolbar({
  filters,
  onFilterChange,
  projects,
  resultCount,
  totalCount,
}: FilterToolbarProps) {
  // The search box keeps a local draft and only pushes it into the filter
  // state after a short pause in typing, so each keystroke doesn't re-filter
  // and re-render a potentially large project table.
  const [searchDraft, setSearchDraft] = React.useState(filters.search);
  // The last search value this component pushed via onFilterChange. Lets us
  // tell an external change (e.g. "Clear filters") apart from the echo of our
  // own debounced update — syncing on the echo would clobber characters the
  // user typed while the update was in flight.
  const lastAppliedSearch = React.useRef(filters.search);

  React.useEffect(() => {
    if (filters.search !== lastAppliedSearch.current) {
      lastAppliedSearch.current = filters.search;
      setSearchDraft(filters.search);
    }
  }, [filters.search]);

  React.useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => {
      lastAppliedSearch.current = searchDraft;
      onFilterChange({ ...filters, search: searchDraft });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft, filters, onFilterChange]);

  const uniqueStatuses = [...new Set(projects.map((p) => p.lifecycleStatus))].sort();
  const uniqueFlavors = [...new Set(projects.map((p) => p.dotNetFlavor))].sort();
  const uniqueTypes = [...new Set(projects.map((p) => p.projectType))].sort();
  const uniqueFunctionModels = [
    ...new Set(projects.map((p) => p.functionAppModel).filter(Boolean)),
  ] as FunctionAppModel[];
  const uniqueRepoNames = [...new Set(projects.map((p) => p.repoName))].sort();
  const uniqueDeploymentTargets = [
    ...new Set(projects.map((p) => p.deploymentTarget).filter(Boolean)),
  ].sort() as DeploymentTarget[];

  const hasActiveFilters = !!(
    filters.search ||
    filters.status ||
    filters.flavor ||
    filters.projectType ||
    filters.functionAppModel ||
    filters.repoName ||
    filters.deploymentTarget
  );

  return (
    <div className="ax-toolbar" role="search" aria-label="Filter projects">
      <div className="ax-search">
        <span className="ax-search__icon">
          <IconSearch />
        </span>
        <input
          className="ax-input"
          type="search"
          placeholder="Search repos, projects, frameworks, NuGet packages..."
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          aria-label="Search repos, projects, frameworks, and NuGet packages"
        />
      </div>

      <select
        className="ax-select"
        value={filters.repoName || ""}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            repoName: e.target.value || null,
          })
        }
        aria-label="Filter by repository"
      >
        <option value="">All Repositories</option>
        {uniqueRepoNames.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      <select
        className="ax-select"
        value={filters.status || ""}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            status: (e.target.value as LifecycleStatus) || null,
          })
        }
        aria-label="Filter by lifecycle status"
      >
        <option value="">All Statuses</option>
        {uniqueStatuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        className="ax-select"
        value={filters.flavor || ""}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            flavor: (e.target.value as DotNetFlavor) || null,
          })
        }
        aria-label="Filter by .NET flavor"
      >
        <option value="">All Flavors</option>
        {uniqueFlavors.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      <select
        className="ax-select"
        value={filters.projectType || ""}
        onChange={(e) =>
          onFilterChange({
            ...filters,
            projectType: (e.target.value as ProjectType) || null,
          })
        }
        aria-label="Filter by project type"
      >
        <option value="">All Types</option>
        {uniqueTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {uniqueDeploymentTargets.length > 0 && (
        <select
          className="ax-select"
          value={filters.deploymentTarget || ""}
          onChange={(e) =>
            onFilterChange({
              ...filters,
              deploymentTarget: (e.target.value as DeploymentTarget) || null,
            })
          }
          aria-label="Filter by deployment target"
        >
          <option value="">All Deploy Targets</option>
          {uniqueDeploymentTargets.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}

      {uniqueFunctionModels.length > 0 && (
        <select
          className="ax-select"
          value={filters.functionAppModel || ""}
          onChange={(e) =>
            onFilterChange({
              ...filters,
              functionAppModel: (e.target.value as FunctionAppModel) || null,
            })
          }
          aria-label="Filter by function app model"
        >
          <option value="">All Function Models</option>
          {uniqueFunctionModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onFilterChange({
              search: "",
              status: null,
              flavor: null,
              projectType: null,
              functionAppModel: null,
              repoName: null,
              deploymentTarget: null,
            })
          }
          aria-label="Clear all filters"
        >
          Clear filters
        </Button>
      )}

      {resultCount !== undefined && totalCount !== undefined && (
        <span className="pvd-count" role="status">
          {hasActiveFilters
            ? `Showing ${resultCount} of ${totalCount} projects`
            : `${totalCount} project${totalCount === 1 ? "" : "s"}`}
        </span>
      )}
    </div>
  );
}
