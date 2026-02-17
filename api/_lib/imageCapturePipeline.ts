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
const CAPTURE_IMAGE_ATTACHMENTS_BUCKET = process.env.CAPTURE_IMAGE_ATTACHMENTS_BUCKET || 'attachments';
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

const inferFileExtension = (mimeType: string): string => {
  const lower = String(mimeType || '').toLowerCase();
  if (lower.includes('png')) return 'png';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('heic')) return 'heic';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpg';
  return 'jpg';
};

const inferParaTableFromType = (type: string): 'tasks' | 'projects' | 'areas' | 'resources' | 'archives' | null => {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'tasks' || normalized === 'task') return 'tasks';
  if (normalized === 'projects' || normalized === 'project') return 'projects';
  if (normalized === 'areas' || normalized === 'area') return 'areas';
  if (normalized === 'resources' || normalized === 'resource') return 'resources';
  if (normalized === 'archives' || normalized === 'archive') return 'archives';
  return null;
};

async function uploadImageAttachment(params: {
  supabase: any;
  source: CaptureSource;
  imageBase64: string;
  mimeType: string;
}): Promise<string | null> {
  try {
    const ext = inferFileExtension(params.mimeType);
    const day = new Date().toISOString().slice(0, 10);
    const filePath = `capture/${String(params.source || 'WEB').toLowerCase()}/${day}/${uuidv4()}.${ext}`;
    const imageBuffer = Buffer.from(params.imageBase64, 'base64');

    const { error: uploadError } = await params.supabase.storage
      .from(CAPTURE_IMAGE_ATTACHMENTS_BUCKET)
      .upload(filePath, imageBuffer, {
        contentType: params.mimeType || 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      console.warn('[imageCapturePipeline] attachment upload failed:', uploadError.message);
      return null;
    }

    const { data } = params.supabase.storage
      .from(CAPTURE_IMAGE_ATTACHMENTS_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = String(data?.publicUrl || '').trim();
    return publicUrl || null;
  } catch (error: any) {
    console.warn('[imageCapturePipeline] attachment upload failed:', error?.message || error);
    return null;
  }
}

async function appendAttachmentToParaRow(params: {
  supabase: any;
  row: any;
  attachmentUrl: string;
  nowIso: string;
}): Promise<any> {
  const table = inferParaTableFromType(params.row?.type);
  const id = String(params.row?.id || '').trim();
  if (!table || !id) return params.row;

  const existing = Array.isArray(params.row?.attachments)
    ? params.row.attachments.map((entry: any) => String(entry || '').trim()).filter(Boolean)
    : [];

  if (existing.includes(params.attachmentUrl)) return params.row;
  const nextAttachments = Array.from(new Set([...existing, params.attachmentUrl])).slice(0, 30);

  const { data, error } = await params.supabase
    .from(table)
    .update({ attachments: nextAttachments, updated_at: params.nowIso })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.warn('[imageCapturePipeline] append attachment failed:', error.message);
    return params.row;
  }

  return data || { ...params.row, attachments: nextAttachments };
}

async function appendAttachmentToTransactionRow(params: {
  supabase: any;
  row: any;
  attachmentUrl: string;
}): Promise<any> {
  const id = String(params.row?.id || '').trim();
  if (!id) return params.row;

  const currentDesc = String(params.row?.description || '').trim();
  if (currentDesc.includes(params.attachmentUrl)) return params.row;
  const nextDesc = currentDesc
    ? `${currentDesc}\nReceipt: ${params.attachmentUrl}`
    : `Receipt: ${params.attachmentUrl}`;

  const { data, error } = await params.supabase
    .from('transactions')
    .update({ description: nextDesc })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.warn('[imageCapturePipeline] append receipt link failed:', error.message);
    return params.row;
  }

  return data || { ...params.row, description: nextDesc };
}

