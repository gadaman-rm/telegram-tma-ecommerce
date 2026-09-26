import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { bot } from "./bot.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

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

  // 2. Check token existence
  console.log("🔑 Checking token...");
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("❌ BOT_TOKEN is undefined! Check your .env file.");
    return;
  }
  console.log(`🔑 Token found (starts with: ${token.substring(0, 6)}...)`);

  // 3. Test direct network connectivity to Telegram
  console.log("📡 Pinging Telegram API directly...");
  try {
    const me = await Promise.race([
      bot.api.getMe(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Connection timed out after 10s. Your network/ISP might be blocking api.telegram.org")), 10000)
      )
    ]);
    console.log(`✅ Connected! Authenticated as: @${(me as any).username}`);
  } catch (err) {
    console.error("❌ Failed to reach Telegram API:", err);
    return; // Don't try to start polling if we can't reach the API
  }

  // 4. Start long polling
  console.log("🤖 Starting long polling listener...");
  await bot.start({
    onStart(botInfo) {
      console.log(`🚀 Polling active for @${botInfo.username}! Send /start in Telegram now.`);
    },
  });

  // 5. Register Telegram command menu entries for the chat UI
  await bot.api.setMyCommands([
    { command: "start", description: "Start the shop flow" },
    { command: "language", description: "Choose your language" },
    { command: "help", description: "Show available commands" },
  ], {
    scope: { type: "default" },
  });
  console.log("📋 Telegram command menu updated");
}

run().catch((err) => {
    console.error("Fatal startup error:", err);
    process.exit(1);
});