import { GoogleGenAI, Type } from '@google/genai';
import { finalizeApiObservation, startApiObservation } from './_lib/observability.js';

const normalizeType = (value: unknown) => {
  const candidate = String(value || '').toUpperCase();
  if (candidate === 'INCOME' || candidate === 'TRANSFER') return candidate;
  return 'EXPENSE';
};

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/finance-classify', { source: 'FINANCE' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return respond(500, { error: 'Missing GEMINI_API_KEY' }, { reason: 'missing_env' });
    }

    const ocrTextRaw = String(req.body?.ocrText || '');
    const qrRaw = String(req.body?.qrRaw || '');
    const hint = req.body?.hint || {};

    const ocrText = ocrTextRaw.slice(0, 5000);
    if (!ocrText && !qrRaw) {
      return respond(400, { error: 'ocrText or qrRaw is required' }, { reason: 'missing_input' });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      'You extract finance transaction from OCR/QR text.',
      'Return strict JSON only.',
      'If data is uncertain, keep confidence low and preserve hint values.',
      '',
      `OCR Text:\n${ocrText || '(empty)'}`,
      '',
      `QR Raw:\n${qrRaw || '(empty)'}`,
      '',
      `Hint JSON:\n${JSON.stringify(hint || {})}`,
      '',
      'Output schema:',
      '- amount: number or null',
      '- type: INCOME | EXPENSE | TRANSFER',
      '- description: short text',
      '- category: short text',
      '- transactionDate: ISO datetime if known else empty string',
      '- confidence: 0..1'
    ].join('\n');

    const response = await ai.models.generateContent({
      model: process.env.AGENT_MODEL || 'gemini-2.0-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            amount: { type: Type.NUMBER, nullable: true },
            type: { type: Type.STRING, enum: ['INCOME', 'EXPENSE', 'TRANSFER'] },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            transactionDate: { type: Type.STRING, nullable: true },
            confidence: { type: Type.NUMBER }
          },
          required: ['type', 'description', 'category', 'confidence']
        }
      }
    });

    let parsed: any = {};
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch {
      parsed = {};
    }

    const suggestion = {
      amount: Number.isFinite(Number(parsed?.amount)) ? Number(parsed.amount) : null,
      type: normalizeType(parsed?.type),
      description: String(parsed?.description || hint?.description || 'Receipt/Slip').trim(),
      category: String(parsed?.category || hint?.category || 'General').trim(),
      transactionDate: String(parsed?.transactionDate || hint?.transactionDate || '').trim(),
      confidence: Math.max(0, Math.min(1, Number(parsed?.confidence || hint?.confidence || 0.5)))
    };

    return respond(200, { success: true, suggestion }, {
      confidence: suggestion.confidence,
      hasAmount: suggestion.amount !== null
    });
  } catch (error: any) {
    return respond(500, { error: error?.message || 'Internal error' }, { reason: 'exception' });
  }
}
