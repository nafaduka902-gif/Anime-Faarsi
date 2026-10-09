const crypto = require("crypto");

function getSecret() {
  return process.env.SESSION_SECRET || "";
}

function sign(value) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(value)
    .digest("hex");
}

function createSession() {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const payload = String(expires);
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  return left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const password = process.env.EDITOR_PASSWORD;
  const secret = getSecret();

  if (!password || secret.length < 32) {
    return res.status(500).json({
      error: "Server authentication is not configured."
    });
  }

  const supplied = String(
    req.body?.password || ""
  );

  if (!safeEqual(supplied, password)) {
    return res.status(401).json({
      error: "Incorrect password."
    });
  }

  const session = createSession();

  res.setHeader(
    "Set-Cookie",
    `editor_session=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`
  );

  return res.status(200).json({
    success: true
  });
};