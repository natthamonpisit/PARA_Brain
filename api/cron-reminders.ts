import { createClient } from "@supabase/supabase-js";
import { fetchWithTimeoutRetry } from './_lib/externalPolicy';

// Initialize Services
// Note: In Vercel Serverless, process.env works automatically.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const targetUserId = process.env.LINE_USER_ID;

export default async function handler(req: any, res: any) {
  const cronSecret = process.env.CRON_SECRET;
  const providedKey = req.query?.key || req.headers?.['x-cron-key'];
  if (!cronSecret || providedKey !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    if (!supabaseUrl || !supabaseKey || !channelAccessToken || !targetUserId) {
      return res.status(500).json({ error: "Missing server configuration" });
    }
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const now = new Date().toISOString();

    // 1. Fetch Tasks that are:
    // - Not Completed
    // - Not Notified yet
    // - Due Date is passed (Less than or equal to NOW)
    const { data: dueTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('is_completed', false)
        .eq('is_notified', false) // Requires DB Migration: ALTER TABLE tasks ADD COLUMN is_notified BOOLEAN DEFAULT FALSE;
        .lte('due_date', now);

    if (error) {
        console.error("DB Error:", error);
        return res.status(500).json({ error: error.message });
    }

    if (!dueTasks || dueTasks.length === 0) {
        return res.status(200).json({ message: "No tasks due at this time.", timestamp: now });
    }

    // 2. Loop and Send Notifications
    const notifiedTasks = [];

    for (const task of dueTasks) {
        const message = `⏰ *Reminder: It's time!*
        
📌 **${task.title}**
${task.category ? `📂 ${task.category}` : ''}
📅 Due: ${new Date(task.due_date).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}

Don't forget to complete it!`;

        // Send to LINE
        const lineRes = await fetchWithTimeoutRetry("https://api.line.me/v2/bot/message/push", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({
                to: targetUserId,
                messages: [{ type: 'text', text: message }],
            }),
        });

        if (lineRes.ok) {
            // 3. Mark as Notified (To prevent double spam)
            await supabase
                .from('tasks')
                .update({ is_notified: true })
                .eq('id', task.id);
            
            notifiedTasks.push(task.title);
        } else {
            console.error(`Failed to send LINE for task ${task.id}`, await lineRes.text());
        }
    }

    return res.status(200).json({ 
        success: true, 
        notified_count: notifiedTasks.length,
        tasks: notifiedTasks 
    });

  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
