import jsQR from 'jsqr';
import type { TransactionType } from '../types';

export interface FinanceDraftSuggestion {
  description: string;
  amount: number | null;
  type: TransactionType;
  category: string;
  transactionDate: string;
  confidence: number;
}

export interface FinanceIntakeResult {
  suggestion: FinanceDraftSuggestion;
  qrRaw: string | null;
  ocrText: string;
  parseSource: 'QR' | 'OCR' | 'QR+OCR' | 'AI_FALLBACK';
  reasons: string[];
}

const DEFAULT_CATEGORY = 'General';

const normalizeSpace = (value: string) => value.replace(/\s+/g, ' ').trim();

const toFloat = (value: string): number | null => {
  const normalized = String(value || '').replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const decodeTlv = (payload: string) => {
  const rows: Array<{ tag: string; value: string }> = [];
  let cursor = 0;
  while (cursor + 4 <= payload.length) {
    const tag = payload.slice(cursor, cursor + 2);
    const len = Number.parseInt(payload.slice(cursor + 2, cursor + 4), 10);
    if (!Number.isFinite(len) || len < 0) break;
    cursor += 4;
    if (cursor + len > payload.length) break;
    const value = payload.slice(cursor, cursor + len);
    rows.push({ tag, value });
    cursor += len;
  }
  return rows;
};

const parseDateToIso = (input: string) => {
  const cleaned = String(input || '').trim();
  if (!cleaned) return '';

  const dmy = cleaned.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const dt = new Date(year, month - 1, day);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }

  const ymd = cleaned.match(/\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const dt = new Date(year, month - 1, day);
      if (!Number.isNaN(dt.getTime())) return dt.toISOString();
    }
  }
  return '';
};

const inferCategory = (description: string, text: string, type: TransactionType): string => {
  if (type === 'INCOME') {
    if (/(salary|payroll|เงินเดือน)/i.test(`${description} ${text}`)) return 'Salary';
    if (/(interest|dividend|ปันผล)/i.test(`${description} ${text}`)) return 'Investment';
    return 'Income';
  }

  const value = `${description} ${text}`.toLowerCase();
  if (/(cafe|coffee|restaurant|อาหาร|ชา|กาแฟ|starbucks|grabfood|foodpanda|kfc|mcdonald)/i.test(value)) return 'Food';
  if (/(grab|taxi|bts|mrt|fuel|gas|น้ำมัน|ทางด่วน|parking|ที่จอด)/i.test(value)) return 'Transport';
  if (/(electric|water|internet|mobile|ไฟฟ้า|ประปา|โทรศัพท์|wifi)/i.test(value)) return 'Utilities';
  if (/(shopee|lazada|mall|shopping|central|lotus|big c|tops|ซื้อของ)/i.test(value)) return 'Shopping';
  if (/(rent|เช่า|ผ่อนบ้าน|mortgage)/i.test(value)) return 'Housing';
  if (/(hospital|clinic|medicine|สุขภาพ|ยา|doctor)/i.test(value)) return 'Health';
  if (/(stock|crypto|fund|ลงทุน|ซื้อหุ้น|กองทุน)/i.test(value)) return 'Investment';
  return DEFAULT_CATEGORY;
};

const inferType = (text: string, hasQr: boolean): TransactionType => {
  const value = text.toLowerCase();
  const incomeHit = /(received|incoming|deposit|credited|รับเงิน|เงินเข้า|โอนเข้า|รับโอน|รับชำระ)/i.test(value);
  const expenseHit = /(payment|paid|debit|purchase|withdraw|จ่าย|โอนออก|ชำระเงิน|ตัดบัตร|ซื้อ)/i.test(value);
  if (incomeHit && !expenseHit) return 'INCOME';
  if (expenseHit && !incomeHit) return 'EXPENSE';
  return hasQr ? 'EXPENSE' : 'EXPENSE';
};

const pickAmountFromText = (text: string): number | null => {
  const candidates: Array<{ amount: number; score: number }> = [];
  const patterns: Array<{ regex: RegExp; score: number }> = [
    { regex: /(total|amount|ยอด(?:รวม|สุทธิ|เงิน)?|จำนวนเงิน|สุทธิ)\s*[:฿]?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi, score: 3 },
    { regex: /(?:฿|thb)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi, score: 2 },
    { regex: /\b([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?)\b/g, score: 1.5 },
    { regex: /\b([0-9]{2,7}(?:\.[0-9]{1,2})?)\b/g, score: 1 }
  ];

  patterns.forEach(({ regex, score }) => {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const numberGroup = match[2] || match[1];
      const amount = toFloat(numberGroup);
      if (!amount) continue;
      if (amount > 5_000_000) continue;
      candidates.push({ amount, score });
    }
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.score - a.score) || (b.amount - a.amount));
  return candidates[0].amount;
};

const pickDescriptionFromText = (text: string): string => {
  const lines = String(text || '')
    .split('\n')
    .map((line) => normalizeSpace(line))
    .filter(Boolean)
    .filter((line) => line.length >= 3)
    .filter((line) => !/(receipt|slip|transaction|promptpay|thank you|total|amount|vat|tax invoice)/i.test(line))
    .filter((line) => !/^\d[\d\s:\/\-.]+$/.test(line));
  return lines[0] || 'Receipt/Slip';
};

const imageDataFromFile = async (file: File): Promise<ImageData> => {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas context unavailable');
  }
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return imageData;
};

