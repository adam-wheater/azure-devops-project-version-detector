import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds } from "azure-devops-extension-api";
import {
  FrameworkLifecycle,
  LifecycleStatus,
  LifecycleConfigDocument,
  LifecycleConfigOverride,
  LifecycleConfigEntry,
} from "../models/types";
import { computeStatus } from "../lifecycle/DotNetLifecycle";

const DOCUMENT_ID = "lifecycle-config";
const COLLECTION_NAME = "LifecycleSettings";

export function makeKey(framework: string, version: string): string {
  return `${framework}|${version}`;
}

async function getDataManager(): Promise<any> {
  const dataService = await SDK.getService<any>(CommonServiceIds.ExtensionDataService);
  return dataService.getExtensionDataManager(
    SDK.getExtensionContext().id,
    await SDK.getAccessToken()
  );
}

export async function loadConfig(): Promise<LifecycleConfigDocument | null> {
  try {
    const manager = await getDataManager();
    const doc = await manager.getDocument(COLLECTION_NAME, DOCUMENT_ID);
    return doc as LifecycleConfigDocument;
  } catch {
    return null;
  }
}

export async function saveConfig(doc: LifecycleConfigDocument): Promise<void> {
  const manager = await getDataManager();
  await manager.setDocument(COLLECTION_NAME, {
    ...doc,
    id: DOCUMENT_ID,
    lastUpdated: new Date().toISOString(),
  });
}

export async function deleteConfig(): Promise<void> {
  try {
    const manager = await getDataManager();
    await manager.deleteDocument(COLLECTION_NAME, DOCUMENT_ID);
  } catch {
    // Already doesn't exist
  }
}

export function mergeWithDefaults(
  defaults: FrameworkLifecycle[],
  config: LifecycleConfigDocument | null
): LifecycleConfigEntry[] {
  // The document is shared, org-wide state written by older versions too, so
  // tolerate missing or malformed fields rather than throwing on load.
  const overrides: Record<string, LifecycleConfigOverride> =
    config?.overrides && typeof config.overrides === "object" ? config.overrides : {};
  const deletedDefaults = new Set(
    Array.isArray(config?.deletedDefaults) ? config!.deletedDefaults : []
  );
  const defaultKeys = new Set(defaults.map((d) => makeKey(d.framework, d.version)));
  const result: LifecycleConfigEntry[] = [];

  const fromOverride = (
    key: string,
    override: LifecycleConfigOverride,
    isCustom: boolean
  ): LifecycleConfigEntry => ({
    framework: override.framework,
    version: override.version,
    displayName: override.displayName,
    releaseDate: override.releaseDate,
    endOfLifeDate: override.endOfLifeDate,
    isLts: override.isLts,
    status: computeStatus({
      ...override,
      status: LifecycleStatus.Supported,
    }),
    key,
    isCustom,
    isModified: !isCustom,
  });

  for (const def of defaults) {
    const key = makeKey(def.framework, def.version);
    if (deletedDefaults.has(key)) continue;

    const override = overrides[key];
    if (override) {
      // An override for a built-in key replaces that entry exactly once. A
      // custom entry re-added under a built-in key (delete .NET 8, then add
      // it back) used to appear twice: once as the default, once as custom.
      result.push(fromOverride(key, override, !!override.isCustom));
    } else {
      result.push({
        ...def,
        status: computeStatus(def),
        key,
        isCustom: false,
        isModified: false,
      });
    }
  }

  for (const [key, override] of Object.entries(overrides)) {
    if (override?.isCustom && !defaultKeys.has(key)) {
      result.push(fromOverride(key, override, true));
    }
  }

  return result;
}

export function buildConfigDocument(
  entries: LifecycleConfigEntry[],
  defaults: FrameworkLifecycle[]
): LifecycleConfigDocument {
  const defaultKeys = new Set(defaults.map((d) => makeKey(d.framework, d.version)));
  const entryKeys = new Set(entries.map((e) => e.key));
  const overrides: Record<string, LifecycleConfigOverride> = {};
  const deletedDefaults: string[] = [];

  for (const key of defaultKeys) {
    if (!entryKeys.has(key)) {
      deletedDefaults.push(key);
    }
  }

  for (const entry of entries) {
    if (entry.isCustom || entry.isModified) {
      overrides[entry.key] = {
        framework: entry.framework,
        version: entry.version,
        displayName: entry.displayName,
        releaseDate: entry.releaseDate,
        endOfLifeDate: entry.endOfLifeDate,
        isLts: entry.isLts,
        isCustom: entry.isCustom,
      };
    }
  }

  return {
    id: DOCUMENT_ID,
    lastUpdated: new Date().toISOString(),
    overrides,
    deletedDefaults,
  };
}

export function entriesToLifecycleData(entries: LifecycleConfigEntry[]): FrameworkLifecycle[] {
  return entries.map((e) => ({
    framework: e.framework,
    version: e.version,
    displayName: e.displayName,
    releaseDate: e.releaseDate,
    endOfLifeDate: e.endOfLifeDate,
    isLts: e.isLts,
    status: computeStatus(e),
  }));
}
