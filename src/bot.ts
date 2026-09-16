import "dotenv/config";
import { Bot, BotConfig, Context, InlineKeyboard } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";
import { OrderPayload } from "./types.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is missing in environment variables.");

// 1. Configure proxy conditionally
const botConfig: BotConfig<Context> = {};
const useProxy = process.env.USE_PROXY === "true";
const proxyUrl = process.env.PROXY_URL || "http://127.0.0.1:10809";

if (useProxy) {
  console.log(`🔌 Proxy enabled: routing through ${proxyUrl}`);
  const agent = new HttpsProxyAgent(proxyUrl, {
    keepAlive: true,
  });
  botConfig.client = {
    baseFetchConfig: {
      agent,
      compress: true,
    },
    timeoutSeconds: 20,
  };
} else {
  console.log("⚡ Proxy disabled: using direct connection");
}

export const bot = new Bot(token, botConfig);

// 2. Global Error Handler
bot.catch((err) => {
  console.error("💥 Error in bot handler:", err.error);
});

// 3. Logger Middleware
bot.use(async (ctx, next) => {
  console.log(`📩 Incoming update from: ${ctx.from?.first_name} (@${ctx.from?.username || "no_username"})`);
  await next();
});

// 4. /start Command Handler
bot.command("start", async (ctx) => {
  console.log("👉 Handled /start command!");

  const rawUrl = process.env.MINI_APP_URL?.trim();
  const isValidHttps = rawUrl && rawUrl.startsWith("https://");

  // If MINI_APP_URL is not configured yet with HTTPS, send a standard text response
  if (!isValidHttps) {
    await ctx.reply(
      `👋 Welcome to our Store, <b>${ctx.from?.first_name}</b>!\n\n` +
      `⚠️ Mini App URL is not set or not HTTPS.\n` +
      `Add your tunnel URL to <code>.env</code>:\n<code>MINI_APP_URL=https://...</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const keyboard = new InlineKeyboard().webApp("🛍️ Open Store", rawUrl);

  await ctx.reply(
    `👋 Welcome to our Store, <b>${ctx.from?.first_name}</b>!\n\n` +
    `Tap the button below to browse products and place an order.`,
    {
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );
});

// 5. Mini App Order Data Receiver (Telegram.WebApp.sendData)
bot.on("message:web_app_data", async (ctx) => {
  try {
    const rawData = ctx.message.web_app_data.data;
    const order: OrderPayload = JSON.parse(rawData);

    let summary = `✅ <b>Order Received!</b>\n\n`;
    for (const item of order.items) {
      summary += `• ${item.name} × ${item.quantity} ($${(item.price * item.quantity).toFixed(2)})\n`;
    }
    summary += `\n<b>Total: $${order.totalPrice.toFixed(2)}</b>\n`;
    summary += `\nThank you for your order!`;

    await ctx.reply(summary, { parse_mode: "HTML" });
  } catch (err) {
    console.error("Failed to parse web_app_data:", err);
    await ctx.reply("⚠️ Error reading order data.");
  }
});