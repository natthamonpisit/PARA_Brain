/**
 * Shared API authentication guard.
 * Every public-facing endpoint MUST call requireAuth() before processing.
 *
 * Usage:
 *   const auth = requireAuth(req, [process.env.CAPTURE_API_SECRET, process.env.CRON_SECRET]);
 *   if (!auth.ok) return res.status(auth.status).json(auth.body);
 */

export interface AuthResult {
  ok: boolean;
  status: number;
  body: { error: string };
}

/**
 * Extract the API key from any of the standard locations in a request.
 */
function extractKey(req: any): string {
  return (
    req.headers?.['x-api-key'] ||
    req.headers?.['x-capture-key'] ||
    req.headers?.['x-cron-key'] ||
    req.headers?.['x-agent-key'] ||
    req.headers?.authorization?.replace('Bearer ', '') ||
    req.query?.key ||
    ''
  );
}

/**
 * Require that the request carries a valid API key matching at least one
 * of the provided secrets.
 *
 * - If NO secrets are configured (all empty/undefined) → 503
 * - If key doesn't match any configured secret → 401
 * - Otherwise → { ok: true, status: 200 }
 */
export function requireAuth(req: any, secrets: (string | undefined)[]): AuthResult {
  const configured = secrets.filter((s): s is string => !!s);
  if (configured.length === 0) {
    return {
      ok: false,
      status: 503,
      body: { error: 'Server auth not configured — set required secret env vars' }
    };
  }

  const key = extractKey(req);
  if (!key || !configured.includes(key)) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }

  return { ok: true, status: 200, body: { error: '' } };
}
