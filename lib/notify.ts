// lib/notify.ts
import { ScanSummary } from "@/types";

export async function sendNotification(summary: ScanSummary): Promise<void> {
  const { new: newCount, updated, deleted } = summary;

  // Don't notify if nothing changed
  if (newCount === 0 && updated === 0 && deleted === 0) return;

  const message =
    `📁 **Google Drive Update** (Job: \`${summary.job_id.slice(0, 8)}\`)\n` +
    `🟢 +${newCount} file baru\n` +
    `🟡 ~${updated} file diubah\n` +
    `🔴 -${deleted} file dihapus\n` +
    `📊 Total dipindai: ${summary.total_scanned} file\n` +
    `⏱️ Durasi: ${(summary.duration_ms / 1000).toFixed(2)}s`;

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || process.env.TELEGRAM_WEBHOOK_URL;

  if (!webhookUrl) return;

  // Discord
  if (process.env.DISCORD_WEBHOOK_URL) {
    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  }

  // Telegram
  if (process.env.TELEGRAM_WEBHOOK_URL && process.env.TELEGRAM_CHAT_ID) {
    const telegramMessage =
      `📁 <b>Google Drive Update</b> (Job: <code>${summary.job_id.slice(0, 8)}</code>)\n` +
      `🟢 +${newCount} file baru\n` +
      `🟡 ~${updated} file diubah\n` +
      `🔴 -${deleted} file dihapus\n` +
      `📊 Total dipindai: ${summary.total_scanned} file\n` +
      `⏱️ Durasi: ${(summary.duration_ms / 1000).toFixed(2)}s`;

    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: telegramMessage,
          parse_mode: "HTML",
        }),
      }
    );
  }
}
