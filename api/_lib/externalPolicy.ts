const DEFAULT_TIMEOUT_MS = Number(process.env.EXTERNAL_API_TIMEOUT_MS || 15000);
const DEFAULT_RETRIES = Number(process.env.EXTERNAL_API_RETRY_COUNT || 2);
const DEFAULT_BASE_DELAY_MS = Number(process.env.EXTERNAL_API_RETRY_BASE_DELAY_MS || 400);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

const shouldRetryError = (error: unknown): boolean => {
  const e = error as any;
  if (!e) return false;
  if (e.name === 'AbortError') return true;
  const status = Number(e?.status || e?.statusCode || e?.response?.status);
  return Number.isFinite(status) ? isRetryableStatus(status) : false;
};

export async function fetchWithTimeoutRetry(
  input: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (isRetryableStatus(response.status) && attempt < retries) {
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt >= retries || !shouldRetryError(error)) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('External request failed');
}

export async function runWithRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; isRetryable?: (error: unknown) => boolean } = {}
): Promise<T> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const isRetryable = opts.isRetryable ?? shouldRetryError;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryable(error)) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('External request failed');
}
