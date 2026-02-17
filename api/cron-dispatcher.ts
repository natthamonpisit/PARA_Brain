import { checkAndSendReminders } from './cron-reminders.js';
import { finalizeApiObservation, startApiObservation } from './_lib/observability.js';

const PULSE_UTC_HOURS = [0, 12];

async function runThailandPulse(cronSecret: string): Promise<any> {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/cron-thailand-pulse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-key': cronSecret
    }
  });
  return res.json().catch(() => ({ status: res.status }));
}

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/cron-dispatcher', { source: 'CRON' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  const cronSecret = process.env.CRON_SECRET || '';
  const providedKey =
    req.query?.key ||
    req.headers?.['x-cron-key'] ||
    req.headers?.authorization?.replace('Bearer ', '');
  if (cronSecret && providedKey !== cronSecret) {
    return respond(401, { error: 'Unauthorized' }, { reason: 'auth_failed' });
  }

  const results: Record<string, any> = {};

  // --- Always: check and send reminders ---
  try {
    results.reminders = await checkAndSendReminders();
  } catch (error: any) {
    results.reminders = { success: false, error: error.message };
  }

  // --- Conditional: Thailand Pulse at original 12h cadence ---
  const currentHourUtc = new Date().getUTCHours();
  if (PULSE_UTC_HOURS.includes(currentHourUtc)) {
    try {
      results.thailandPulse = await runThailandPulse(cronSecret);
    } catch (error: any) {
      results.thailandPulse = { error: error.message };
    }
  } else {
    results.thailandPulse = { skipped: true, reason: `Not pulse hour (UTC ${currentHourUtc})` };
  }

  return respond(200, {
    success: true,
    timestamp: new Date().toISOString(),
    dispatched: results
  }, {
    reminderResult: results.reminders?.success ?? false,
    pulseRan: PULSE_UTC_HOURS.includes(currentHourUtc)
  });
}
