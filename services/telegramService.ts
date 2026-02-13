export const telegramService = {
  async sendPushMessage(message: string): Promise<any> {
    try {
      const response = await fetch('/api/telegram-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send Telegram message');
      }
      return result;
    } catch (error: any) {
      console.error('Failed to send Telegram message:', error);
      throw error;
    }
  },

  getHelpMessage(): string {
    return 'Set TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and optional TELEGRAM_USER_ID in environment variables.';
  }
};

