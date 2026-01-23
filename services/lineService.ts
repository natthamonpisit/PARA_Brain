
export const lineService = {
  /**
   * Sends a push message to a specific LINE User ID via Vercel Serverless Function.
   */
  async sendPushMessage(userId: string, message: string): Promise<any> {
    try {
      // Calls the file located at /api/line-push.ts
      const response = await fetch('/api/line-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            userId: userId,
            message: message 
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send LINE message');
      }
      
      return result;
    } catch (error: any) {
      console.error('Failed to send LINE message:', error);
      throw error;
    }
  },

  /**
   * Helps user find their User ID
   */
  getHelpMessage(): string {
    return "To get your User ID, go to LINE Developers Console > Basic Settings > Your User ID (bottom of page).";
  }
};
