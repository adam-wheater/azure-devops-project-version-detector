import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds } from "azure-devops-extension-api";
import { loadCachedScanResult, saveScanResultToCache } from "@/services/ScanCacheService";
import { ScanResult } from "@/models/types";

const mockSDK = SDK as unknown as {
  __setMockService: (id: string, service: any) => void;
  __resetMockServices: () => void;
};

const SAMPLE_RESULT: ScanResult = {
  projects: [],
  summary: {
    totalRepos: 1,
    totalProjects: 0,
    outdatedCount: 0,
    expiringSoonCount: 0,
    supportedCount: 0,
    frameworkBreakdown: {},
    projectTypeBreakdown: {},
    flavorBreakdown: {},
  },
  scanDate: "2026-01-01T00:00:00.000Z",
  duration: 1000,
};

describe("ScanCacheService", () => {
  let getDocument: jest.Mock;
  let setDocument: jest.Mock;

  beforeEach(() => {
    getDocument = jest.fn();
    setDocument = jest.fn().mockResolvedValue(undefined);
    mockSDK.__setMockService(CommonServiceIds.ExtensionDataService, {
      getExtensionDataManager: jest.fn().mockResolvedValue({ getDocument, setDocument }),
    });
  });

  afterEach(() => {
    mockSDK.__resetMockServices();
  });

  it("scopes the save to the current user so results are not shared across users", async () => {
    await saveScanResultToCache(SAMPLE_RESULT, "project-a");

    expect(setDocument).toHaveBeenCalledTimes(1);
    const [collection, doc, options] = setDocument.mock.calls[0];
    expect(collection).toBe("ScanCache");
    expect(options).toEqual({ scopeType: "User" });
    expect(doc.scanResult).toBe(SAMPLE_RESULT);
  });

  it("scopes the load to the current user", async () => {
    getDocument.mockResolvedValue(null);
    await loadCachedScanResult("project-a");

    expect(getDocument).toHaveBeenCalledTimes(1);
    const [, , options] = getDocument.mock.calls[0];
    expect(options).toEqual({ scopeType: "User" });
  });

  it("namespaces the document id by project so projects don't share a cache", async () => {
    await saveScanResultToCache(SAMPLE_RESULT, "project-a");
    await saveScanResultToCache(SAMPLE_RESULT, "project-b");

    const idA = setDocument.mock.calls[0][1].id;
    const idB = setDocument.mock.calls[1][1].id;
    expect(idA).not.toBe(idB);
    expect(idA).toContain("project-a");
    expect(idB).toContain("project-b");

    await loadCachedScanResult("project-a");
    const loadedIdA = getDocument.mock.calls[0][1];
    expect(loadedIdA).toBe(idA);
  });

  it("returns null when no cached document exists", async () => {
    getDocument.mockRejectedValue(new Error("not found"));
    const result = await loadCachedScanResult("project-a");
    expect(result).toBeNull();
  });

  it("returns the cached scan result and timestamp when present", async () => {
    getDocument.mockResolvedValue({
      id: "scan-result-cache-project-a",
      scanResult: SAMPLE_RESULT,
      cachedAt: "2026-01-01T00:00:00.000Z",
    });
    const result = await loadCachedScanResult("project-a");
    expect(result?.scanResult).toEqual(SAMPLE_RESULT);
    expect(result?.cachedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not throw when saving fails", async () => {
    setDocument.mockRejectedValue(new Error("conflict"));
    await expect(saveScanResultToCache(SAMPLE_RESULT, "project-a")).resolves.toBeUndefined();
  });
});
