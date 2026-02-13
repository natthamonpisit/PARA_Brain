import { createClient } from "@supabase/supabase-js";
import { sendTelegramText } from './_lib/telegram';

// Initialize Services
// Note: In Vercel Serverless, process.env works automatically.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_USER_ID;

export default async function handler(req: any, res: any) {
  const cronSecret = process.env.CRON_SECRET;
  const providedKey = req.query?.key || req.headers?.['x-cron-key'];
  if (cronSecret && providedKey !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  try {
    if (!supabaseUrl || !supabaseKey || !telegramBotToken || !telegramChatId) {
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

        try {
            await sendTelegramText({
                botToken: telegramBotToken,
                chatId: telegramChatId,
                text: message
            });
            // 3. Mark as Notified (To prevent double spam)
            await supabase
                .from('tasks')
                .update({ is_notified: true })
                .eq('id', task.id);
            
            notifiedTasks.push(task.title);
        } catch (sendError: any) {
            console.error(`Failed to send Telegram for task ${task.id}`, sendError?.message || sendError);
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
