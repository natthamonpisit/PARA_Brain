import { createClient } from "@supabase/supabase-js";
import { sendTelegramText } from './_lib/telegram.js';
import { requireAuth } from './_lib/authGuard.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_USER_ID;

export interface ReminderResult {
  success: boolean;
  notified_count: number;
  tasks: string[];
  error?: string;
}

export async function checkAndSendReminders(): Promise<ReminderResult> {
  if (!supabaseUrl || !supabaseKey || !telegramBotToken || !telegramChatId) {
    return { success: false, notified_count: 0, tasks: [], error: 'Missing server configuration' };
  }

  const supabase = createClient(supabaseUrl!, supabaseKey!);
  const now = new Date().toISOString();

  const { data: dueTasks, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_completed', false)
    .eq('is_notified', false)
    .lte('due_date', now);

  if (error) {
    console.error("DB Error:", error);
    return { success: false, notified_count: 0, tasks: [], error: error.message };
  }

  if (!dueTasks || dueTasks.length === 0) {
    return { success: true, notified_count: 0, tasks: [] };
  }

  const notifiedTasks: string[] = [];

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
      await supabase
        .from('tasks')
        .update({ is_notified: true })
        .eq('id', task.id);

      notifiedTasks.push(task.title);
    } catch (sendError: any) {
      console.error(`Failed to send Telegram for task ${task.id}`, sendError?.message || sendError);
    }
  }

  return { success: true, notified_count: notifiedTasks.length, tasks: notifiedTasks };
}

export default async function handler(req: any, res: any) {
  const auth = requireAuth(req, [process.env.CRON_SECRET]);
  if (!auth.ok) return res.status(auth.status).json(auth.body);

  try {
    const result = await checkAndSendReminders();
    const status = result.success ? 200 : 500;
    return res.status(status).json(result);
  } catch (error: any) {
    console.error("Cron Job Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
