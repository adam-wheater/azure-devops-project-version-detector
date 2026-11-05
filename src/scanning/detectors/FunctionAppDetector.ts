import { DetectedProject, FunctionAppModel } from "../../models/types";
import { FUNCTION_APP_PACKAGES_ISOLATED, FUNCTION_APP_PACKAGES_INPROCESS } from "../Constants";
import { extractNuGetPackageReferences } from "./DotNetVersionDetector";

export interface FunctionAppInfo {
  model: FunctionAppModel;
  runtimeVersion: string;
}

export function detectFunctionAppModel(projectContent: string): FunctionAppInfo | null {
  const packageNames = extractNuGetPackageReferences(projectContent).map((p) =>
    p.name.toLowerCase()
  );

  const isIsolated = FUNCTION_APP_PACKAGES_ISOLATED.some((pkg) =>
    packageNames.includes(pkg.toLowerCase())
  );

  const isInProcess = FUNCTION_APP_PACKAGES_INPROCESS.some((pkg) =>
    packageNames.includes(pkg.toLowerCase())
  );

  if (!isIsolated && !isInProcess) {
    return null;
  }

  const model = isIsolated ? FunctionAppModel.Isolated : FunctionAppModel.InProcess;
  const runtimeVersion = detectRuntimeVersion(projectContent, isIsolated);

  return { model, runtimeVersion };
}

function detectRuntimeVersion(content: string, isIsolated: boolean): string {
  // Check for AzureFunctionsVersion property
  const funcVersionMatch = content.match(
    /<AzureFunctionsVersion>\s*([^<]+)\s*<\/AzureFunctionsVersion>/i
  );
  if (funcVersionMatch) {
    return funcVersionMatch[1].trim();
  }

  // Infer from target framework
  const tfmMatch = content.match(/<TargetFramework>\s*([^<]+)\s*<\/TargetFramework>/i);
  if (tfmMatch) {
    const tfm = tfmMatch[1].trim().toLowerCase();
    // Any modern .NET major, not a hand-kept list: the list stopped at 9, so
    // a .NET 10 function app was reported only as "v4 (Isolated)".
    const modern = tfm.match(/^net(\d+)\.\d+/);
    if (modern && Number(modern[1]) >= 5) return `v4 (.NET ${modern[1]})`;
    if (/^net4\d*$/.test(tfm)) return "v4 (.NET Framework)";
  }

  return isIsolated ? "v4 (Isolated)" : "v4 (In-Process)";
}

export function parseHostJson(content: string): {
  extensionBundleVersion?: string;
  runtime?: string;
} {
  try {
    const json = JSON.parse(content);
    const bundleVersion = json?.extensionBundle?.version;
    const runtime = json?.version;
    return {
      extensionBundleVersion: bundleVersion,
      runtime: runtime || "2.0",
    };
  } catch {
    return {};
  }
}

export function enrichProjectWithFunctionInfo(
  project: DetectedProject,
  projectContent: string,
  hostJsonContent?: string
): DetectedProject {
  const funcInfo = detectFunctionAppModel(projectContent);
  if (!funcInfo) return project;

  let runtimeVersion = funcInfo.runtimeVersion;
  if (hostJsonContent) {
    const hostInfo = parseHostJson(hostJsonContent);
    if (hostInfo.runtime) {
      runtimeVersion = `v${hostInfo.runtime} runtime - ${runtimeVersion}`;
    }
  }

  return {
    ...project,
    functionAppModel: funcInfo.model,
    functionRuntimeVersion: runtimeVersion,
  };
}
