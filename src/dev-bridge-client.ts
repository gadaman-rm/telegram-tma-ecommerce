import "dotenv/config";
import type { Update } from "@grammyjs/types";
import { WebSocket } from "ws";
import { bot } from "./bot.js";

const bridgePath = "/telegram-dev-bridge";
const bridgeUrl = process.env.DEV_BRIDGE_URL?.trim();
const bridgeSecret = process.env.DEV_BRIDGE_SECRET?.trim();

if (!bridgeUrl || !bridgeSecret) {
  throw new Error("Set DEV_BRIDGE_URL and DEV_BRIDGE_SECRET in your local .env file.");
}
if (!/^[A-Za-z0-9_-]{32,256}$/.test(bridgeSecret)) {
  throw new Error("DEV_BRIDGE_SECRET must be 32-256 characters using only letters, numbers, underscores, and hyphens.");
}

const parsedBridgeUrl = new URL(bridgeUrl);
if (
  parsedBridgeUrl.protocol !== "wss:" ||
  parsedBridgeUrl.username ||
  parsedBridgeUrl.password ||
  parsedBridgeUrl.search ||
  parsedBridgeUrl.hash ||
  parsedBridgeUrl.pathname !== bridgePath
) {
  throw new Error(`DEV_BRIDGE_URL must be a WSS URL ending in ${bridgePath}, without credentials, query parameters, or a fragment.`);
}

const processedUpdateIds = new Set<number>();
let currentSocket: WebSocket | undefined;
let reconnectTimer: NodeJS.Timeout | undefined;
let reconnectDelayMs = 1000;
let stopping = false;

function rememberProcessedUpdate(updateId: number): void {
  processedUpdateIds.add(updateId);
  if (processedUpdateIds.size > 1000) {
    const oldest = processedUpdateIds.values().next().value;
    if (oldest !== undefined) processedUpdateIds.delete(oldest);
  }
}

function sendAcknowledgement(
  socket: WebSocket,
  updateId: number,
  ok: boolean,
): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "ack", updateId, ok }));
}

function isUpdateEnvelope(
  value: unknown,
): value is { type: "update"; update: Update } {
  if (typeof value !== "object" || value === null || !("type" in value) || value.type !== "update" || !("update" in value)) {
    return false;
  }
  const update = value.update;
  return (
    typeof update === "object" &&
    update !== null &&
    "update_id" in update &&
    typeof update.update_id === "number" &&
    Number.isSafeInteger(update.update_id) &&
    update.update_id >= 0
  );
}

async function processUpdate(socket: WebSocket, update: Update): Promise<void> {
  const updateId = update.update_id;
  if (processedUpdateIds.has(updateId)) {
    sendAcknowledgement(socket, updateId, true);
    return;
  }

  try {
    await bot.handleUpdate(update);
    rememberProcessedUpdate(updateId);
    sendAcknowledgement(socket, updateId, true);
  } catch (error) {
    console.error(`Failed to handle Telegram update ${updateId} locally:`, error);
    sendAcknowledgement(socket, updateId, false);
  }
}

async function start(): Promise<void> {
  await bot.init();
  console.log("🧪 Local bot handlers are ready; connecting to the Ubuntu webhook bridge...");

  function connect(): void {
    if (stopping) return;
    const socket = new WebSocket(parsedBridgeUrl, {
      headers: { Authorization: `Bearer ${bridgeSecret}` },
      maxPayload: 1_000_000,
    });
    currentSocket = socket;
    let updateQueue = Promise.resolve();

    socket.on("open", () => {
      reconnectDelayMs = 1000;
      console.log(`🔗 Connected to development bridge at ${parsedBridgeUrl.host}`);
    });

    socket.on("message", (data) => {
      let message: unknown;
      try {
        message = JSON.parse(data.toString());
      } catch (error) {
        console.error("Received invalid JSON from development bridge:", error);
        return;
      }
      if (!isUpdateEnvelope(message)) {
        console.error("Received an invalid update from development bridge");
        return;
      }

      updateQueue = updateQueue
        .then(() => processUpdate(socket, message.update))
        .catch((error: unknown) => {
          console.error("Unexpected local bridge processing error:", error);
        });
    });

    socket.on("error", (error) => {
      console.error("Development bridge connection error:", error.message);
    });

    socket.on("close", () => {
      if (currentSocket === socket) currentSocket = undefined;
      if (stopping) return;
      console.log(`🔌 Bridge disconnected; retrying in ${reconnectDelayMs / 1000}s`);
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
    });
  }

  connect();
}

function stop(): void {
  stopping = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  currentSocket?.close(1000, "Local development client stopped");
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

start().catch((error: unknown) => {
  console.error("Failed to start local development bridge client:", error);
  process.exitCode = 1;
});
