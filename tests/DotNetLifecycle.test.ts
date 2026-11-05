import {
  parseTfm,
  getLifecycleForFramework,
  getAllLifecycleData,
  getFlavorFromTfm,
  computeStatus,
  setActiveLifecycleData,
  clearActiveLifecycleData,
  getDefaultLifecycleData,
  hasStaleLifecycleData,
  getLatestLts,
  getLatestModern,
  compareTargetFrameworks,
} from "@/lifecycle/DotNetLifecycle";
import { DotNetFlavor, LifecycleStatus, FrameworkLifecycle } from "@/models/types";

describe("DotNetLifecycle", () => {
  describe("parseTfm", () => {
    it("should parse modern .NET TFMs", () => {
      expect(parseTfm("net8.0")).toEqual({
        framework: ".NET",
        version: "8.0",
        flavor: DotNetFlavor.DotNet,
      });
      expect(parseTfm("net9.0")).toEqual({
        framework: ".NET",
        version: "9.0",
        flavor: DotNetFlavor.DotNet,
      });
      expect(parseTfm("net6.0")).toEqual({
        framework: ".NET",
        version: "6.0",
        flavor: DotNetFlavor.DotNet,
      });
    });

    it("should parse .NET Core TFMs", () => {
      expect(parseTfm("netcoreapp3.1")).toEqual({
        framework: ".NET Core",
        version: "3.1",
        flavor: DotNetFlavor.DotNetCore,
      });
      expect(parseTfm("netcoreapp2.1")).toEqual({
        framework: ".NET Core",
        version: "2.1",
        flavor: DotNetFlavor.DotNetCore,
      });
    });

    it("should parse .NET Framework TFMs", () => {
      expect(parseTfm("net48")).toEqual({
        framework: ".NET Framework",
        version: "4.8",
        flavor: DotNetFlavor.DotNetFramework,
      });
      expect(parseTfm("net472")).toEqual({
        framework: ".NET Framework",
        version: "4.7.2",
        flavor: DotNetFlavor.DotNetFramework,
      });
      expect(parseTfm("net481")).toEqual({
        framework: ".NET Framework",
        version: "4.8.1",
        flavor: DotNetFlavor.DotNetFramework,
      });
      expect(parseTfm("net462")).toEqual({
        framework: ".NET Framework",
        version: "4.6.2",
        flavor: DotNetFlavor.DotNetFramework,
      });
    });

    it("should parse .NET Standard TFMs", () => {
      expect(parseTfm("netstandard2.0")).toEqual({
        framework: ".NET Standard",
        version: "2.0",
        flavor: DotNetFlavor.DotNetStandard,
      });
      expect(parseTfm("netstandard2.1")).toEqual({
        framework: ".NET Standard",
        version: "2.1",
        flavor: DotNetFlavor.DotNetStandard,
      });
    });

    it("should parse MAUI platform TFMs", () => {
      const result = parseTfm("net8.0-android");
      expect(result).not.toBeNull();
      expect(result!.flavor).toBe(DotNetFlavor.Maui);
      expect(result!.version).toBe("8.0");

      const iosResult = parseTfm("net8.0-ios");
      expect(iosResult!.flavor).toBe(DotNetFlavor.Maui);
    });

    it("should parse Xamarin TFMs", () => {
      expect(parseTfm("monoandroid12.0")).not.toBeNull();
      expect(parseTfm("monoandroid12.0")!.flavor).toBe(DotNetFlavor.Xamarin);

      expect(parseTfm("xamarin.ios")).not.toBeNull();
      expect(parseTfm("xamarin.ios")!.flavor).toBe(DotNetFlavor.Xamarin);
    });

    it("should return null for unrecognized TFMs", () => {
      expect(parseTfm("")).toBeNull();
      expect(parseTfm("somethingweird")).toBeNull();
    });
  });

  describe("getLifecycleForFramework", () => {
    it("should return EOL for .NET 7", () => {
      const result = getLifecycleForFramework("net7.0");
      expect(result.status).toBe(LifecycleStatus.EndOfLife);
    });

    it("should return EOL for .NET 6", () => {
      const result = getLifecycleForFramework("net6.0");
      expect(result.status).toBe(LifecycleStatus.EndOfLife);
    });

    it("should return EOL for .NET 5", () => {
      const result = getLifecycleForFramework("net5.0");
      expect(result.status).toBe(LifecycleStatus.EndOfLife);
    });

    it("should return EOL for .NET Core 3.1", () => {
      const result = getLifecycleForFramework("netcoreapp3.1");
      expect(result.status).toBe(LifecycleStatus.EndOfLife);
    });

    it("should return Supported for .NET Framework 4.8", () => {
      const result = getLifecycleForFramework("net48");
      expect(result.status).toBe(LifecycleStatus.Supported);
      expect(result.latestLts).toBe(".NET Framework 4.8.1");
    });

    it("should return Supported for .NET Standard", () => {
      const result = getLifecycleForFramework("netstandard2.0");
      expect(result.status).toBe(LifecycleStatus.Supported);
    });

    it("should include latest LTS recommendation", () => {
      const result = getLifecycleForFramework("net6.0");
      expect(result.latestLts).toBe(".NET 10");
    });

    it("should recommend MAUI for Xamarin TFMs", () => {
      const result = getLifecycleForFramework("monoandroid12.0");
      expect(result.latestLts).toBe(".NET MAUI (.NET 10)");
    });
  });

  describe("getFlavorFromTfm", () => {
    it("should return correct flavors", () => {
      expect(getFlavorFromTfm("net8.0")).toBe(DotNetFlavor.DotNet);
      expect(getFlavorFromTfm("netcoreapp3.1")).toBe(DotNetFlavor.DotNetCore);
      expect(getFlavorFromTfm("net48")).toBe(DotNetFlavor.DotNetFramework);
      expect(getFlavorFromTfm("netstandard2.0")).toBe(DotNetFlavor.DotNetStandard);
      expect(getFlavorFromTfm("net8.0-android")).toBe(DotNetFlavor.Maui);
    });
  });

  describe("getAllLifecycleData", () => {
    afterEach(() => {
      clearActiveLifecycleData();
    });

    it("should return lifecycle data for all known frameworks", () => {
      const data = getAllLifecycleData();
      expect(data.length).toBeGreaterThan(10);

      const net8 = data.find((d) => d.displayName === ".NET 8");
      expect(net8).toBeDefined();
      expect(net8!.isLts).toBe(true);

      const net7 = data.find((d) => d.displayName === ".NET 7");
      expect(net7).toBeDefined();
      expect(net7!.status).toBe(LifecycleStatus.EndOfLife);
    });

    it("should return .NET 10 as Supported", () => {
      const data = getAllLifecycleData();
      const net10 = data.find((d) => d.displayName === ".NET 10");
      expect(net10).toBeDefined();
      expect(net10!.status).toBe(LifecycleStatus.Supported);
      expect(net10!.isLts).toBe(true);
    });
  });

  describe("computeStatus", () => {
    it("should return Supported for entries with no EOL date", () => {
      const entry: FrameworkLifecycle = {
        framework: ".NET Framework",
        version: "4.8",
        displayName: ".NET Framework 4.8",
        releaseDate: "2019-04-18",
        endOfLifeDate: "",
        isLts: false,
        status: LifecycleStatus.Supported,
      };
      expect(computeStatus(entry)).toBe(LifecycleStatus.Supported);
    });

    it("should return EndOfLife for entries past EOL", () => {
      const entry: FrameworkLifecycle = {
        framework: ".NET",
        version: "5.0",
        displayName: ".NET 5",
        releaseDate: "2020-11-10",
        endOfLifeDate: "2022-05-10",
        isLts: false,
        status: LifecycleStatus.EndOfLife,
      };
      expect(computeStatus(entry)).toBe(LifecycleStatus.EndOfLife);
    });

    it("should return Preview for entries with future release date", () => {
      const entry: FrameworkLifecycle = {
        framework: ".NET",
        version: "99.0",
        displayName: ".NET 99",
        releaseDate: "2099-11-01",
        endOfLifeDate: "2102-11-01",
        isLts: true,
        status: LifecycleStatus.Preview,
      };
      expect(computeStatus(entry)).toBe(LifecycleStatus.Preview);
    });
  });

  describe("setActiveLifecycleData / clearActiveLifecycleData", () => {
    afterEach(() => {
      clearActiveLifecycleData();
    });

    it("should use active data when set", () => {
      const customData: FrameworkLifecycle[] = [
        {
          framework: ".NET",
          version: "99.0",
          displayName: ".NET 99",
          releaseDate: "2020-01-01",
          endOfLifeDate: "2099-01-01",
          isLts: true,
          status: LifecycleStatus.Supported,
        },
      ];
      setActiveLifecycleData(customData);
      const result = getAllLifecycleData();
      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe(".NET 99");
    });

    it("should fall back to defaults when cleared", () => {
      setActiveLifecycleData([]);
      clearActiveLifecycleData();
      const result = getAllLifecycleData();
      expect(result.length).toBeGreaterThan(10);
    });

    it("should affect getLifecycleForFramework lookups", () => {
      const customData: FrameworkLifecycle[] = [
        {
          framework: ".NET",
          version: "8.0",
          displayName: ".NET 8 Custom",
          releaseDate: "2023-11-14",
          endOfLifeDate: "2099-11-10",
          isLts: true,
          status: LifecycleStatus.Supported,
        },
      ];
      setActiveLifecycleData(customData);
      const result = getLifecycleForFramework("net8.0");
      expect(result.status).toBe(LifecycleStatus.Supported);
      expect(result.eolDate).toBe("2099-11-10");
    });
  });

  describe("getDefaultLifecycleData", () => {
    it("should return a copy of the default data", () => {
      const data1 = getDefaultLifecycleData();
      const data2 = getDefaultLifecycleData();
      expect(data1).not.toBe(data2);
      expect(data1).toEqual(data2);
      expect(data1.length).toBeGreaterThan(10);
    });
  });

  describe("parseTfm - single digit .NET Framework", () => {
    it("should parse net4 as .NET Framework 4.0", () => {
      const result = parseTfm("net4");
      expect(result).not.toBeNull();
      expect(result!.framework).toBe(".NET Framework");
      expect(result!.version).toBe("4.0");
      expect(result!.flavor).toBe(DotNetFlavor.DotNetFramework);
    });

    it("should parse net3 as .NET Framework 3.0", () => {
      const result = parseTfm("net3");
      expect(result).not.toBeNull();
      expect(result!.framework).toBe(".NET Framework");
      expect(result!.version).toBe("3.0");
    });

    it("should parse net45 as .NET Framework 4.5", () => {
      const result = parseTfm("net45");
      expect(result).not.toBeNull();
      expect(result!.version).toBe("4.5");
    });

    it("should parse net40 as .NET Framework 4.0", () => {
      const result = parseTfm("net40");
      expect(result).not.toBeNull();
      expect(result!.version).toBe("4.0");
    });

    it("should parse net35 as .NET Framework 3.5", () => {
      const result = parseTfm("net35");
      expect(result).not.toBeNull();
      expect(result!.version).toBe("3.5");
    });
  });

  describe("getFlavorFromTfm - unknown TFMs", () => {
    it("should return Unknown for unrecognized TFMs", () => {
      expect(getFlavorFromTfm("")).toBe(DotNetFlavor.Unknown);
      expect(getFlavorFromTfm("somethingweird")).toBe(DotNetFlavor.Unknown);
    });

    it("should return Xamarin for Xamarin TFMs", () => {
      expect(getFlavorFromTfm("monoandroid12.0")).toBe(DotNetFlavor.Xamarin);
      expect(getFlavorFromTfm("xamarin.ios")).toBe(DotNetFlavor.Xamarin);
    });

    it("should return Maui for MAUI platform TFMs", () => {
      expect(getFlavorFromTfm("net8.0-ios")).toBe(DotNetFlavor.Maui);
      expect(getFlavorFromTfm("net9.0-android")).toBe(DotNetFlavor.Maui);
    });
  });

  describe("getLifecycleForFramework - edge cases", () => {
    it("should return EOL with Unknown eolDate for unparseable TFMs", () => {
      const result = getLifecycleForFramework("garbage");
      expect(result.status).toBe(LifecycleStatus.EndOfLife);
      expect(result.eolDate).toBe("Unknown");
    });

    it("should return EOL for unknown version within a known framework", () => {
      const result = getLifecycleForFramework("net99.0");
      expect(result.status).toBe(LifecycleStatus.EndOfLife);
      expect(result.eolDate).toBe("Unknown");
    });

    it("should use custom lifecycle data when provided", () => {
      const custom: FrameworkLifecycle[] = [
        {
          framework: ".NET",
          version: "8.0",
          displayName: "Custom .NET 8",
          releaseDate: "2023-11-14",
          endOfLifeDate: "2099-12-31",
          isLts: true,
          status: LifecycleStatus.Supported,
        },
      ];
      const result = getLifecycleForFramework("net8.0", custom);
      expect(result.status).toBe(LifecycleStatus.Supported);
      expect(result.eolDate).toBe("2099-12-31");
    });

    it("should handle .NET Framework with OS lifecycle (empty EOL)", () => {
      const result = getLifecycleForFramework("net48");
      expect(result.eolDate).toBe("Supported with OS lifecycle");
    });
  });

  describe("computeStatus - expiring soon", () => {
    it("should return ExpiringSoon for entries within 6 months of EOL", () => {
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 3);
      const entry: FrameworkLifecycle = {
        framework: ".NET",
        version: "99.0",
        displayName: ".NET 99",
        releaseDate: "2020-01-01",
        endOfLifeDate: sixMonthsFromNow.toISOString().split("T")[0],
        isLts: false,
        status: LifecycleStatus.Supported,
      };
      expect(computeStatus(entry)).toBe(LifecycleStatus.ExpiringSoon);
    });

    it("should return Supported for entries more than 6 months from EOL", () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 2);
      const entry: FrameworkLifecycle = {
        framework: ".NET",
        version: "99.0",
        displayName: ".NET 99",
        releaseDate: "2020-01-01",
        endOfLifeDate: farFuture.toISOString().split("T")[0],
        isLts: true,
        status: LifecycleStatus.Supported,
      };
      expect(computeStatus(entry)).toBe(LifecycleStatus.Supported);
    });
  });

  describe("hasStaleLifecycleData", () => {
    const net = (releaseDate: string): FrameworkLifecycle => ({
      framework: ".NET",
      version: "10.0",
      displayName: ".NET 10",
      releaseDate,
      endOfLifeDate: "2028-11-14",
      isLts: true,
      status: LifecycleStatus.Supported,
    });

    it("is false while the newest .NET release is under 13 months old", () => {
      expect(hasStaleLifecycleData([net("2025-11-11")], new Date(2026, 10, 4))).toBe(false);
    });

    it("is true once the newest .NET release is over 13 months old", () => {
      expect(hasStaleLifecycleData([net("2025-11-11")], new Date(2026, 11, 12))).toBe(true);
    });

    it("ignores statuses that have drifted from the dates", () => {
      const drifted = { ...net("2025-11-11"), endOfLifeDate: "2026-12-01" };
      expect(hasStaleLifecycleData([drifted], new Date(2026, 10, 4))).toBe(false);
    });
  });

  describe("getLatestLts and getLatestModern", () => {
    it("should return .NET 10 as latest LTS", () => {
      expect(getLatestLts()).toBe(".NET 10");
    });

    it("should return .NET 10 as latest modern", () => {
      expect(getLatestModern()).toBe(".NET 10");
    });
  });

  describe("parseTfm - additional platform TFMs", () => {
    it("should parse net9.0-maccatalyst as MAUI", () => {
      const result = parseTfm("net9.0-maccatalyst");
      expect(result).not.toBeNull();
      expect(result!.flavor).toBe(DotNetFlavor.Maui);
      expect(result!.version).toBe("9.0");
    });

    it("should parse net8.0-windows as modern .NET, not MAUI (WPF and WinForms use it)", () => {
      const result = parseTfm("net8.0-windows");
      expect(result).toEqual({ framework: ".NET", version: "8.0", flavor: DotNetFlavor.DotNet });
    });

    it("should parse net8.0-tizen as MAUI", () => {
      const result = parseTfm("net8.0-tizen");
      expect(result).not.toBeNull();
      expect(result!.flavor).toBe(DotNetFlavor.Maui);
    });

    it("should parse xamarin.mac TFM", () => {
      const result = parseTfm("xamarin.mac");
      expect(result).not.toBeNull();
      expect(result!.flavor).toBe(DotNetFlavor.Xamarin);
      expect(result!.framework).toBe("Xamarin");
    });

    it("should parse net5.0 as modern .NET", () => {
      const result = parseTfm("net5.0");
      expect(result).not.toBeNull();
      expect(result!.framework).toBe(".NET");
      expect(result!.version).toBe("5.0");
    });

    it("should parse netcoreapp1.0", () => {
      const result = parseTfm("netcoreapp1.0");
      expect(result).not.toBeNull();
      expect(result!.framework).toBe(".NET Core");
      expect(result!.version).toBe("1.0");
    });
  });

  describe("computeStatus - calendar days", () => {
    const entry = (endOfLifeDate: string, releaseDate = "2020-01-01"): FrameworkLifecycle => ({
      framework: ".NET",
      version: "99.0",
      displayName: ".NET 99",
      releaseDate,
      endOfLifeDate,
      isLts: true,
      status: LifecycleStatus.Supported,
    });

    // Local constructors, so these hold in every time zone the suite runs in.
    it("treats the end-of-life date itself as the last supported day", () => {
      const lateOnEolDay = new Date(2026, 10, 10, 23, 59);
      expect(computeStatus(entry("2026-11-10"), lateOnEolDay)).toBe(LifecycleStatus.ExpiringSoon);
    });

    it("reports End of Life from the first minute of the following day", () => {
      const dayAfter = new Date(2026, 10, 11, 0, 1);
      expect(computeStatus(entry("2026-11-10"), dayAfter)).toBe(LifecycleStatus.EndOfLife);
    });

    it("does not report End of Life on the evening before the date", () => {
      // Parsed as UTC midnight, the date used to be "past" from 16:00 the day
      // before in UTC-8.
      const eveningBefore = new Date(2026, 10, 9, 20, 0);
      expect(computeStatus(entry("2026-11-10"), eveningBefore)).toBe(LifecycleStatus.ExpiringSoon);
    });

    it("clamps the six-month window at the end of a short month", () => {
      // 31 August + 6 months is 28 February, not 3 March.
      const endOfAugust = new Date(2026, 7, 31, 12, 0);
      expect(computeStatus(entry("2027-02-28"), endOfAugust)).toBe(LifecycleStatus.ExpiringSoon);
      expect(computeStatus(entry("2027-03-01"), endOfAugust)).toBe(LifecycleStatus.Supported);
    });

    it("treats the release date itself as released, not preview", () => {
      const releaseDay = new Date(2030, 0, 1, 0, 30);
      expect(computeStatus(entry("2033-01-01", "2030-01-01"), releaseDay)).toBe(
        LifecycleStatus.Supported
      );
      expect(computeStatus(entry("2033-01-01", "2030-01-02"), releaseDay)).toBe(
        LifecycleStatus.Preview
      );
    });
  });

  describe("built-in data", () => {
    it("has release dates on or before end-of-life dates", () => {
      for (const e of getDefaultLifecycleData()) {
        if (e.endOfLifeDate) {
          expect(e.releaseDate <= e.endOfLifeDate).toBe(true);
        }
      }
    });

    it("lists .NET 9 with its November 2024 release and November 2026 end of support", () => {
      const net9 = getDefaultLifecycleData().find(
        (e) => e.framework === ".NET" && e.version === "9.0"
      );
      expect(net9).toMatchObject({ releaseDate: "2024-11-12", endOfLifeDate: "2026-11-10" });
    });
  });

  describe("compareTargetFrameworks", () => {
    it("orders by framework generation, then by version", () => {
      const tfms = [
        "net8.0",
        "netunknown",
        "net472",
        "netcoreapp3.1",
        "net48",
        "netstandard2.0",
        "net10.0",
        "net6.0",
      ];
      expect([...tfms].sort(compareTargetFrameworks)).toEqual([
        "net472",
        "net48",
        "netstandard2.0",
        "netcoreapp3.1",
        "net6.0",
        "net8.0",
        "net10.0",
        "netunknown",
      ]);
    });

    it("is consistent in both directions", () => {
      expect(compareTargetFrameworks("net472", "net8.0")).toBeLessThan(0);
      expect(compareTargetFrameworks("net8.0", "net472")).toBeGreaterThan(0);
      expect(compareTargetFrameworks("net8.0", "net8.0")).toBe(0);
    });
  });
});
