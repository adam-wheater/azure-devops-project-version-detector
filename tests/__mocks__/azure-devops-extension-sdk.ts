const mockServices: Record<string, any> = {};

export function init(): Promise<void> {
  return Promise.resolve();
}

export function ready(): Promise<void> {
  return Promise.resolve();
}

export function getService<T>(serviceId: string): Promise<T> {
  return Promise.resolve(mockServices[serviceId] as T);
}

export function getAccessToken(): Promise<string> {
  return Promise.resolve("mock-access-token");
}

export function getExtensionContext() {
  return {
    id: "project-version-detector",
    extensionId: "project-version-detector",
    publisherId: "adam-wheater",
    version: "1.0.0",
  };
}

export function __setMockService(id: string, service: any): void {
  mockServices[id] = service;
}

export function __resetMockServices(): void {
  Object.keys(mockServices).forEach((k) => delete mockServices[k]);
}
