import { ContainerAppInfo, FileContent } from "../../models/types";

export function detectContainerApps(pipelineFiles: FileContent[]): ContainerAppInfo[] {
  const results: ContainerAppInfo[] = [];

  for (const file of pipelineFiles) {
    const infos = parsePipelineForContainerApps(file.content, file.path);
    results.push(...infos);
  }

  // If any pipeline/template file mentions workload profiles, propagate to all
  // results. The workload config is often in a different template than the task.
  if (results.length > 0 && !results.some((r) => r.hasWorkloadProfile)) {
    const anyFileHasWorkload = pipelineFiles.some((f) => detectWorkloadProfile(f.content));
    if (anyFileHasWorkload) {
      for (const r of results) {
        r.hasWorkloadProfile = true;
      }
    }
  }

  return results;
}

/**
 * Extract template file paths referenced via `- template:` or `template:` in
 * Azure DevOps pipeline YAML.  Returns paths exactly as written (relative to
 * the repo root or the referencing file – caller must resolve).
 */
export function extractTemplateReferences(content: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  // Matches `- template: path/to/file.yml` and `template: path/to/file.yml`
  const templateRegex =
    /(?:^|\n)\s*-?\s*template:\s*['"]*([^'"#\n@]+\.ya?ml)['"]*(?:\s*@[^\s#]*)?/gi;
  let match: RegExpExecArray | null;

  while ((match = templateRegex.exec(content)) !== null) {
    const rawPath = match[1].trim();
    if (rawPath && !seen.has(rawPath)) {
      seen.add(rawPath);
      paths.push(rawPath);
    }
  }

  return paths;
}

/**
 * Resolve a template path relative to the referencing file.
 * E.g. referencing file `/pipelines/infrastructure.yml` with
 * template `../templates/deploy.yml` → `/templates/deploy.yml`
 */
export function resolveTemplatePath(
  referencingFilePath: string,
  templateRelativePath: string
): string {
  // If already absolute (starts with /) keep as-is
  if (templateRelativePath.startsWith("/")) return templateRelativePath;

  const refDir = referencingFilePath.replace(/\/[^/]+$/, "");
  const parts = `${refDir}/${templateRelativePath}`.split("/").filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }

  return "/" + resolved.join("/");
}

function parsePipelineForContainerApps(content: string, filePath: string): ContainerAppInfo[] {
  const results: ContainerAppInfo[] = [];

  // Detect AzureContainerApps@1 task usage
  const hasContainerAppTask = /task:\s*AzureContainerApps@\d+/i.test(content);

  // Detect az containerapp commands
  const hasAzContainerApp = /az\s+containerapp\s+(create|update|deploy|up)/i.test(content);

  // Detect actual container app deployment config keys (not just any mention)
  const hasContainerAppConfig = /containerAppName\s*:/i.test(content);

  if (!hasContainerAppTask && !hasAzContainerApp && !hasContainerAppConfig) {
    return results;
  }

  // Extract environment name
  const environment = extractEnvironment(content);

  // Detect workload profiles
  const hasWorkloadProfile = detectWorkloadProfile(content);

  // Extract container image
  const containerImage = extractContainerImage(content);

  results.push({
    environment: environment || "Unknown",
    hasWorkloadProfile,
    containerImage,
    pipelineFile: filePath,
  });

  return results;
}

function extractEnvironment(content: string): string {
  // Line-based extraction handles ${{ }} expressions that contain spaces
  const lines = content.split("\n");

  const linePatterns = [
    /^\s*containerAppEnvironment:\s*(.*)/i,
    /^\s*containerapp-environment:\s*(.*)/i,
    /^\s*CONTAINER_APP_ENVIRONMENT:\s*(.*)/i,
    /^\s*environmentName:\s*(.*)/i,
    /^\s*managedEnvironmentId:\s*(.*)/i,
  ];

  for (const line of lines) {
    for (const pattern of linePatterns) {
      const match = line.match(pattern);
      if (match) {
        const rawValue = match[1]
          .trim()
          .replace(/^['"]/, "")
          .replace(/['"]$/, "")
          .replace(/#.*$/, "")
          .trim();
        if (rawValue) return resolveVariableRef(rawValue);
      }
    }
  }

  // Also check for CLI-style --environment flag
  const cliMatch = content.match(/--environment\s+['"]?(\$\([^)]+\)|[^\s'"#\n]+)/i);
  if (cliMatch) {
    return resolveVariableRef(cliMatch[1].replace(/['"]$/, ""));
  }

  return "";
}

function detectWorkloadProfile(content: string): boolean {
  // Match references to workload profiles specifically, avoiding false
  // positives from random uses of the word "workload" in YAML comments
  // or unrelated context.  Covers workloadProfileName, workload-profile-name,
  // useWorkloadProfile, WORKLOAD_PROFILE, --workload-profile, etc.
  return /workload[-_]?profile/i.test(content);
}

function extractContainerImage(content: string): string | undefined {
  const imagePatterns = [
    /imageToDeploy:\s*['"]?([^\s'"#\n]+)/i,
    /containerImage:\s*['"]?([^\s'"#\n]+)/i,
    /image:\s*['"]?([^\s'"#\n]+)/i,
    /--image\s+['"]?([^\s'"#\n]+)/i,
    /CONTAINER_IMAGE:\s*['"]?([^\s'"#\n]+)/i,
  ];

  for (const pattern of imagePatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

function resolveVariableRef(value: string): string {
  // Strip Azure DevOps variable syntax like $(...) or $(...)
  if (value.startsWith("$(") && value.endsWith(")")) {
    return `[Variable: ${value.slice(2, -1)}]`;
  }
  if (value.startsWith("${{") && value.endsWith("}}")) {
    return `[Parameter: ${value.slice(3, -2).trim()}]`;
  }
  return value;
}
