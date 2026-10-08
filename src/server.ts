import express from "express";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type { Update } from "@grammyjs/types";
import { WebSocket, WebSocketServer } from "ws";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const serverOnly = process.argv.includes("--server-only");
const webhookPath = "/telegram-webhook";
const bridgePath = "/telegram-dev-bridge";
const httpServer = createServer(app);
const bridgeServer = new WebSocketServer({ noServer: true, maxPayload: 1_000_000 });
let bridgeClient: WebSocket | undefined;
let bridgeEnabled = false;
const pendingAcks = new Map<
  number,
  { socket: WebSocket; resolve: () => void; reject: (error: Error) => void }
>();
const inFlightUpdates = new Map<number, Promise<void>>();
const processedUpdateIds = new Set<number>();
const bridgeAssignedUpdateIds = new Set<number>();

app.use(express.json());

function secretMatches(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes);
}

httpServer.on("upgrade", (request, socket, head) => {
  let requestPath: string;
  try {
    requestPath = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
  } catch {
    socket.destroy();
    return;
  }

  const bridgeSecret = process.env.DEV_BRIDGE_SECRET?.trim();
  if (
    requestPath !== bridgePath ||
    !bridgeEnabled ||
    !bridgeSecret ||
    !secretMatches(request.headers.authorization, `Bearer ${bridgeSecret}`)
  ) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if (bridgeClient?.readyState === WebSocket.OPEN) {
    socket.write("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  bridgeServer.handleUpgrade(request, socket, head, (client) => {
    bridgeServer.emit("connection", client, request);
  });
});

bridgeServer.on("connection", (socket) => {
  bridgeClient = socket;
  console.log("🔗 Local development bot connected over WebSocket");

  socket.on("message", (data) => {
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      console.error("Invalid message from local development bot:", error);
      return;
    }

    if (
      typeof message !== "object" ||
      message === null ||
      !("type" in message) ||
      message.type !== "ack" ||
      !("updateId" in message) ||
      typeof message.updateId !== "number" ||
      !("ok" in message) ||
      typeof message.ok !== "boolean"
    ) {
      console.error("Received an invalid acknowledgement from the local development bot");
      return;
    }

    const pending = pendingAcks.get(message.updateId);
    if (!pending || pending.socket !== socket) return;
    pendingAcks.delete(message.updateId);
    if (message.ok) {
      pending.resolve();
    } else {
      pending.reject(new Error(`Local development bot failed to handle update ${message.updateId}`));
    }
  });

  socket.on("close", () => {
    if (bridgeClient === socket) bridgeClient = undefined;
    for (const [updateId, pending] of pendingAcks) {
      if (pending.socket !== socket) continue;
      pendingAcks.delete(updateId);
      pending.reject(new Error("Local development bot disconnected before acknowledging the update"));
    }
    console.log("🔌 Local development bot disconnected");
  });

  socket.on("error", (error) => {
    console.error("Local development WebSocket error:", error);
  });
});

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
  httpServer.listen(PORT, () => {
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
  const bridgeSecret = process.env.DEV_BRIDGE_SECRET?.trim();
  if (bridgeSecret && !webhookUrl) {
    throw new Error("DEV_BRIDGE_SECRET can only be used with webhook mode; set WEBHOOK_URL and WEBHOOK_SECRET_TOKEN too.");
  }
  if (webhookUrl || webhookSecret) {
    if (!webhookUrl || !webhookSecret) {
      throw new Error("Set both WEBHOOK_URL and WEBHOOK_SECRET_TOKEN to enable webhook mode.");
    }
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
      throw new Error("WEBHOOK_SECRET_TOKEN must be 1-256 characters using only letters, numbers, underscores, and hyphens.");
    }
    if (bridgeSecret && !/^[A-Za-z0-9_-]{32,256}$/.test(bridgeSecret)) {
      throw new Error("DEV_BRIDGE_SECRET must be 32-256 characters using only letters, numbers, underscores, and hyphens.");
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

    await bot.init();
    app.post(webhookPath, async (req, res) => {
      if (!secretMatches(req.header("x-telegram-bot-api-secret-token"), webhookSecret)) {
        res.sendStatus(401);
        return;
      }

      const update = req.body as Update;
      if (
        typeof update !== "object" ||
        update === null ||
        !Number.isSafeInteger(update.update_id) ||
        update.update_id < 0
      ) {
        res.status(400).send("Invalid Telegram update");
        return;
      }

      if (processedUpdateIds.has(update.update_id)) {
        res.sendStatus(200);
        return;
      }

      let processing = inFlightUpdates.get(update.update_id);
      if (!processing) {
        processing = (async () => {
          const socket = bridgeClient;
          if (socket?.readyState === WebSocket.OPEN) {
            bridgeAssignedUpdateIds.add(update.update_id);
            if (bridgeAssignedUpdateIds.size > 1000) {
              const oldest = bridgeAssignedUpdateIds.values().next().value;
              if (oldest !== undefined) bridgeAssignedUpdateIds.delete(oldest);
            }
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => {
                pendingAcks.delete(update.update_id);
                reject(new Error(`Timed out waiting for local bot to handle update ${update.update_id}`));
              }, 45_000);
              pendingAcks.set(update.update_id, {
                socket,
                resolve: () => {
                  clearTimeout(timer);
                  resolve();
                },
                reject: (error) => {
                  clearTimeout(timer);
                  reject(error);
                },
              });
              socket.send(
                JSON.stringify({ type: "update", update }),
                (error) => {
                  if (!error) return;
                  clearTimeout(timer);
                  pendingAcks.delete(update.update_id);
                  reject(error);
                },
              );
            });
          } else {
            if (bridgeAssignedUpdateIds.has(update.update_id)) {
              throw new Error(`Update ${update.update_id} was already sent to the local bot; waiting for the bridge to reconnect`);
            }
            await bot.handleUpdate(update);
          }

          bridgeAssignedUpdateIds.delete(update.update_id);
          processedUpdateIds.add(update.update_id);
          if (processedUpdateIds.size > 1000) {
            const oldest = processedUpdateIds.values().next().value;
            if (oldest !== undefined) processedUpdateIds.delete(oldest);
          }
        })();
        inFlightUpdates.set(update.update_id, processing);
        void processing.then(
          () => undefined,
          () => undefined,
        ).finally(() => {
          if (inFlightUpdates.get(update.update_id) === processing) {
            inFlightUpdates.delete(update.update_id);
          }
        });
      }

      try {
        await processing;
        res.sendStatus(200);
      } catch (error) {
        console.error(`Failed to process Telegram update ${update.update_id}:`, error);
        res.sendStatus(503);
      }
    });
    await bot.api.setWebhook(webhookUrl, { secret_token: webhookSecret });
    bridgeEnabled = Boolean(bridgeSecret);
    console.log(`🪝 Webhook active for @${botUsername ?? "unknown"} at ${parsedWebhookUrl.pathname}`);
    if (bridgeSecret) {
      console.log(`🔐 Development WebSocket bridge available at ${bridgePath}`);
    }
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