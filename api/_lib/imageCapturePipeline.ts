import { GoogleGenAI, Type } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { CapturePipelineResult, CaptureSource, runCapturePipeline } from './capturePipeline.js';

interface ImageAnalysisResult {
  isFinanceDocument: boolean;
  transactionType: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'UNKNOWN';
  amount: number | null;
  currency: string;
  merchant: string;
  description: string;
  category: string;
  transactionDate: string;
  summary: string;
  ocrText: string;
  confidence: number;
}

interface ProcessImageCaptureInput {
  supabase: any;
  source: CaptureSource;
  geminiApiKey: string;
  imageBase64: string;
  mimeType: string;
  caption?: string;
  timezone?: string;
  excludeLogId?: string;
  imageMeta?: Record<string, any>;
}

interface FetchTelegramPhotoInput {
  botToken: string;
  fileId: string;
}

export interface TelegramPhotoData {
  imageBase64: string;
  mimeType: string;
  filePath: string;
  byteLength: number;
}

const CAPTURE_IMAGE_MODEL = process.env.CAPTURE_IMAGE_MODEL || process.env.AGENT_MODEL || 'gemini-2.0-flash';
const CAPTURE_IMAGE_MAX_BYTES = Number(process.env.CAPTURE_IMAGE_MAX_BYTES || 2_500_000);
const IMAGE_FINANCE_CONFIDENCE_THRESHOLD = Number(process.env.IMAGE_FINANCE_CONFIDENCE_THRESHOLD || 0.55);
const DEFAULT_DEDUP = {
  isDuplicate: false,
  reason: 'Image capture path',
  method: 'NONE' as const
};

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const stripDataUrlPrefix = (value: string): string => value.replace(/^data:[^;]+;base64,/i, '').trim();

const estimateBase64Bytes = (base64: string): number => {
  const clean = stripDataUrlPrefix(base64);
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
};

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const toTransactionType = (value: unknown): 'INCOME' | 'EXPENSE' | 'TRANSFER' => {
  const candidate = String(value || '').toUpperCase();
  if (candidate === 'INCOME' || candidate === 'TRANSFER') return candidate;
  return 'EXPENSE';
};

const inferMimeTypeFromPath = (path: string): string => {
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
};

const toIsoDate = (value: string, fallbackIso: string): string => {
  const raw = normalizeSpace(String(value || ''));
  if (!raw) return fallbackIso;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  const dmY = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmY) {
    const dd = Number(dmY[1]);
    const mm = Number(dmY[2]);
    const yearRaw = Number(dmY[3]);
    const yyyy = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const asIso = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
    if (!Number.isNaN(asIso.getTime())) return asIso.toISOString();
  }

  return fallbackIso;
};

const formatAmount = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2
  });
};

const isFinanceSignal = (analysis: ImageAnalysisResult, caption: string): boolean => {
  if (analysis.isFinanceDocument) return true;
  const signalText = `${analysis.summary} ${analysis.ocrText} ${caption}`.toLowerCase();
  return /(receipt|slip|invoice|promptpay|transfer|transaction|ยอดเงิน|ใบเสร็จ|สลิป|โอนเงิน|จ่ายเงิน|รับเงิน|บาท|฿)/i.test(signalText);
};

const buildProxyMessage = (caption: string, analysis: ImageAnalysisResult): string => {
  const parts = [
    caption ? `คำบรรยายจากผู้ใช้: ${caption}` : '',
    analysis.summary ? `สรุปภาพ: ${analysis.summary}` : '',
    analysis.ocrText ? `ข้อความในภาพ: ${analysis.ocrText.slice(0, 1600)}` : ''
  ].filter(Boolean);
  return parts.join('\n');
};

