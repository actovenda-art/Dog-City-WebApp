import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const gatewayToken = process.env.WHATSAPP_GATEWAY_TOKEN || "";
const port = Number(process.env.PORT || 3033);
const sessionBaseDir = process.env.WHATSAPP_SESSION_DIR || path.resolve("/data/whatsapp-sessions");
const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
const clients = new Map();
const chromiumArgs = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-software-rasterizer",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-background-timer-throttling",
  "--disable-breakpad",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter",
  "--disable-sync",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-first-run",
  "--no-zygote",
  "--password-store=basic",
  "--use-mock-keychain",
  "--remote-debugging-port=0",
];

fs.mkdirSync(sessionBaseDir, { recursive: true });

function ensureAuthorized(req, res, next) {
  if (!gatewayToken) return next();
  const authHeader = String(req.headers.authorization || "");
  if (authHeader === `Bearer ${gatewayToken}`) return next();
  return res.status(401).json({ error: "Token do gateway inválido." });
}

function serializeConnection(slotKey) {
  const state = clients.get(slotKey);
  return {
    slot_key: slotKey,
    connection_name: state?.connectionName || "",
    status: state?.status || "disconnected",
    last_qr_code: state?.lastQrCode || "",
    info: state?.info || null,
    last_sent_at: state?.lastSentAt || null,
  };
}

async function getOrCreateClient(slotKey, connectionName = "") {
  const existing = clients.get(slotKey);
  if (existing?.client) return existing;

  const state = {
    slotKey,
    connectionName,
    status: "starting",
    lastQrCode: "",
    info: null,
    lastSentAt: null,
  };

  const client = new Client({
    authTimeoutMs: 120000,
    qrMaxRetries: 0,
    takeoverOnConflict: true,
    authStrategy: new LocalAuth({
      clientId: `dogcity-slot-${slotKey}`,
      dataPath: sessionBaseDir,
    }),
    webVersionCache: {
      type: "remote",
    },
    puppeteer: {
      headless: true,
      dumpio: true,
      timeout: 120000,
      args: chromiumArgs,
      ...(chromiumPath ? { executablePath: chromiumPath } : {}),
    },
  });

  client.on("qr", async (qr) => {
    state.status = "qr_pending";
    state.lastQrCode = await QRCode.toDataURL(qr);
  });

  client.on("ready", async () => {
    state.status = "connected";
    state.lastQrCode = "";
    state.info = await client.getState().catch(() => "ready");
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
  });

  client.on("loading_screen", (percent, message) => {
    state.info = `Carregando WhatsApp (${percent || 0}%): ${message || "aguarde"}`;
  });

  client.on("change_state", (waState) => {
    state.info = waState || null;
  });

  client.on("auth_failure", (message) => {
    state.status = "error";
    state.info = message || "Falha de autenticação.";
  });

  client.on("disconnected", (reason) => {
    state.status = "disconnected";
    state.info = reason || "Desconectado";
  });

  state.client = client;
  clients.set(slotKey, state);
  client.initialize().catch((error) => {
    state.status = "error";
    state.info = error?.message || "Falha ao iniciar a conexão.";
  });

  return state;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "running" });
});

app.post("/api/bridge", ensureAuthorized, async (req, res) => {
  try {
    const action = String(req.body?.action || "").trim();
    const slotKey = String(req.body?.slot_key || req.body?.connection_key || "").trim();

    if (action === "list_connections") {
      const connections = ["1", "2", "3"].map(serializeConnection);
      return res.json({ ok: true, connections });
    }

    if (!slotKey) {
      return res.status(400).json({ error: "Informe slot_key para esta ação." });
    }

    if (action === "connect" || action === "refresh_qr") {
      const state = await getOrCreateClient(slotKey, String(req.body?.connection_name || ""));
      return res.json({ ok: true, connection: serializeConnection(slotKey), status: state.status });
    }

    if (action === "disconnect") {
      const state = clients.get(slotKey);
      if (state?.client) {
        await state.client.destroy().catch(() => null);
      }
      clients.delete(slotKey);
      return res.json({ ok: true, connection: serializeConnection(slotKey) });
    }

    if (action === "send_message") {
      const state = await getOrCreateClient(slotKey, String(req.body?.connection_name || ""));
      if (!state?.client || state.status !== "connected") {
        return res.status(409).json({ error: "A conexão ainda não está pronta para enviar mensagens." });
      }

      const to = String(req.body?.to || "").replace(/\D/g, "");
      const text = String(req.body?.text || "").trim();
      if (!to || !text) {
        return res.status(400).json({ error: "Informe o destino e a mensagem do WhatsApp." });
      }

      const chatId = `${to}@c.us`;
      const message = await state.client.sendMessage(chatId, text);
      state.lastSentAt = new Date().toISOString();
      return res.json({
        ok: true,
        message_id: message?.id?._serialized || null,
        connection: serializeConnection(slotKey),
      });
    }

    return res.status(400).json({ error: "Ação de WhatsApp inválida." });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Falha inesperada no gateway do WhatsApp." });
  }
});

app.listen(port, () => {
  console.log(`Dog City WhatsApp gateway rodando na porta ${port}`);
});
