
export default async function handler(req: any, res: any) {
  // 1. Check Method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Get Data & Secrets from Vercel Environment Variables
    const { userId, message } = req.body;
    
    // พี่อุ๊ก: เจเช็คทั้ง 2 ตัวแปรตามที่พี่ตั้งค่าใน Vercel นะครับ
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    // Debugging Logs (จะโชว์ใน Vercel Function Logs)
    if (!channelAccessToken) {
      console.error("❌ MISSING: LINE_CHANNEL_ACCESS_TOKEN");
      return res.status(500).json({ error: "Server config error: Missing Access Token" });
    }
    
    if (!channelSecret) {
        console.warn("⚠️ WARNING: LINE_CHANNEL_SECRET is missing (Not critical for Push, but recommended)");
    }

    if (!userId || !message) {
      return res.status(400).json({ error: "Missing 'userId' or 'message' in request body" });
    }

    // 3. Call LINE Messaging API
    console.log(`Attempting to send message to: ${userId}`);
    
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