async function analyzeImageWithGemini(params: {
  apiKey: string;
  imageBase64: string;
  mimeType: string;
  caption: string;
  timezone: string;
}): Promise<ImageAnalysisResult> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const prompt = [
    'Analyze the attached image from personal assistant app.',
    'Focus on finance receipts / transfer slips first.',
    'Return strict JSON only.',
    '',
    `User caption: ${params.caption || '(none)'}`,
    `Timezone: ${params.timezone}`,
    '',
    'Rules:',
    '- If image looks like receipt/slip/invoice/payment proof, set isFinanceDocument=true.',
    '- Extract OCR text in ocrText (best effort, keep key lines).',
    '- If amount is unclear, set amount=null.',
    '- transactionType must be INCOME/EXPENSE/TRANSFER/UNKNOWN.',
    '- transactionDate should be ISO if clear, else empty string.',
    '- confidence is 0..1.'
  ].join('\n');

  const response = await ai.models.generateContent({
    model: CAPTURE_IMAGE_MODEL,
    contents: [
      { text: prompt },
      { inlineData: { data: params.imageBase64, mimeType: params.mimeType || 'image/jpeg' } }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isFinanceDocument: { type: Type.BOOLEAN },
          transactionType: { type: Type.STRING, enum: ['INCOME', 'EXPENSE', 'TRANSFER', 'UNKNOWN'] },
          amount: { type: Type.NUMBER, nullable: true },
          currency: { type: Type.STRING, nullable: true },
          merchant: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING, nullable: true },
          category: { type: Type.STRING, nullable: true },
          transactionDate: { type: Type.STRING, nullable: true },
          summary: { type: Type.STRING, nullable: true },
          ocrText: { type: Type.STRING, nullable: true },
          confidence: { type: Type.NUMBER }
        },
        required: ['isFinanceDocument', 'transactionType', 'confidence']
      }
    }
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    parsed = {};
  }

  const amountNumber = Number(parsed?.amount);
  return {
    isFinanceDocument: Boolean(parsed?.isFinanceDocument),
    transactionType: ['INCOME', 'EXPENSE', 'TRANSFER', 'UNKNOWN'].includes(String(parsed?.transactionType || '').toUpperCase())
      ? String(parsed?.transactionType || '').toUpperCase() as any
      : 'UNKNOWN',
    amount: Number.isFinite(amountNumber) ? amountNumber : null,
    currency: normalizeSpace(String(parsed?.currency || 'THB')),
    merchant: normalizeSpace(String(parsed?.merchant || '')),
    description: normalizeSpace(String(parsed?.description || '')),
    category: normalizeSpace(String(parsed?.category || 'General')),
    transactionDate: normalizeSpace(String(parsed?.transactionDate || '')),
    summary: normalizeSpace(String(parsed?.summary || '')),
    ocrText: normalizeSpace(String(parsed?.ocrText || '')).slice(0, 8000),
    confidence: clamp(Number(parsed?.confidence || 0))
  };
}