async function attachImageToCaptureResult(params: {
  supabase: any;
  result: CapturePipelineResult;
  attachmentUrl: string | null;
  nowIso: string;
}): Promise<CapturePipelineResult> {
  if (!params.attachmentUrl) return params.result;

  if (params.result.itemType === 'TRANSACTION' && params.result.createdItem) {
    const updatedTx = await appendAttachmentToTransactionRow({
      supabase: params.supabase,
      row: params.result.createdItem,
      attachmentUrl: params.attachmentUrl
    });
    return {
      ...params.result,
      createdItem: updatedTx,
      meta: {
        ...(params.result.meta || {}),
        imageAttachmentUrl: params.attachmentUrl,
        attachmentPatchedItems: 1
      }
    };
  }

  if (params.result.itemType !== 'PARA') {
    return {
      ...params.result,
      meta: {
        ...(params.result.meta || {}),
        imageAttachmentUrl: params.attachmentUrl
      }
    };
  }

  let patchedCount = 0;
  let nextCreatedItem = params.result.createdItem || null;
  let nextCreatedItems = params.result.createdItems;

  if (nextCreatedItem) {
    const patched = await appendAttachmentToParaRow({
      supabase: params.supabase,
      row: nextCreatedItem,
      attachmentUrl: params.attachmentUrl,
      nowIso: params.nowIso
    });
    nextCreatedItem = patched;
    patchedCount += 1;
  }

  if (Array.isArray(nextCreatedItems) && nextCreatedItems.length > 0) {
    const patchedItems: Record<string, any>[] = [];
    for (const row of nextCreatedItems) {
      const patched = await appendAttachmentToParaRow({
        supabase: params.supabase,
        row,
        attachmentUrl: params.attachmentUrl,
        nowIso: params.nowIso
      });
      patchedItems.push(patched);
      patchedCount += 1;
    }
    nextCreatedItems = patchedItems;
  }

  return {
    ...params.result,
    createdItem: nextCreatedItem,
    createdItems: nextCreatedItems,
    meta: {
      ...(params.result.meta || {}),
      imageAttachmentUrl: params.attachmentUrl,
      attachmentPatchedItems: patchedCount
    }
  };
}

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
  const attachmentUrl = await uploadImageAttachment({
    supabase: input.supabase,
    source: input.source,
    imageBase64,
    mimeType: input.mimeType || 'image/jpeg'
  });

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

      const txDescription = attachmentUrl
        ? `${analysis.description || analysis.merchant || caption || 'Telegram Receipt/Slip'}\nReceipt: ${attachmentUrl}`
        : analysis.description || analysis.merchant || caption || 'Telegram Receipt/Slip';

      const txPayload = {
        id: uuidv4(),
        description: txDescription,
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
          imageAttachmentUrl: attachmentUrl,
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

      const resultWithAttachment = await attachImageToCaptureResult({
        supabase: input.supabase,
        result: pipelineResult,
        attachmentUrl,
        nowIso
      });

      return {
        ...resultWithAttachment,
        meta: {
          ...(resultWithAttachment.meta || {}),
          imageCapture: true,
          parseSource: 'GEMINI_VISION',
          analysisConfidence: analysis.confidence,
          financeSignal,
          ocrPreview: analysis.ocrText.slice(0, 500),
          imageAttachmentUrl: attachmentUrl,
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
        imageAttachmentUrl: attachmentUrl,
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

      const fallbackWithAttachment = await attachImageToCaptureResult({
        supabase: input.supabase,
        result: fallbackResult,
        attachmentUrl,
        nowIso
      });

      return {
        ...fallbackWithAttachment,
        meta: {
          ...(fallbackWithAttachment.meta || {}),
          imageCapture: true,
          parseSource: 'CAPTION_FALLBACK',
          imageError: error?.message || 'unknown',
          imageAttachmentUrl: attachmentUrl,
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
        imageAttachmentUrl: attachmentUrl,
        ...(input.imageMeta || {})
      }
    };
  }
}
