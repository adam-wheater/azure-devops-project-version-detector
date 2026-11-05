import { mergeWithDefaults, buildConfigDocument, makeKey } from "@/services/LifecycleConfigService";
import {
  FrameworkLifecycle,
  LifecycleStatus,
  LifecycleConfigDocument,
  LifecycleConfigEntry,
} from "@/models/types";

const MOCK_DEFAULTS: FrameworkLifecycle[] = [
  {
    framework: ".NET",
    version: "8.0",
    displayName: ".NET 8",
    releaseDate: "2023-11-14",
    endOfLifeDate: "2026-11-10",
    isLts: true,
    status: LifecycleStatus.Supported,
  },
  {
    framework: ".NET",
    version: "7.0",
    displayName: ".NET 7",
    releaseDate: "2022-11-08",
    endOfLifeDate: "2024-05-14",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Framework",
    version: "4.8",
    displayName: ".NET Framework 4.8",
    releaseDate: "2019-04-18",
    endOfLifeDate: "",
    isLts: false,
    status: LifecycleStatus.Supported,
  },
];

describe("LifecycleConfigService", () => {
  describe("makeKey", () => {
    it("should create a key from framework and version", () => {
      expect(makeKey(".NET", "8.0")).toBe(".NET|8.0");
    });
  });

  describe("mergeWithDefaults", () => {
    it("should return defaults when no config exists", () => {
      const result = mergeWithDefaults(MOCK_DEFAULTS, null);
      expect(result).toHaveLength(3);
      expect(result[0].isCustom).toBe(false);
      expect(result[0].isModified).toBe(false);
      expect(result[0].key).toBe(".NET|8.0");
    });

    it("should apply overrides to default entries", () => {
      const config: LifecycleConfigDocument = {
        id: "lifecycle-config",
        lastUpdated: "2025-01-01",
        overrides: {
          ".NET|8.0": {
            framework: ".NET",
            version: "8.0",
            displayName: ".NET 8 (Updated)",
            releaseDate: "2023-11-14",
            endOfLifeDate: "2027-11-10",
            isLts: true,
            isCustom: false,
          },
        },
        deletedDefaults: [],
      };
      const result = mergeWithDefaults(MOCK_DEFAULTS, config);
      const net8 = result.find((e) => e.key === ".NET|8.0")!;
      expect(net8.displayName).toBe(".NET 8 (Updated)");
      expect(net8.endOfLifeDate).toBe("2027-11-10");
      expect(net8.isModified).toBe(true);
      expect(net8.isCustom).toBe(false);
    });

    it("should include custom entries from config", () => {
      const config: LifecycleConfigDocument = {
        id: "lifecycle-config",
        lastUpdated: "2025-01-01",
        overrides: {
          ".NET|11.0": {
            framework: ".NET",
            version: "11.0",
            displayName: ".NET 11",
            releaseDate: "2026-11-01",
            endOfLifeDate: "2027-05-01",
            isLts: false,
            isCustom: true,
          },
        },
        deletedDefaults: [],
      };
      const result = mergeWithDefaults(MOCK_DEFAULTS, config);
      expect(result).toHaveLength(4);
      const net11 = result.find((e) => e.key === ".NET|11.0")!;
      expect(net11.isCustom).toBe(true);
      expect(net11.displayName).toBe(".NET 11");
    });

    it("should exclude deleted default entries", () => {
      const config: LifecycleConfigDocument = {
        id: "lifecycle-config",
        lastUpdated: "2025-01-01",
        overrides: {},
        deletedDefaults: [".NET|7.0"],
      };
      const result = mergeWithDefaults(MOCK_DEFAULTS, config);
      expect(result).toHaveLength(2);
      expect(result.find((e) => e.key === ".NET|7.0")).toBeUndefined();
    });

    it("should list a custom entry that reuses a built-in key exactly once", () => {
      const config: LifecycleConfigDocument = {
        id: "lifecycle-config",
        lastUpdated: "2025-01-01",
        overrides: {
          ".NET|7.0": {
            framework: ".NET",
            version: "7.0",
            displayName: ".NET 7 (re-added)",
            releaseDate: "2022-11-08",
            endOfLifeDate: "2024-05-14",
            isLts: false,
            isCustom: true,
          },
        },
        deletedDefaults: [],
      };
      const result = mergeWithDefaults(MOCK_DEFAULTS, config);
      const matches = result.filter((e) => e.key === ".NET|7.0");
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ displayName: ".NET 7 (re-added)", isCustom: true });
      expect(result).toHaveLength(3);
    });

    it("should tolerate a stored document with missing fields", () => {
      const result = mergeWithDefaults(MOCK_DEFAULTS, {
        id: "lifecycle-config",
        lastUpdated: "2025-01-01",
      } as unknown as LifecycleConfigDocument);
      expect(result).toHaveLength(3);
    });

    it("should recompute status dynamically", () => {
      const result = mergeWithDefaults(MOCK_DEFAULTS, null);
      const net7 = result.find((e) => e.key === ".NET|7.0")!;
      // .NET 7 EOL was 2024-05-14, so it should be EndOfLife
      expect(net7.status).toBe(LifecycleStatus.EndOfLife);
    });
  });

  describe("buildConfigDocument", () => {
    it("should not persist unmodified default entries", () => {
      const entries: LifecycleConfigEntry[] = MOCK_DEFAULTS.map((d) => ({
        ...d,
        key: makeKey(d.framework, d.version),
        isCustom: false,
        isModified: false,
      }));
      const doc = buildConfigDocument(entries, MOCK_DEFAULTS);
      expect(Object.keys(doc.overrides)).toHaveLength(0);
      expect(doc.deletedDefaults).toHaveLength(0);
    });

    it("should persist modified entries", () => {
      const entries: LifecycleConfigEntry[] = MOCK_DEFAULTS.map((d) => ({
        ...d,
        key: makeKey(d.framework, d.version),
        isCustom: false,
        isModified: d.version === "8.0",
      }));
      entries[0].displayName = ".NET 8 (Modified)";
      const doc = buildConfigDocument(entries, MOCK_DEFAULTS);
      expect(Object.keys(doc.overrides)).toHaveLength(1);
      expect(doc.overrides[".NET|8.0"].displayName).toBe(".NET 8 (Modified)");
      expect(doc.overrides[".NET|8.0"].isCustom).toBe(false);
    });

    it("should persist custom entries", () => {
      const entries: LifecycleConfigEntry[] = [
        ...MOCK_DEFAULTS.map((d) => ({
          ...d,
          key: makeKey(d.framework, d.version),
          isCustom: false,
          isModified: false,
        })),
        {
          framework: ".NET",
          version: "11.0",
          displayName: ".NET 11",
          releaseDate: "2026-11-01",
          endOfLifeDate: "2027-05-01",
          isLts: false,
          status: LifecycleStatus.Preview,
          key: ".NET|11.0",
          isCustom: true,
          isModified: false,
        },
      ];
      const doc = buildConfigDocument(entries, MOCK_DEFAULTS);
      expect(Object.keys(doc.overrides)).toHaveLength(1);
      expect(doc.overrides[".NET|11.0"].isCustom).toBe(true);
    });

    it("should detect deleted defaults", () => {
      // Only include 2 of the 3 defaults
      const entries: LifecycleConfigEntry[] = MOCK_DEFAULTS.slice(0, 2).map((d) => ({
        ...d,
        key: makeKey(d.framework, d.version),
        isCustom: false,
        isModified: false,
      }));
      const doc = buildConfigDocument(entries, MOCK_DEFAULTS);
      expect(doc.deletedDefaults).toContain(".NET Framework|4.8");
    });

    it("should produce valid document structure", () => {
      const entries: LifecycleConfigEntry[] = MOCK_DEFAULTS.map((d) => ({
        ...d,
        key: makeKey(d.framework, d.version),
        isCustom: false,
        isModified: false,
      }));
      const doc = buildConfigDocument(entries, MOCK_DEFAULTS);
      expect(doc.id).toBe("lifecycle-config");
      expect(doc.lastUpdated).toBeTruthy();
      expect(doc.overrides).toBeDefined();
      expect(doc.deletedDefaults).toBeDefined();
    });
  });
});
