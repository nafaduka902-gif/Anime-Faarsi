module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  res.setHeader(
    "Set-Cookie",
    "editor_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );

  return res.status(200).json({
    success: true
  });
};