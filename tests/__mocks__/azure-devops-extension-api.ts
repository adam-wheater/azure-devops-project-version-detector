const mockClients: Record<string, any> = {};

export const CommonServiceIds = {
  ProjectPageService: "ms.vss-tfs-web.tfs-page-data-service",
  ExtensionDataService: "ms.vss-features.extension-data-service",
};

export enum VersionControlRecursionType {
  None = 0,
  OneLevel = 1,
  OneLevelPlusNestedEmptyFolders = 4,
  Full = 120,
}

export class GitRestClient {
  _mockName = "GitRestClient";
}

export interface GitRepository {
  id: string;
  name: string;
}

export interface GitItem {
  path: string;
  isFolder: boolean;
}

export function getClient(clientClass: any): any {
  const name = clientClass._mockName || clientClass.name;
  if (!mockClients[name]) {
    mockClients[name] = {};
  }
  return mockClients[name];
}

export function __setMockClient(name: string, client: any): void {
  mockClients[name] = client;
}

export function __resetMockClients(): void {
  Object.keys(mockClients).forEach((k) => delete mockClients[k]);
}
