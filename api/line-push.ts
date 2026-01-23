
export default async function handler(req: any, res: any) {
  // 1. Check Method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Get Data & Secrets from Vercel Environment Variables
    const { message } = req.body;
    
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const targetUserId = process.env.LINE_USER_ID; // เจดึงจาก Env ตรงนี้เลยครับ

    // Debugging Logs
    if (!channelAccessToken) {
      console.error("❌ MISSING: LINE_CHANNEL_ACCESS_TOKEN");
      return res.status(500).json({ error: "Server config error: Missing Access Token" });
    }
    
    if (!targetUserId) {
      console.error("❌ MISSING: LINE_USER_ID");
      return res.status(500).json({ error: "Server config error: Missing LINE_USER_ID in Vercel" });
    }

    if (!message) {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

    // 3. Call LINE Messaging API
    console.log(`Attempting to send message to configured user.`);
    
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: targetUserId, // Use the Env Var
        messages: [{ type: 'text', text: message }],
      }),
    });

    const result = await response.json();

    if (!response.ok) {
        console.error("LINE API Error:", result);
        throw new Error(result.message || 'Failed to send message to LINE');
    }

    console.log("✅ Message sent successfully!");
    return res.status(200).json({ success: true, data: result });

  } catch (error: any) {
    console.error("Serverless Function Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
