import { GitRestClient } from "azure-devops-extension-api/Git";
import { ConcurrencyLimiter } from "../utils/ConcurrencyLimiter";
import { retryWithBackoff } from "../utils/retryWithBackoff";
import { FileContent } from "../models/types";
import { FILE_CONCURRENCY, MAX_FILE_SIZE } from "./Constants";

export async function fetchFileContents(
  gitClient: GitRestClient,
  repoId: string,
  paths: string[],
  limiter?: ConcurrencyLimiter,
  signal?: AbortSignal
): Promise<FileContent[]> {
  const fileLimiter = limiter ?? new ConcurrencyLimiter(FILE_CONCURRENCY);
  const results = await Promise.all(
    paths.map((path) =>
      fileLimiter.run(async () => {
        if (signal?.aborted) return null;
        try {
          const item = await retryWithBackoff(() => gitClient.getItemContent(repoId, path), {
            signal,
          });
          const text = await streamToString(item);
          if (text.length > MAX_FILE_SIZE) {
            return null;
          }
          return { path, content: text } as FileContent;
        } catch {
          return null;
        }
      })
    )
  );

  return results.filter((r): r is FileContent => r !== null);
}

async function streamToString(stream: ReadableStream<Uint8Array> | ArrayBuffer): Promise<string> {
  if (stream instanceof ArrayBuffer) {
    return new TextDecoder().decode(stream);
  }

  const reader = (stream as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let done = false;

  while (!done) {
    const result = await reader.read();
    done = result.done;
    if (result.value) {
      chunks.push(result.value);
    }
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(merged);
}
