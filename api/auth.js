const crypto = require("crypto");

function sign(value) {
  return crypto
    .createHmac(
      "sha256",
      process.env.SESSION_SECRET || ""
    )
    .update(value)
    .digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  return left.length === right.length &&
    crypto.timingSafeEqual(left, right);
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const item = part.trim();
    const index = item.indexOf("=");

    if (index < 0) continue;

    if (item.slice(0, index) === name) {
      return decodeURIComponent(
        item.slice(index + 1)
      );
    }
  }

  return "";
}

function isAuthenticated(req) {
  const secret = process.env.SESSION_SECRET || "";

  if (secret.length < 32) {
    return false;
  }

  const session = getCookie(req, "editor_session");
  const parts = session.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [expires, signature] = parts;

  if (!/^\d+$/.test(expires)) {
    return false;
  }

  if (Number(expires) <= Date.now()) {
    return false;
  }

  return safeEqual(signature, sign(expires));
}

function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    res.status(401).json({
      error: "Please log in first."
    });

    return false;
  }

  return true;
}

module.exports = {
  requireAuth
};