import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { webhookCallback } from "grammy";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const serverOnly = process.argv.includes("--server-only");
const webhookPath = "/telegram-webhook";

app.use(express.json());

// Serve static frontend assets from /public
const publicPath = path.resolve(__dirname, "../public");
app.use(express.static(publicPath));

// Health check endpoint
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ✅ Express 5 syntax
app.get("/*splat", (_req, res) => {
    res.sendFile(path.join(publicPath, "index.html"));
});

async function run() {
  // 1. Start Express
  app.listen(PORT, () => {
    console.log(`🚀 Mini App Web Server running on port ${PORT}`);
  });

  if (serverOnly) {
    console.log("🤖 Bot disabled (server-only mode)");
    return;
  }

  // 2. Check token existence
  console.log("🔑 Checking token...");
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("❌ BOT_TOKEN is undefined! Check your .env file.");
    return;
  }
  console.log(`🔑 Token found (starts with: ${token.substring(0, 6)}...)`);

  const { bot } = await import("./bot.js");

  // 3. Test direct network connectivity to Telegram
  console.log("📡 Pinging Telegram API directly...");
  let botUsername: string | undefined;
  try {
    const me = await Promise.race([
      bot.api.getMe(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out after 10s. Your network/ISP might be blocking api.telegram.org")), 10000)
      )
    ]);
    botUsername = me.username;
    console.log(`✅ Connected! Authenticated as: @${botUsername}`);
  } catch (err) {
    console.error("❌ Failed to reach Telegram API:", err);
    return; // Don't try to start polling if we can't reach the API
  }

  // Register Telegram command menu entries for the chat UI
  await bot.api.setMyCommands([
    { command: "start", description: "Start the shop flow" },
    { command: "language", description: "Choose your language" },
    { command: "help", description: "Show available commands" },
  ], {
    scope: { type: "default" },
  });
  console.log("📋 Telegram command menu updated");

  const webhookUrl = process.env.WEBHOOK_URL?.trim();
  const webhookSecret = process.env.WEBHOOK_SECRET_TOKEN?.trim();
  if (webhookUrl || webhookSecret) {
    if (!webhookUrl || !webhookSecret) {
      throw new Error("Set both WEBHOOK_URL and WEBHOOK_SECRET_TOKEN to enable webhook mode.");
    }
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
      throw new Error("WEBHOOK_SECRET_TOKEN must be 1-256 characters using only letters, numbers, underscores, and hyphens.");
    }

    let parsedWebhookUrl: URL;
    try {
      parsedWebhookUrl = new URL(webhookUrl);
    } catch {
      throw new Error("WEBHOOK_URL must be a valid public HTTPS URL.");
    }
    if (
      parsedWebhookUrl.protocol !== "https:" ||
      parsedWebhookUrl.username ||
      parsedWebhookUrl.password ||
      parsedWebhookUrl.search ||
      parsedWebhookUrl.hash ||
      parsedWebhookUrl.pathname !== webhookPath
    ) {
      throw new Error(`WEBHOOK_URL must be an HTTPS URL ending in ${webhookPath}, without credentials, query parameters, or a fragment.`);
    }

    app.post(
      webhookPath,
      webhookCallback(bot, "express", { secretToken: webhookSecret }),
    );
    await bot.api.setWebhook(webhookUrl, { secret_token: webhookSecret });
    console.log(`🪝 Webhook active for @${botUsername ?? "unknown"} at ${parsedWebhookUrl.pathname}`);
    return;
  }

  // Start long polling when webhook settings are not configured.
  console.log("🤖 Starting long polling listener...");
  await bot.start({
    onStart(botInfo) {
      console.log(`🚀 Polling active for @${botInfo.username}! Send /start in Telegram now.`);
    },
  });
}

run().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});