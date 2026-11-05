import * as React from "react";
import { DetectedProject, LifecycleStatus } from "../models/types";
import { compareTargetFrameworks } from "../lifecycle/DotNetLifecycle";
import { isDatePast } from "../utils/dates";
import { VersionBadge } from "./VersionBadge";
import { EmptyState, IconChevronRight, SortHeader } from "./ui";

interface VersionTableProps {
  projects: DetectedProject[];
}

type SortField =
  | "repoName"
  | "projectName"
  | "targetFramework"
  | "dotNetFlavor"
  | "projectType"
  | "lifecycleStatus"
  | "deploymentTarget";

const SORTABLE_COLUMNS: { field: SortField; label: string }[] = [
  { field: "repoName", label: "Repository" },
  { field: "projectName", label: "Project" },
  { field: "projectType", label: "Type" },
  { field: "dotNetFlavor", label: "Flavor" },
  { field: "targetFramework", label: "Target Framework" },
  { field: "lifecycleStatus", label: "Status" },
  { field: "deploymentTarget", label: "Deploys To" },
];

/** Columns in the table, including the expand toggle; the detail row spans all of them. */
const COLUMN_COUNT = SORTABLE_COLUMNS.length + 3;

export function compareProjects(
  a: DetectedProject,
  b: DetectedProject,
  field: SortField,
  dir: "asc" | "desc"
): number {
  let cmp: number;
  if (field === "lifecycleStatus") {
    cmp = statusSortOrder(a.lifecycleStatus) - statusSortOrder(b.lifecycleStatus);
  } else if (field === "targetFramework") {
    cmp = compareTargetFrameworks(a.targetFramework, b.targetFramework);
  } else {
    cmp = String(a[field] || "").localeCompare(String(b[field] || ""));
  }
  return dir === "asc" ? cmp : -cmp;
}

