import {
  PROJECT_FILE_PATTERNS,
  CONFIG_FILE_PATTERNS,
  FUNCTION_APP_PATTERNS,
  PIPELINE_FILE_PATTERNS,
  DOCKERFILE_PATTERN,
  COMPOSE_FILE_PATTERN,
  KUBERNETES_PATH_PATTERN,
  CONTROLLER_FILE_PATTERN,
  RAZOR_FILE_PATTERN,
} from "./Constants";

export interface DiscoveredFiles {
  projectFiles: string[];
  configFiles: string[];
  functionAppFiles: string[];
  pipelineFiles: string[];
  /**
   * Path-only signals used for deployment-target inference. These never
   * trigger content fetches — they are read straight off the repo tree.
   */
  dockerfilePaths: string[];
  composeFilePaths: string[];
  kubernetesFilePaths: string[];
  controllerFilePaths: string[];
  razorFilePaths: string[];
  hasSignals: boolean;
}

export function discoverFiles(items: Array<{ path: string; isFolder: boolean }>): DiscoveredFiles {
  const projectFiles: string[] = [];
  const configFiles: string[] = [];
  const functionAppFiles: string[] = [];
  const pipelineFiles: string[] = [];
  const dockerfilePaths: string[] = [];
  const composeFilePaths: string[] = [];
  const kubernetesFilePaths: string[] = [];
  const controllerFilePaths: string[] = [];
  const razorFilePaths: string[] = [];

  for (const item of items) {
    if (item.isFolder) continue;
    const p = item.path;

    if (PROJECT_FILE_PATTERNS.some((rx) => rx.test(p))) {
      projectFiles.push(p);
      continue;
    }

    if (CONFIG_FILE_PATTERNS.some((rx) => rx.test(p))) {
      configFiles.push(p);
      continue;
    }

    if (FUNCTION_APP_PATTERNS.some((rx) => rx.test(p))) {
      functionAppFiles.push(p);
      continue;
    }

    if (DOCKERFILE_PATTERN.test(p)) {
      dockerfilePaths.push(p);
      continue;
    }

    if (COMPOSE_FILE_PATTERN.test(p)) {
      composeFilePaths.push(p);
      continue;
    }

    if (CONTROLLER_FILE_PATTERN.test(p)) {
      controllerFilePaths.push(p);
      continue;
    }

    if (RAZOR_FILE_PATTERN.test(p)) {
      razorFilePaths.push(p);
      continue;
    }

    // Kubernetes manifests are YAML like pipelines, so check the more
    // specific path convention first.
    if (KUBERNETES_PATH_PATTERN.test(p)) {
      kubernetesFilePaths.push(p);
      continue;
    }

    if (PIPELINE_FILE_PATTERNS.some((rx) => rx.test(p))) {
      pipelineFiles.push(p);
    }
  }

  return {
    projectFiles,
    configFiles,
    functionAppFiles,
    pipelineFiles,
    dockerfilePaths,
    composeFilePaths,
    kubernetesFilePaths,
    controllerFilePaths,
    razorFilePaths,
    hasSignals: projectFiles.length > 0,
  };
}
