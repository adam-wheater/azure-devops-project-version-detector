import { DetectedProject, ScanResult } from "../models/types";

/**
 * One CSV field. Quotes fields containing a comma, quote, CR or LF (a bare CR
 * used to pass unquoted and split the row in Excel), and neutralises values a
 * spreadsheet would run as a formula: repository and project names come from
 * the organisation's repos, so a name starting with "=" must not execute when
 * someone opens the export.
 */
function escapeCsv(value: string): string {
  let field = value;
  if (/^[=+\-@\t\r]/.test(field)) {
    field = `'${field}`;
  }
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Export projects to CSV.
 * When called with a ScanResult the full project list is exported.
 * When called with an array of DetectedProject (filtered), only those are exported.
 */
export function exportToCsv(source: ScanResult | DetectedProject[]): string {
  const projects: DetectedProject[] = Array.isArray(source) ? source : source.projects;

  const headers = [
    "Repository",
    "Project File",
    "Project Name",
    "Project Type",
    ".NET Flavor",
    "Target Framework",
    "All Target Frameworks",
    "SDK Version",
    "Lifecycle Status",
    "EOL Date",
    "Latest LTS",
    "Function App Model",
    "Function Runtime Version",
    "Deployment Target",
    "Deployment Confidence",
    "Deployment Evidence",
    "Dockerfile",
    "Has Controllers",
    "Container App Environment",
    "Has Workload Profile",
    "Pipeline File",
    "Key NuGet Packages",
  ];

  const rows = projects.map((p: DetectedProject) => [
    p.repoName,
    p.projectFile,
    p.projectName,
    p.projectType,
    p.dotNetFlavor,
    p.targetFramework,
    p.targetFrameworks.join("; "),
    p.sdkVersion || "",
    p.lifecycleStatus,
    p.eolDate || "",
    p.latestLts,
    p.functionAppModel || "",
    p.functionRuntimeVersion || "",
    p.deploymentTarget || "",
    p.deploymentConfidence || "",
    (p.deploymentEvidence ?? []).join("; "),
    p.dockerfilePath || "",
    p.hasControllers != null ? String(p.hasControllers) : "",
    p.containerAppEnvironment || "",
    p.hasWorkloadProfile != null ? String(p.hasWorkloadProfile) : "",
    p.pipelineFile || "",
    p.keyNuGetPackages.map((n) => `${n.name}@${n.version}`).join("; "),
  ]);

  const csvLines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];

  return csvLines.join("\n");
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking in the same tick as click() can cancel the download before the
  // browser has read the blob (Firefox and Safari do), so defer it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
