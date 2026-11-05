import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds } from "azure-devops-extension-api";
import { ScanResult } from "../models/types";

const DOCUMENT_ID_PREFIX = "scan-result-cache";
const COLLECTION_NAME = "ScanCache";

// Extension Data Storage is scoped per-organization, never per-project, so
// every project sharing this extension would read/write the same document
// unless the project id is baked into the document id.
function getDocumentId(projectId: string): string {
  return `${DOCUMENT_ID_PREFIX}-${projectId}`;
}

interface CachedScanDocument {
  id: string;
  scanResult: ScanResult;
  cachedAt: string;
}

// Scan results are private to the user who ran the scan: the extension has
// no notion of "team" results, and repos a user can't see shouldn't leak
// into a shared cache that every other user's page load would read from.
const USER_SCOPE = { scopeType: "User" };

async function getDataManager(): Promise<any> {
  const dataService = await SDK.getService<any>(CommonServiceIds.ExtensionDataService);
  return dataService.getExtensionDataManager(
    SDK.getExtensionContext().id,
    await SDK.getAccessToken()
  );
}

export async function loadCachedScanResult(projectId: string): Promise<{
  scanResult: ScanResult;
  cachedAt: string;
} | null> {
  try {
    const manager = await getDataManager();
    const doc: CachedScanDocument = await manager.getDocument(
      COLLECTION_NAME,
      getDocumentId(projectId),
      USER_SCOPE
    );
    if (doc && doc.scanResult) {
      return { scanResult: doc.scanResult, cachedAt: doc.cachedAt };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveScanResultToCache(
  scanResult: ScanResult,
  projectId: string
): Promise<void> {
  try {
    const manager = await getDataManager();
    const doc: CachedScanDocument = {
      id: getDocumentId(projectId),
      scanResult,
      cachedAt: new Date().toISOString(),
    };
    await manager.setDocument(COLLECTION_NAME, doc, USER_SCOPE);
  } catch {
    // Cache save failure is non-critical
    console.warn("Failed to cache scan result");
  }
}
