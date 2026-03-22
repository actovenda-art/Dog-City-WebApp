const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://dogcityapp.vercel.app",
]);

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const replyTo = process.env.EMAIL_REPLY_TO;

  if (!resendApiKey || !from) {
    return res.status(500).json({
      error: "Email provider not configured",
      details: "Configure RESEND_API_KEY and EMAIL_FROM in the server environment.",
    });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const to = Array.isArray(payload.to) ? payload.to.filter(Boolean) : [payload.to].filter(Boolean);

    if (!to.length || !payload.subject || (!payload.body && !payload.html)) {
      return res.status(400).json({
        error: "Invalid payload",
        details: "Required fields: to, subject and body or html.",
      });
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: payload.subject,
        text: payload.body || undefined,
        html: payload.html || undefined,
        reply_to: replyTo || undefined,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      return res.status(resendResponse.status).json({
        error: "Email provider rejected the request",
        details: resendData,
      });
    }

    return res.status(200).json({
      ok: true,
      provider: "resend",
      id: resendData?.id || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unexpected email error",
      details: error?.message || String(error),
    });
  }
}