export async function fetchTelegramPhotoData(params: FetchTelegramPhotoInput): Promise<TelegramPhotoData> {
  const fileLookupUrl = `https://api.telegram.org/bot${params.botToken}/getFile?file_id=${encodeURIComponent(params.fileId)}`;
  const lookupResponse = await fetch(fileLookupUrl);
  const lookupJson = await lookupResponse.json().catch(() => ({}));

  if (!lookupResponse.ok || !lookupJson?.ok || !lookupJson?.result?.file_path) {
    throw new Error('Telegram getFile failed');
  }

  const filePath = String(lookupJson.result.file_path || '');
  const downloadUrl = `https://api.telegram.org/file/bot${params.botToken}/${filePath}`;
  const fileResponse = await fetch(downloadUrl);
  if (!fileResponse.ok) {
    throw new Error(`Telegram file download failed (${fileResponse.status})`);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  const byteLength = arrayBuffer.byteLength || 0;
  if (byteLength <= 0) {
    throw new Error('Telegram file payload is empty');
  }
  if (byteLength > CAPTURE_IMAGE_MAX_BYTES) {
    throw new Error(`Image too large (${byteLength} bytes)`);
  }

  const contentType = String(fileResponse.headers.get('content-type') || '').toLowerCase();
  const mimeType = contentType.startsWith('image/') ? contentType : inferMimeTypeFromPath(filePath);
  const imageBase64 = Buffer.from(arrayBuffer).toString('base64');
  return { imageBase64, mimeType, filePath, byteLength };
}

export async function processImageCapture(input: ProcessImageCaptureInput): Promise<CapturePipelineResult> {
  const caption = normalizeSpace(String(input.caption || ''));
  const imageBase64 = stripDataUrlPrefix(String(input.imageBase64 || ''));
  const imageBytes = estimateBase64Bytes(imageBase64);

  if (!imageBase64) {
    return {
      success: false,
      source: input.source,
      intent: 'CHITCHAT',
      confidence: 0,
      isActionable: false,
      operation: 'CHAT',
      chatResponse: 'ไม่พบไฟล์รูปสำหรับประมวลผลครับ',
      actionType: 'IMAGE_MISSING',
      status: 'FAILED',
      dedup: DEFAULT_DEDUP
    };
  }

  if (imageBytes > CAPTURE_IMAGE_MAX_BYTES) {
    return {
      success: false,
      source: input.source,
      intent: 'CHITCHAT',
      confidence: 0,
      isActionable: false,
      operation: 'CHAT',
      chatResponse: `รูปใหญ่เกินกำหนด (${Math.round(imageBytes / 1024)} KB) ลองส่งรูปที่เล็กลงหรือครอปเฉพาะส่วนสำคัญครับ`,
      actionType: 'IMAGE_TOO_LARGE',
      status: 'FAILED',
      dedup: DEFAULT_DEDUP,
      meta: {
        imageBytes,
        maxImageBytes: CAPTURE_IMAGE_MAX_BYTES,
        ...(input.imageMeta || {})
      }
    };
  }

  const nowIso = new Date().toISOString();
  const timezone = input.timezone || process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok';

  try {
    const analysis = await analyzeImageWithGemini({
      apiKey: input.geminiApiKey,
      imageBase64,
      mimeType: input.mimeType || 'image/jpeg',
      caption,
      timezone
    });

    const financeSignal = isFinanceSignal(analysis, caption);
    const hasAmount = Number.isFinite(analysis.amount) && (analysis.amount as number) > 0;
    const isFinanceReady = financeSignal && hasAmount && analysis.confidence >= IMAGE_FINANCE_CONFIDENCE_THRESHOLD;

    if (isFinanceReady) {
      const { data: accountRows, error: accountError } = await input.supabase
        .from('accounts')
        .select('id,name,currency')
        .order('name', { ascending: true })
        .limit(1);

      if (accountError) throw new Error(accountError.message);
      const account = Array.isArray(accountRows) ? accountRows[0] : null;

      if (!account?.id) {
        return {
          success: true,
          source: input.source,
          intent: 'FINANCE_CAPTURE',
          confidence: analysis.confidence,
          isActionable: true,
          operation: 'CHAT',
          chatResponse: 'อ่านสลิปได้แล้วครับ แต่ยังไม่มีบัญชีใน Finance ให้บันทึก ลองเพิ่มบัญชี 1 บัญชีก่อน แล้วส่งใหม่อีกครั้ง',
          actionType: 'FINANCE_ACCOUNT_REQUIRED',
          status: 'SUCCESS',
          dedup: DEFAULT_DEDUP,
          meta: {
            analysisConfidence: analysis.confidence,
            financeSignal,
            amount: analysis.amount,
            ...(input.imageMeta || {})
          }
        };
      }

      const txPayload = {
        id: uuidv4(),
        description: analysis.description || analysis.merchant || caption || 'Telegram Receipt/Slip',
        amount: Number(analysis.amount),
        type: toTransactionType(analysis.transactionType),
        category: analysis.category || 'General',
        account_id: String(account.id),
        transaction_date: toIsoDate(analysis.transactionDate, nowIso)
      };

      const insert = await input.supabase.from('transactions').insert(txPayload).select().single();
      if (insert.error) throw new Error(insert.error.message);

      const typeLabel = txPayload.type === 'INCOME' ? 'รายรับ' : txPayload.type === 'TRANSFER' ? 'โอนเงิน' : 'รายจ่าย';
      return {
        success: true,
        source: input.source,
        intent: 'FINANCE_CAPTURE',
        confidence: analysis.confidence,
        isActionable: true,
        operation: 'TRANSACTION',
        chatResponse: `บันทึกรายการจากรูปแล้วครับ: ${typeLabel} ฿${formatAmount(txPayload.amount)} (${txPayload.description})`,
        itemType: 'TRANSACTION',
        createdItem: insert.data,
        actionType: 'CREATE_TX',
        status: 'SUCCESS',
        dedup: DEFAULT_DEDUP,
        meta: {
          imageCapture: true,
          parseSource: 'GEMINI_VISION',
          analysisConfidence: analysis.confidence,
          financeSignal,
          hasAmount,
          ocrPreview: analysis.ocrText.slice(0, 500),
          ...(input.imageMeta || {})
        }
      };
    }

    const proxyMessage = buildProxyMessage(caption, analysis);
    if (proxyMessage) {
      const pipelineResult = await runCapturePipeline({
        supabase: input.supabase,
        userMessage: proxyMessage,
        source: input.source,
        geminiApiKey: input.geminiApiKey,
        approvalGatesEnabled: process.env.ENABLE_APPROVAL_GATES === 'true',
        timezone,
        excludeLogId: input.excludeLogId
      });

      return {
        ...pipelineResult,
        meta: {
          ...(pipelineResult.meta || {}),
          imageCapture: true,
          parseSource: 'GEMINI_VISION',
          analysisConfidence: analysis.confidence,
          financeSignal,
          ocrPreview: analysis.ocrText.slice(0, 500),
          ...(input.imageMeta || {})
        }
      };
    }

    return {
      success: true,
      source: input.source,
      intent: 'CHITCHAT',
      confidence: analysis.confidence,
      isActionable: false,
      operation: 'CHAT',
      chatResponse: 'รับรูปแล้วครับ แต่ยังไม่พบข้อมูลที่ต้องบันทึกชัดเจน',
      actionType: 'IMAGE_ANALYZED',
      status: 'SUCCESS',
      dedup: DEFAULT_DEDUP,
      meta: {
        imageCapture: true,
        parseSource: 'GEMINI_VISION',
        analysisConfidence: analysis.confidence,
        financeSignal,
        ...(input.imageMeta || {})
      }
    };
  } catch (error: any) {
    if (caption) {
      const fallbackResult = await runCapturePipeline({
        supabase: input.supabase,
        userMessage: caption,
        source: input.source,
        geminiApiKey: input.geminiApiKey,
        approvalGatesEnabled: process.env.ENABLE_APPROVAL_GATES === 'true',
        timezone,
        excludeLogId: input.excludeLogId
      });

      return {
        ...fallbackResult,
        meta: {
          ...(fallbackResult.meta || {}),
          imageCapture: true,
          parseSource: 'CAPTION_FALLBACK',
          imageError: error?.message || 'unknown',
          ...(input.imageMeta || {})
        }
      };
    }

    return {
      success: false,
      source: input.source,
      intent: 'CHITCHAT',
      confidence: 0,
      isActionable: false,
      operation: 'CHAT',
      chatResponse: 'อ่านรูปไม่สำเร็จในรอบนี้ ลองส่งภาพใหม่อีกครั้งได้เลยครับ',
      actionType: 'IMAGE_ANALYSIS_ERROR',
      status: 'FAILED',
      dedup: DEFAULT_DEDUP,
      meta: {
        imageError: error?.message || 'unknown',
        ...(input.imageMeta || {})
      }
    };
  }
}
