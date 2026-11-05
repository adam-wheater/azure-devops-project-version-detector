import * as SDK from "azure-devops-extension-sdk";
import { getClient, CommonServiceIds } from "azure-devops-extension-api";
import {
  GitRestClient,
  GitRepository,
  VersionControlRecursionType,
} from "azure-devops-extension-api/Git";
import { retryWithBackoff } from "../utils/retryWithBackoff";

export interface RepoItem {
  path: string;
  isFolder: boolean;
}

async function getProject(): Promise<{ id: string; name: string } | undefined> {
  const projectService = await SDK.getService<any>(CommonServiceIds.ProjectPageService);
  return projectService.getProject();
}

export async function getProjectName(): Promise<string> {
  const project = await getProject();
  return project?.name ?? "";
}

/**
 * Stable GUID identifying the current Azure DevOps project. Extension Data
 * Storage is scoped per-organization, not per-project, so callers that
 * persist project-specific data (e.g. the scan cache) must namespace their
 * document ids with this to avoid mixing up results between projects.
 */
export async function getProjectId(): Promise<string> {
  const project = await getProject();
  return project?.id ?? "";
}

export async function getGitClient(): Promise<GitRestClient> {
  return getClient(GitRestClient);
}

export async function listRepositories(
  projectName: string,
  signal?: AbortSignal
): Promise<GitRepository[]> {
  const client = await getGitClient();
  return retryWithBackoff(() => client.getRepositories(projectName), { signal });
}

/**
 * Head commit SHA of the repo's default branch, or "" when it can't be
 * determined (empty repo, missing default branch, API error). An empty
 * result must never be treated as a match when comparing scans — it means
 * "unknown", so the repo gets a full scan.
 */
export async function getRepoHeadCommit(
  client: GitRestClient,
  repo: GitRepository,
  signal?: AbortSignal
): Promise<string> {
  const branchRef = repo.defaultBranch ?? "";
  if (!repo.id || !branchRef) return "";
  const branchName = branchRef.replace(/^refs\/heads\//, "");
  try {
    const stats = await retryWithBackoff(() => client.getBranch(repo.id, branchName), { signal });
    return stats?.commit?.commitId ?? "";
  } catch {
    return "";
  }
}

/**
 * Full file tree of a repository's default branch.
 *
 * Errors are deliberately NOT swallowed here. The scan orchestrator records a
 * repo's head commit only after a successful scan, so that a failed scan is
 * retried next time instead of being reused as "unchanged". Returning an empty
 * tree on failure made a throttled or broken request indistinguishable from an
 * empty repository: the head was recorded, and every later incremental scan
 * reused zero projects for that repo until somebody pushed a new commit.
 */
export async function getRepoTree(
  client: GitRestClient,
  repoId: string,
  signal?: AbortSignal
): Promise<RepoItem[]> {
  const items = await retryWithBackoff(
    () => client.getItems(repoId, "/", undefined, VersionControlRecursionType.Full),
    { signal }
  );
  return (items ?? []).map((item: any) => ({
    path: item.path ?? "",
    isFolder: item.isFolder ?? false,
  }));
}
