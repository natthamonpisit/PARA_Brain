import thailandPulseHandler from './thailand-pulse.js';

export default async function handler(req: any, res: any) {
  return thailandPulseHandler(req, res);
}
