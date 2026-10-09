const { requireAuth } = require("./auth");

function validRepo(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
    value
  );
}

function validPath(value) {
  if (!value) return false;

  if (value.startsWith("/") || value.includes("\\")) {
    return false;
  }

  return value.split("/").every(part =>
    part !== "." &&
    part !== ".." &&
    part.length > 0
  );
}

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "GITHUB_TOKEN is not configured."
    });
  }

  const body = req.body || {};

  const repo = String(body.repo || "");
  const path = String(body.path || "");
  const branch = String(body.branch || "");
  const content = body.content;
  const message = String(
    body.message || "Update file using GitHub Editor"
  ).trim();

  if (!validRepo(repo) || !validPath(path)) {
    return res.status(400).json({
      error: "Invalid repository or file path."
    });
  }

  if (
    !branch ||
    branch.length > 200 ||
    branch.startsWith("-")
  ) {
    return res.status(400).json({
      error: "Invalid branch."
    });
  }

  if (typeof content !== "string") {
    return res.status(400).json({
      error: "File content must be text."
    });
  }

  if (Buffer.byteLength(content, "utf8") > 900_000) {
    return res.status(413).json({
      error: "File is too large to save."
    });
  }

  if (!message || message.length > 200) {
    return res.status(400).json({
      error: "Commit message must be 1–200 characters."
    });
  }

  const encodedPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url =
    `https://api.github.com/repos/${repo}/contents/${encodedPath}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };

  try {
    // Read the current version to obtain its SHA.
    const currentResponse = await fetch(
      `${url}?ref=${encodeURIComponent(branch)}`,
      { headers }
    );

    const current = await currentResponse.json();

    if (!currentResponse.ok) {
      return res.status(currentResponse.status).json({
        error: current.message || "Could not read the current file."
      });
    }

    if (current.type !== "file" || !current.sha) {
      return res.status(400).json({
        error: "Only existing regular files can be updated."
      });
    }

    const payload = {
      message,
      content: Buffer
        .from(content, "utf8")
        .toString("base64"),
      sha: current.sha,
      branch
    };

    const saveResponse = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload)
    });

    const result = await saveResponse.json();

    if (!saveResponse.ok) {
      return res.status(saveResponse.status).json({
        error: result.message || "GitHub could not save the file."
      });
    }

    return res.status(200).json({
      success: true,
      message: "File saved to GitHub.",
      commit: result.commit?.sha || "",
      path: result.content?.path || path
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not connect to GitHub."
    });
  }
};