import { fetchWithTimeoutRetry } from './externalPolicy';

interface SendTelegramTextParams {
  botToken: string;
  chatId: string | number;
  text: string;
  replyToMessageId?: number;
}

const TELEGRAM_TEXT_LIMIT = 3900;

export async function sendTelegramText(params: SendTelegramTextParams) {
  const { botToken, chatId, text, replyToMessageId } = params;
  const safeText = String(text || '').slice(0, TELEGRAM_TEXT_LIMIT);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: safeText,
    disable_web_page_preview: true
  };

  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }

  const response = await fetchWithTimeoutRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    const detail = result?.description || `Telegram API error (${response.status})`;
    throw new Error(detail);
  }

  return result;
}

