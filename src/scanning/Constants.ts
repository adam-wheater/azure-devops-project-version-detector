export const PROJECT_FILE_PATTERNS: RegExp[] = [/\.csproj$/i, /\.fsproj$/i, /\.vbproj$/i];

export const CONFIG_FILE_PATTERNS: RegExp[] = [
  /global\.json$/i,
  /Directory\.Build\.props$/i,
  /Directory\.Packages\.props$/i,
  /nuget\.config$/i,
  /packages\.config$/i,
];

export const FUNCTION_APP_PATTERNS: RegExp[] = [/host\.json$/i, /local\.settings\.json$/i];

// Dockerfile, Dockerfile.dev, api.Dockerfile, etc. — anywhere in the repo.
export const DOCKERFILE_PATTERN = /(^|\/)((.+\.)?dockerfile(\.[\w.-]+)?)$/i;

export const COMPOSE_FILE_PATTERN = /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/i;

// Kubernetes manifests / Helm charts living in conventional folders.
export const KUBERNETES_PATH_PATTERN = /\/(k8s|kubernetes|charts|helm|manifests)\/.*\.ya?ml$/i;

// A .cs file inside a Controllers folder — the classic ASP.NET (Core) API shape.
export const CONTROLLER_FILE_PATTERN = /\/controllers\/[^/]+\.cs$/i;

export const RAZOR_FILE_PATTERN = /\.razor$/i;

export const PIPELINE_FILE_PATTERNS: RegExp[] = [
  /azure-pipelines\.ya?ml$/i,
  /\.azure-pipelines[/\\].*\.ya?ml$/i,
  /pipelines[/\\].*\.ya?ml$/i,
  /\.pipelines[/\\].*\.ya?ml$/i,
  /build\.ya?ml$/i,
  /deploy\.ya?ml$/i,
  /stage\.ya?ml$/i,
  /infrastructure\.ya?ml$/i,
  /release\.ya?ml$/i,
  /ci\.ya?ml$/i,
  /cd\.ya?ml$/i,
];

export const XAMARIN_INDICATORS: string[] = [
  "Xamarin.Forms",
  "Xamarin.Essentials",
  "Xamarin.iOS",
  "Xamarin.Android",
  "Xamarin.Mac",
];

export const MAUI_INDICATORS: string[] = [
  "Microsoft.Maui",
  "UseMaui",
  "<UseMaui>true</UseMaui>",
  "net8.0-android",
  "net8.0-ios",
  "net9.0-android",
  "net9.0-ios",
  "net8.0-maccatalyst",
  "net9.0-maccatalyst",
];

export const FUNCTION_APP_PACKAGES_ISOLATED: string[] = [
  "Microsoft.Azure.Functions.Worker",
  "Microsoft.Azure.Functions.Worker.Sdk",
  "Microsoft.Azure.Functions.Worker.Extensions.Http.AspNetCore",
];

export const FUNCTION_APP_PACKAGES_INPROCESS: string[] = ["Microsoft.NET.Sdk.Functions"];

export const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
// Requests that hit throttling (429) or gateway errors now retry with
// backoff (see retryWithBackoff), so concurrency can run higher than before
// without a single rate-limited request failing an entire repo scan.
export const REPO_CONCURRENCY = 8;
export const FILE_CONCURRENCY = 20;