export function VersionTable({ projects }: VersionTableProps) {
  const [sortField, setSortField] = React.useState<SortField>("lifecycleStatus");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sorted = React.useMemo(
    () => [...projects].sort((a, b) => compareProjects(a, b, sortField, sortDir)),
    [projects, sortField, sortDir]
  );

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (projects.length === 0) {
    return <EmptyState title="No projects match the current filters." />;
  }

  return (
    <div className="ax-card ax-section">
      <div className="ax-table-wrap pvd-table-scroll">
        <table className="ax-table" data-testid="version-table">
          <thead>
            <tr>
              <th className="pvd-col-toggle">
                <span className="ax-sr-only">Details</span>
              </th>
              {SORTABLE_COLUMNS.map((column) => (
                <SortHeader
                  key={column.field}
                  // A real button inside the header makes it reachable and
                  // operable from the keyboard; its click bubbles to the th.
                  label={
                    <button type="button" className="pvd-sort-button">
                      {column.label}
                    </button>
                  }
                  active={sortField === column.field}
                  direction={sortDir}
                  onClick={() => handleSort(column.field)}
                />
              ))}
              <th>EOL Date</th>
              <th>Upgrade To</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((project) => {
              const rowKey = `${project.repoId}-${project.projectFile}`;
              const isExpanded = expandedRows.has(rowKey);
              const eolPassed = isDatePast(project.eolDate);
              return (
                <React.Fragment key={rowKey}>
                  <tr
                    className="pvd-data-row"
                    onClick={() => toggleRow(rowKey)}
                    title={isExpanded ? "Click to collapse details" : "Click to expand details"}
                  >
                    <td>
                      <button
                        type="button"
                        className="ax-btn ax-btn--ghost ax-btn--icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(rowKey);
                        }}
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? "Collapse" : "Expand"} details for ${project.projectName}`}
                      >
                        <span className={`pvd-chevron${isExpanded ? " pvd-chevron--open" : ""}`}>
                          <IconChevronRight />
                        </span>
                      </button>
                    </td>
                    <td>
                      <strong>{project.repoName}</strong>
                    </td>
                    <td>{project.projectName}</td>
                    <td>{project.projectType}</td>
                    <td>{project.dotNetFlavor}</td>
                    <td className="ax-mono">
                      {project.targetFramework}
                      {project.targetFrameworks.length > 1 && (
                        <span className="ax-muted"> (+{project.targetFrameworks.length - 1})</span>
                      )}
                    </td>
                    <td>
                      <VersionBadge status={project.lifecycleStatus} />
                    </td>
                    <td>
                      {project.deploymentTarget ? (
                        <span
                          className={project.deploymentConfidence === "likely" ? "pvd-likely" : ""}
                          title={
                            (project.deploymentEvidence ?? []).join("; ") ||
                            `Detected deployment target: ${project.deploymentTarget}`
                          }
                        >
                          {project.deploymentTarget}
                          {project.deploymentConfidence === "likely" ? " (likely)" : ""}
                        </span>
                      ) : (
                        <span className="ax-muted">—</span>
                      )}
                    </td>
                    <td className={eolPassed ? "pvd-date-past" : "ax-muted"}>
                      {project.eolDate || "—"}
                      {eolPassed && <span className="ax-sr-only"> (passed)</span>}
                    </td>
                    <td>{project.latestLts}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="pvd-detail-row">
                      <td colSpan={COLUMN_COUNT}>
                        <ProjectDetailPanel project={project} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusSortOrder(status: LifecycleStatus): number {
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

function ProjectDetailPanel({ project }: { project: DetectedProject }) {
  return (
    <div className="pvd-detail-grid">
      <div className="pvd-detail-section">
        <h4 className="pvd-detail-title">Project File</h4>
        <p className="ax-mono">{project.projectFile}</p>
        {project.sdkVersion && (
          <>
            <h4 className="pvd-detail-title">SDK Version</h4>
            <p>{project.sdkVersion} (from global.json)</p>
          </>
        )}
        {project.targetFrameworks.length > 1 && (
          <>
            <h4 className="pvd-detail-title">All Target Frameworks</h4>
            <p className="ax-mono">{project.targetFrameworks.join(", ")}</p>
          </>
        )}
      </div>

      {project.deploymentTarget && (
        <div className="pvd-detail-section">
          <h4 className="pvd-detail-title">Deployment</h4>
          <p>
            <strong>{project.deploymentTarget}</strong>
            {project.deploymentConfidence === "likely" && (
              <span className="ax-muted"> (likely, inferred)</span>
            )}
          </p>
          {(project.deploymentEvidence ?? []).length > 0 && (
            <ul className="pvd-list">
              {project.deploymentEvidence!.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          )}
          {project.hasControllers && (
            <p className="ax-muted">
              Has API controllers: <strong>Yes</strong>
            </p>
          )}
          {project.dockerfilePath && (
            <p className="ax-mono">Dockerfile: {project.dockerfilePath}</p>
          )}
        </div>
      )}

      {(project.functionAppModel || project.containerAppEnvironment) && (
        <div className="pvd-detail-section">
          {project.functionAppModel && (
            <>
              <h4 className="pvd-detail-title">Azure Function</h4>
              <p>
                <strong>Model:</strong> {project.functionAppModel}
              </p>
              {project.functionRuntimeVersion && (
                <p>
                  <strong>Runtime:</strong> {project.functionRuntimeVersion}
                </p>
              )}
            </>
          )}
          {project.containerAppEnvironment && (
            <>
              <h4 className="pvd-detail-title">Container App</h4>
              <p>
                <strong>Environment:</strong> {project.containerAppEnvironment}
              </p>
              <p>
                <strong>Workload Profile:</strong> {project.hasWorkloadProfile ? "Yes" : "No"}
              </p>
              {project.pipelineFile && <p className="ax-mono">Pipeline: {project.pipelineFile}</p>}
            </>
          )}
        </div>
      )}

      {project.keyNuGetPackages.length > 0 && (
        <div className="pvd-detail-section">
          <h4 className="pvd-detail-title">Key NuGet Packages</h4>
          <ul className="pvd-list pvd-list--plain ax-mono">
            {project.keyNuGetPackages.map((pkg, i) => (
              <li key={i}>
                {pkg.name}
                <span className="ax-muted"> @ {pkg.version}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