const detectQrRaw = async (file: File): Promise<string | null> => {
  const detectorCtor = (window as any)?.BarcodeDetector;
  if (detectorCtor) {
    try {
      const detector = new detectorCtor({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      bitmap.close();
      const rawValue = results?.[0]?.rawValue;
      if (rawValue) return String(rawValue).trim();
    } catch {
      // fall through to jsQR
    }
  }

  try {
    const imageData = await imageDataFromFile(file);
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if (result?.data) return String(result.data).trim();
  } catch {
    return null;
  }
  return null;
};

const parseQrPayload = (raw: string): Partial<FinanceDraftSuggestion> => {
  const normalized = String(raw || '').trim();
  if (!normalized) return {};

  const tlvRows = decodeTlv(normalized);
  if (tlvRows.length > 0) {
    const amount = toFloat(tlvRows.find((row) => row.tag === '54')?.value || '');
    const merchant = normalizeSpace(tlvRows.find((row) => row.tag === '59')?.value || '');
    const txDate = parseDateToIso(normalized);
    const description = merchant || 'QR Payment';
    return {
      amount: amount ?? null,
      description,
      type: 'EXPENSE',
      category: inferCategory(description, normalized, 'EXPENSE'),
      transactionDate: txDate || new Date().toISOString(),
      confidence: amount ? 0.88 : 0.7
    };
  }

  const amount = pickAmountFromText(normalized);
  const description = 'QR Payment';
  return {
    amount,
    description,
    type: 'EXPENSE',
    category: inferCategory(description, normalized, 'EXPENSE'),
    transactionDate: new Date().toISOString(),
    confidence: amount ? 0.72 : 0.55
  };
};

const runOcr = async (file: File): Promise<string> => {
  try {
    const mod: any = await import('tesseract.js');
    const recognize = mod?.recognize || mod?.default?.recognize;
    if (typeof recognize !== 'function') return '';
    const result = await recognize(file, 'eng+tha', {
      logger: () => undefined
    });
    return normalizeSpace(String(result?.data?.text || ''));
  } catch {
    return '';
  }
};

export const parseFinanceDocument = async (file: File): Promise<FinanceIntakeResult> => {
  const reasons: string[] = [];
  const qrRaw = await detectQrRaw(file);
  const qrCandidate = qrRaw ? parseQrPayload(qrRaw) : {};

  if (qrRaw) reasons.push('Detected QR payload from document.');

  // Run OCR even if QR exists to enrich description/date/category.
  const ocrText = await runOcr(file);
  if (ocrText) reasons.push('OCR extracted receipt text.');

  const amountFromOcr = ocrText ? pickAmountFromText(ocrText) : null;
  const descriptionFromOcr = ocrText ? pickDescriptionFromText(ocrText) : '';
  const typeFromOcr = inferType(`${ocrText} ${qrRaw || ''}`, Boolean(qrRaw));
  const dateFromOcr = ocrText ? parseDateToIso(ocrText) : '';

  const amount = qrCandidate.amount ?? amountFromOcr ?? null;
  const description = normalizeSpace(String(qrCandidate.description || descriptionFromOcr || 'Receipt/Slip'));
  const type = (qrCandidate.type || typeFromOcr || 'EXPENSE') as TransactionType;
  const transactionDate = qrCandidate.transactionDate || dateFromOcr || new Date().toISOString();
  const category = qrCandidate.category || inferCategory(description, `${ocrText} ${qrRaw || ''}`, type);

  let confidence = 0.35;
  if (qrRaw) confidence += 0.22;
  if (ocrText) confidence += 0.16;
  if (amount) confidence += 0.2;
  if (description && description !== 'Receipt/Slip') confidence += 0.1;
  if (category !== DEFAULT_CATEGORY) confidence += 0.08;
  confidence = clamp01(confidence);

  const parseSource = qrRaw && ocrText ? 'QR+OCR' : qrRaw ? 'QR' : 'OCR';

  return {
    suggestion: {
      description,
      amount,
      type,
      category,
      transactionDate,
      confidence
    },
    qrRaw,
    ocrText,
    parseSource,
    reasons
  };
};

export const classifyFinanceDocumentWithAi = async (payload: {
  ocrText: string;
  qrRaw: string | null;
  hint: FinanceDraftSuggestion;
}): Promise<FinanceDraftSuggestion | null> => {
  const captureKey = (() => {
    try { return String((import.meta as any)?.env?.VITE_CAPTURE_API_SECRET || '').trim(); }
    catch { return ''; }
  })();
  const response = await fetch('/api/finance-classify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-capture-key': captureKey
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => ({}));
  const candidate = body?.suggestion;
  if (!candidate || typeof candidate !== 'object') return null;

  const amount = candidate.amount === null ? null : toFloat(String(candidate.amount));
  const type = ['INCOME', 'EXPENSE', 'TRANSFER'].includes(String(candidate.type))
    ? (candidate.type as TransactionType)
    : 'EXPENSE';

  return {
    description: normalizeSpace(String(candidate.description || payload.hint.description || 'Receipt/Slip')),
    amount,
    type,
    category: normalizeSpace(String(candidate.category || payload.hint.category || DEFAULT_CATEGORY)),
    transactionDate: parseDateToIso(String(candidate.transactionDate || '')) || payload.hint.transactionDate,
    confidence: clamp01(Number(candidate.confidence || payload.hint.confidence || 0.5))
  };
};
