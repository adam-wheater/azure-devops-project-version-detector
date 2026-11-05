import { FrameworkLifecycle, LifecycleStatus, DotNetFlavor } from "../models/types";
import { addMonths, parseIsoDate, startOfDay } from "../utils/dates";

const LIFECYCLE_DATA: FrameworkLifecycle[] = [
  // .NET (modern)
  {
    framework: ".NET",
    version: "10.0",
    displayName: ".NET 10",
    releaseDate: "2025-11-11",
    endOfLifeDate: "2028-11-14",
    isLts: true,
    status: LifecycleStatus.Supported,
  },
  {
    framework: ".NET",
    version: "9.0",
    displayName: ".NET 9",
    releaseDate: "2024-11-12",
    // STS support was extended from 18 to 24 months, so .NET 9 now ends on
    // the same day as .NET 8.
    endOfLifeDate: "2026-11-10",
    isLts: false,
    status: LifecycleStatus.ExpiringSoon,
  },
  {
    framework: ".NET",
    version: "8.0",
    displayName: ".NET 8",
    releaseDate: "2023-11-14",
    endOfLifeDate: "2026-11-10",
    isLts: true,
    status: LifecycleStatus.ExpiringSoon,
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
    framework: ".NET",
    version: "6.0",
    displayName: ".NET 6",
    releaseDate: "2021-11-08",
    endOfLifeDate: "2024-11-12",
    isLts: true,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET",
    version: "5.0",
    displayName: ".NET 5",
    releaseDate: "2020-11-10",
    endOfLifeDate: "2022-05-10",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },

  // .NET Core
  {
    framework: ".NET Core",
    version: "3.1",
    displayName: ".NET Core 3.1",
    releaseDate: "2019-12-03",
    endOfLifeDate: "2022-12-13",
    isLts: true,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Core",
    version: "3.0",
    displayName: ".NET Core 3.0",
    releaseDate: "2019-09-23",
    endOfLifeDate: "2020-03-03",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Core",
    version: "2.1",
    displayName: ".NET Core 2.1",
    releaseDate: "2018-05-30",
    endOfLifeDate: "2021-08-21",
    isLts: true,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Core",
    version: "2.0",
    displayName: ".NET Core 2.0",
    releaseDate: "2017-08-14",
    endOfLifeDate: "2018-10-01",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Core",
    version: "1.1",
    displayName: ".NET Core 1.1",
    releaseDate: "2016-11-16",
    endOfLifeDate: "2019-06-27",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Core",
    version: "1.0",
    displayName: ".NET Core 1.0",
    releaseDate: "2016-06-27",
    endOfLifeDate: "2019-06-27",
    isLts: true,
    status: LifecycleStatus.EndOfLife,
  },

  // .NET Framework
  {
    framework: ".NET Framework",
    version: "4.8.1",
    displayName: ".NET Framework 4.8.1",
    releaseDate: "2022-08-09",
    endOfLifeDate: "",
    isLts: false,
    status: LifecycleStatus.Supported,
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
  {
    framework: ".NET Framework",
    version: "4.7.2",
    displayName: ".NET Framework 4.7.2",
    releaseDate: "2018-04-30",
    endOfLifeDate: "",
    isLts: false,
    status: LifecycleStatus.Supported,
  },
  {
    framework: ".NET Framework",
    version: "4.7.1",
    displayName: ".NET Framework 4.7.1",
    releaseDate: "2017-10-17",
    endOfLifeDate: "",
    isLts: false,
    status: LifecycleStatus.Supported,
  },
  {
    framework: ".NET Framework",
    version: "4.7",
    displayName: ".NET Framework 4.7",
    releaseDate: "2017-04-11",
    endOfLifeDate: "",
    isLts: false,
    status: LifecycleStatus.Supported,
  },
  {
    framework: ".NET Framework",
    version: "4.6.2",
    displayName: ".NET Framework 4.6.2",
    releaseDate: "2016-08-02",
    endOfLifeDate: "2027-01-12",
    isLts: false,
    status: LifecycleStatus.Supported,
  },
  {
    framework: ".NET Framework",
    version: "4.6.1",
    displayName: ".NET Framework 4.6.1",
    releaseDate: "2015-11-30",
    endOfLifeDate: "2022-04-26",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Framework",
    version: "4.6",
    displayName: ".NET Framework 4.6",
    releaseDate: "2015-07-20",
    endOfLifeDate: "2022-04-26",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Framework",
    version: "4.5.2",
    displayName: ".NET Framework 4.5.2",
    releaseDate: "2014-05-05",
    endOfLifeDate: "2022-04-26",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Framework",
    version: "4.5.1",
    displayName: ".NET Framework 4.5.1",
    releaseDate: "2014-01-15",
    endOfLifeDate: "2016-01-12",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Framework",
    version: "4.5",
    displayName: ".NET Framework 4.5",
    releaseDate: "2012-08-15",
    endOfLifeDate: "2016-01-12",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Framework",
    version: "4.0",
    displayName: ".NET Framework 4.0",
    releaseDate: "2010-04-12",
    endOfLifeDate: "2016-01-12",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: ".NET Framework",
    version: "3.5",
    displayName: ".NET Framework 3.5 SP1",
    releaseDate: "2008-11-18",
    endOfLifeDate: "",
    isLts: false,
    status: LifecycleStatus.Supported,
  },

  // Xamarin
  {
    framework: "Xamarin",
    version: "5.0",
    displayName: "Xamarin.Forms 5.x",
    releaseDate: "2021-01-01",
    endOfLifeDate: "2024-05-01",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: "Xamarin",
    version: "4.0",
    displayName: "Xamarin.Forms 4.x",
    releaseDate: "2019-05-01",
    endOfLifeDate: "2024-05-01",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: "Xamarin.iOS",
    version: "16.0",
    displayName: "Xamarin.iOS",
    releaseDate: "2022-01-01",
    endOfLifeDate: "2024-05-01",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
  {
    framework: "Xamarin.Android",
    version: "13.0",
    displayName: "Xamarin.Android",
    releaseDate: "2022-01-01",
    endOfLifeDate: "2024-05-01",
    isLts: false,
    status: LifecycleStatus.EndOfLife,
  },
];

const LATEST_LTS = ".NET 10";
const LATEST_MODERN = ".NET 10";

let activeLifecycleData: FrameworkLifecycle[] | null = null;

export function setActiveLifecycleData(data: FrameworkLifecycle[]): void {
  activeLifecycleData = data;
}

export function clearActiveLifecycleData(): void {
  activeLifecycleData = null;
}

export function getDefaultLifecycleData(): FrameworkLifecycle[] {
  return [...LIFECYCLE_DATA];
}

export function getAllLifecycleData(
  lifecycleData?: FrameworkLifecycle[] | null
): FrameworkLifecycle[] {
  const source = lifecycleData ?? activeLifecycleData ?? LIFECYCLE_DATA;
  return source.map((entry) => ({
    ...entry,
    status: computeStatus(entry),
  }));
}

/**
 * Lifecycle verdict for an entry on the viewer's current calendar day.
 *
 * The end-of-life date is the last day of support: a version is End of Life
 * from the day after it, and Expiring Soon when that date falls within the
 * next six calendar months. Dates are compared as local calendar days (see
 * utils/dates.ts) so the verdict does not depend on the viewer's time zone.
 */
export function computeStatus(entry: FrameworkLifecycle, now: Date = new Date()): LifecycleStatus {
  if (!entry.endOfLifeDate) {
    return LifecycleStatus.Supported;
  }

  const today = startOfDay(now);
  const eol = parseIsoDate(entry.endOfLifeDate);

  if (eol) {
    if (eol < today) {
      return LifecycleStatus.EndOfLife;
    }
    if (eol <= addMonths(today, 6)) {
      return LifecycleStatus.ExpiringSoon;
    }
  }

  const release = parseIsoDate(entry.releaseDate);
  if (release && release > today) {
    return LifecycleStatus.Preview;
  }

  return LifecycleStatus.Supported;
}

export function getLifecycleForFramework(
  tfm: string,
  lifecycleData?: FrameworkLifecycle[] | null
): { status: LifecycleStatus; eolDate: string; latestLts: string } {
  const parsed = parseTfm(tfm);
  if (!parsed) {
    return {
      status: LifecycleStatus.EndOfLife,
      eolDate: "Unknown",
      latestLts: LATEST_LTS,
    };
  }

  const source = lifecycleData ?? activeLifecycleData ?? LIFECYCLE_DATA;
  const entry = source.find(
    (e) => e.framework === parsed.framework && e.version === parsed.version
  );

  if (!entry) {
    if (parsed.framework === ".NET Standard") {
      return {
        status: LifecycleStatus.Supported,
        eolDate: "N/A (.NET Standard)",
        latestLts: LATEST_LTS,
      };
    }
    return {
      status: LifecycleStatus.EndOfLife,
      eolDate: "Unknown",
      latestLts: LATEST_LTS,
    };
  }

  const status = computeStatus(entry);
  let latestLts = LATEST_LTS;
  if (parsed.framework === ".NET Framework") {
    latestLts = ".NET Framework 4.8.1";
  } else if (
    parsed.framework === "Xamarin" ||
    parsed.framework === "Xamarin.Android" ||
    parsed.framework === "Xamarin.iOS" ||
    parsed.flavor === DotNetFlavor.Xamarin
  ) {
    latestLts = `.NET MAUI (${LATEST_LTS})`;
  }

  return {
    status,
    eolDate: entry.endOfLifeDate || "Supported with OS lifecycle",
    latestLts,
  };
}

/**
 * Orders target framework monikers oldest generation first: Xamarin, then
 * .NET Framework, .NET Standard, .NET Core and modern .NET, each by version
 * (so net472 sorts as 4.7.2, below net48, and both below net8.0).
 * Unrecognised monikers sort last; ties fall back to the moniker text so the
 * order is total.
 */
export function compareTargetFrameworks(a: string, b: string): number {
  const aKey = tfmSortKey(a);
  const bKey = tfmSortKey(b);
  if (aKey && !bKey) return -1;
  if (!aKey && bKey) return 1;
  if (aKey && bKey) {
    const len = Math.max(aKey.length, bKey.length);
    for (let i = 0; i < len; i++) {
      const diff = (aKey[i] ?? 0) - (bKey[i] ?? 0);
      if (diff !== 0) return diff;
    }
  }
  return a.localeCompare(b);
}

const FRAMEWORK_GENERATION: Record<string, number> = {
  Xamarin: 0,
  "Xamarin.Android": 0,
  "Xamarin.iOS": 0,
  ".NET Framework": 1,
  ".NET Standard": 2,
  ".NET Core": 3,
  ".NET": 4,
};

function tfmSortKey(tfm: string): number[] | null {
  const parsed = parseTfm(tfm);
  if (!parsed || !/^\d+(\.\d+)*$/.test(parsed.version)) return null;
  const generation = FRAMEWORK_GENERATION[parsed.framework] ?? 5;
  return [generation, ...parsed.version.split(".").map(Number)];
}

export function getLatestLts(): string {
  return LATEST_LTS;
}

export function getLatestModern(): string {
  return LATEST_MODERN;
}

/**
 * Returns true when the built-in data has probably missed a release. A new
 * major .NET ships every November, so if the newest one listed came out more
 * than 13 months ago, a newer version exists that the data does not know.
 * Statuses are not compared: they are computed from the dates, so a version
 * moving to Expiring Soon or End of Life does not make the data wrong.
 */
export function hasStaleLifecycleData(data: FrameworkLifecycle[], now: Date = new Date()): boolean {
  const releases = data
    .filter((entry) => entry.framework === ".NET")
    .map((entry) => parseIsoDate(entry.releaseDate))
    .filter((date): date is Date => date !== null);
  if (releases.length === 0) return false;
  const newest = new Date(Math.max(...releases.map((date) => date.getTime())));
  return addMonths(newest, 13) < startOfDay(now);
}

interface ParsedTfm {
  framework: string;
  version: string;
  flavor: DotNetFlavor;
}

export function parseTfm(tfm: string): ParsedTfm | null {
  if (!tfm) return null;
  const t = tfm.trim().toLowerCase();

  // MAUI targets like net8.0-android, net8.0-ios, net8.0-maccatalyst
  // Must be checked BEFORE modern .NET since net8.0-android also matches net8.0 pattern
  // "-windows" is deliberately not here: WPF and WinForms on modern .NET target
  // net8.0-windows too, and were all reported as MAUI. A MAUI app is still
  // recognised by MauiDetector from <UseMaui> or its mobile targets.
  const mauiMatch = t.match(/^net(\d+)\.(\d+)-(android|ios|maccatalyst|tizen)/);
  if (mauiMatch) {
    return {
      framework: ".NET",
      version: `${mauiMatch[1]}.${mauiMatch[2]}`,
      flavor: DotNetFlavor.Maui,
    };
  }

  // Xamarin TFMs - check before modern .NET
  if (t.startsWith("monoandroid") || t.startsWith("xamarin.android")) {
    return { framework: "Xamarin.Android", version: "13.0", flavor: DotNetFlavor.Xamarin };
  }
  if (t.startsWith("xamarin.ios") || t.startsWith("xamarinios")) {
    return { framework: "Xamarin.iOS", version: "16.0", flavor: DotNetFlavor.Xamarin };
  }
  if (t.startsWith("xamarin.mac")) {
    return { framework: "Xamarin", version: "5.0", flavor: DotNetFlavor.Xamarin };
  }

  // net8.0, net9.0, net7.0, net6.0, net5.0
  const modernMatch = t.match(/^net(\d+)\.(\d+)(-.*)?$/);
  if (modernMatch) {
    const major = modernMatch[1];
    const minor = modernMatch[2];
    const version = `${major}.${minor}`;
    if (parseInt(major) >= 5) {
      return { framework: ".NET", version, flavor: DotNetFlavor.DotNet };
    }
  }

  // netcoreapp3.1, netcoreapp3.0, netcoreapp2.1
  const coreMatch = t.match(/^netcoreapp(\d+)\.(\d+)$/);
  if (coreMatch) {
    return {
      framework: ".NET Core",
      version: `${coreMatch[1]}.${coreMatch[2]}`,
      flavor: DotNetFlavor.DotNetCore,
    };
  }

  // net48, net481, net472, net471, net47, net462, net461, net46, net452, net451, net45, net40, net35
  // Also handle single-digit like net4 (no minor version)
  const fwMatch = t.match(/^net(\d)(\d)?(\d)?$/);
  if (fwMatch) {
    const parts = [fwMatch[1]];
    if (fwMatch[2]) parts.push(fwMatch[2]);
    else parts.push("0"); // net4 -> 4.0
    if (fwMatch[3]) parts.push(fwMatch[3]);
    const version = parts.join(".");
    return {
      framework: ".NET Framework",
      version,
      flavor: DotNetFlavor.DotNetFramework,
    };
  }

  // netstandard2.0, netstandard2.1
  const stdMatch = t.match(/^netstandard(\d+)\.(\d+)$/);
  if (stdMatch) {
    return {
      framework: ".NET Standard",
      version: `${stdMatch[1]}.${stdMatch[2]}`,
      flavor: DotNetFlavor.DotNetStandard,
    };
  }

  return null;
}

export function getFlavorFromTfm(tfm: string): DotNetFlavor {
  const parsed = parseTfm(tfm);
  if (!parsed) {
    return DotNetFlavor.Unknown;
  }
  return parsed.flavor;
}
