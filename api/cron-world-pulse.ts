import thailandPulseCronHandler from './cron-thailand-pulse.js';

export default async function handler(req: any, res: any) {
  return thailandPulseCronHandler(req, res);
}
