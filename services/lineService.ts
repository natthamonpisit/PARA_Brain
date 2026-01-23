
export const lineService = {
  /**
   * Sends a push message to the configured LINE_USER_ID via Vercel Serverless Function.
   */
  async sendPushMessage(message: string): Promise<any> {
    try {
      // Calls the file located at /api/line-push.ts
      const response = await fetch('/api/line-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
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
    return "User ID is now configured in Vercel Environment Variables (LINE_USER_ID).";
  }
};
