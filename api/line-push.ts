
export default async function handler(req: any, res: any) {
  // 1. Check Method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Get Data & Secrets
    const { userId, message } = req.body;
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!channelAccessToken) {
      console.error("Missing LINE_CHANNEL_ACCESS_TOKEN in Vercel Environment Variables");
      return res.status(500).json({ error: "Server configuration error: Missing Access Token" });
    }

    if (!userId || !message) {
      return res.status(400).json({ error: "Missing userId or message" });
    }

    // 3. Call LINE API
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: message }],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || 'Failed to send message to LINE');
    }

    return res.status(200).json({ success: true, data: result });

  } catch (error: any) {
    console.error("LINE Push Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
