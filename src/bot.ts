import "dotenv/config";
import { readFileSync } from "node:fs";
import { Bot, BotConfig, Context, InlineKeyboard, InputFile, Keyboard } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";
import { buildMiniAppUrl } from "./language.js";
import { OrderPayload } from "./types.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is missing in environment variables.");

const content = JSON.parse(
  readFileSync(new URL("../public/content.json", import.meta.url), "utf8"),
) as { bot: { sampleVideoCaption: Record<"en" | "fa", string> } };

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

function getShopAdminChatId(): number | undefined {
  const value = process.env.SHOP_ADMIN_CHAT_ID?.trim();
  if (!value || !/^-?\d+$/.test(value)) return undefined;

  const chatId = Number(value);
  return Number.isSafeInteger(chatId) ? chatId : undefined;
}

// 2. Global Error Handler
bot.catch((err) => {
  console.error("💥 Error in bot handler:", err.error);
  if (err.error instanceof Error && "error" in err.error) {
    console.error("Underlying network cause:", err.error.error);
  }
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
  const bannerPath = "/images/i-socket_simple-banner_825x460.jpg";
  const banner = isValidHttps && process.argv.includes("--local-test")
    ? new URL(bannerPath, rawUrl).toString()
    : new InputFile(new URL(`../public${bannerPath}`, import.meta.url));

  if (!isValidHttps) {
    await ctx.replyWithPhoto(banner, {
      caption:
        `👋 Welcome to our Store, <b>${ctx.from?.first_name}</b>!\n\n` +
        `⚠️ Mini App URL is not set or not HTTPS.\n` +
        `Add your tunnel URL to <code>.env</code>:\n<code>MINI_APP_URL=https://...</code>`,
      parse_mode: "HTML",
      },
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  keyboard
    .text("English", "lang:en")
    .text("فارسی", "lang:fa");

  await ctx.replyWithPhoto(banner, {
      caption:
        `👋 Welcome to our Store, <b>${ctx.from?.first_name}</b>!\n\n` +
        `Please select your language to continue.`,
      parse_mode: "HTML",
      reply_markup: keyboard,
    }
  );
});

bot.command("language", async (ctx) => {
  const rawUrl = process.env.MINI_APP_URL?.trim();
  const isValidHttps = rawUrl && rawUrl.startsWith("https://");

  if (!isValidHttps) {
    await ctx.reply("⚠️ Mini App URL is not configured yet.");
    return;
  }

  const keyboard = new InlineKeyboard();
  keyboard
    .text("English", "lang:en")
    .text("فارسی", "lang:fa");

  await ctx.reply("Please choose your language:", {
    reply_markup: keyboard,
  });
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "Available commands:\n" +
      "/start - Start the shop flow\n" +
      "/language - Choose your language\n" +
      "/help - Show this menu",
    { parse_mode: "HTML" }
  );
});

bot.callbackQuery(/lang:(en|fa)/, async (ctx) => {
  const selectedLang = ctx.match[1];
  const rawUrl = process.env.MINI_APP_URL?.trim();
  if (!rawUrl || !rawUrl.startsWith("https://")) {
    await ctx.answerCallbackQuery({ text: "Mini App URL is not configured." });
    return;
  }

  const appUrl = buildMiniAppUrl(rawUrl, selectedLang);
  const storeButton = new InlineKeyboard()
    .webApp(
      selectedLang === "en" ? "🛍️ Open Store" : "🛍️ باز کردن فروشگاه",
      appUrl,
    )
    .text(
      selectedLang === "en" ? "🎬 Sample video" : "🎬 ویدئوی نمونه",
      `sample_video:${selectedLang}`,
    )
    .row()
    .text(
      selectedLang === "en" ? "📞 Call me" : "📞 با من تماس بگیرید",
      `call_me:${selectedLang}`,
    );

  await ctx.editMessageCaption(
    {
      caption:
        selectedLang === "en"
          ? `Language selected: <b>English</b>\n\nTap below to open the store.`
          : `زبان انتخاب شد: <b>فارسی</b>\n\nبرای باز کردن فروشگاه دکمه زیر را فشار دهید.`,
      parse_mode: "HTML",
      reply_markup: storeButton,
    }
  );

  await ctx.answerCallbackQuery({ text: selectedLang === "en" ? "English selected" : "زبان فارسی انتخاب شد" });
});

bot.callbackQuery(/^sample_video:(en|fa)$/, async (ctx) => {
  const selectedLang = ctx.match[1] as "en" | "fa";
  const rawUrl = process.env.MINI_APP_URL?.trim();
  const isValidHttps = rawUrl && rawUrl.startsWith("https://");
  const sampleVideoPath = "/videos/i-socket_introduction_compressed.mp4";
  const sampleVideo = isValidHttps && process.argv.includes("--local-test")
    ? new URL(sampleVideoPath, rawUrl).toString()
    : new InputFile(new URL(`../public${sampleVideoPath}`, import.meta.url));

  await ctx.answerCallbackQuery();
  await ctx.replyWithVideo(sampleVideo, {
    caption: content.bot.sampleVideoCaption[selectedLang],
  });
});

bot.callbackQuery(/^call_me:(en|fa)$/, async (ctx) => {
  const selectedLang = ctx.match[1] as "en" | "fa";
  const adminChatId = getShopAdminChatId();

  if (adminChatId === undefined) {
    await ctx.answerCallbackQuery({ text: "Shop contact is not configured." });
    await ctx.reply(
      selectedLang === "en"
        ? "Phone callbacks are not available right now."
        : "در حال حاضر امکان درخواست تماس وجود ندارد.",
    );
    return;
  }

  await ctx.answerCallbackQuery();
  const keyboard = new Keyboard()
    .requestContact(selectedLang === "en" ? "Share my phone number" : "اشتراک‌گذاری شماره تلفن")
    .resized()
    .oneTime();

  await ctx.reply(
    selectedLang === "en"
      ? "Please share your phone number and the shop will call you."
      : "لطفاً شماره تلفن خود را به اشتراک بگذارید تا فروشگاه با شما تماس بگیرد.",
    { reply_markup: keyboard },
  );
});

bot.on("message:contact", async (ctx) => {
  const contact = ctx.message.contact;
  if (contact.user_id !== ctx.from.id) {
    await ctx.reply("Please use the button to share your own phone number.");
    return;
  }

  const adminChatId = getShopAdminChatId();
  if (adminChatId === undefined) {
    await ctx.reply("Shop contact is not configured.", {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }

  try {
    await ctx.api.sendContact(
      adminChatId,
      contact.phone_number,
      contact.first_name,
      { last_name: contact.last_name },
    );
    await ctx.api.sendMessage(
      adminChatId,
      `Call request from ${ctx.from.first_name} (user ID: ${ctx.from.id}${ctx.from.username ? `, @${ctx.from.username}` : ""}).`,
    );
    await ctx.reply("Thanks! The shop will call you soon.", {
      reply_markup: { remove_keyboard: true },
    });
  } catch (error) {
    console.error("Failed to send call request to shop admin:", error);
    await ctx.reply("Sorry, your call request could not be sent. Please try again.", {
      reply_markup: { remove_keyboard: true },
    });
  }
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