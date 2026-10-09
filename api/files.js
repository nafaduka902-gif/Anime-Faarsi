const { requireAuth } = require("./auth");

function validRepo(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
    value
  );
}

function validPath(value) {
  if (!value) return true;

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

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const token = process.env.GITHUB_TOKEN;

  const repo = String(req.query.repo || "");
  const path = String(req.query.path || "");
  const branch = String(req.query.branch || "");

  if (!token) {
    return res.status(500).json({
      error: "GITHUB_TOKEN is not configured."
    });
  }

  if (!validRepo(repo) || !validPath(path)) {
    return res.status(400).json({
      error: "Invalid repository or path."
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

  const apiPath = path
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const url =
    `https://api.github.com/repos/${repo}/contents/${apiPath}` +
    `?ref=${encodeURIComponent(branch)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "Could not read GitHub path."
      });
    }

    if (Array.isArray(data)) {
      return res.status(200).json({
        type: "directory",
        files: data.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size
        }))
      });
    }

    if (data.type !== "file") {
      return res.status(400).json({
        error: "This item is not a regular file."
      });
    }

    if (data.size > 1_000_000) {
      return res.status(413).json({
        error: "File is too large for the web editor."
      });
    }

    if (!data.content) {
      return res.status(415).json({
        error: "This file cannot be opened as text."
      });
    }

    const content = Buffer
      .from(data.content, "base64")
      .toString("utf8");

    return res.status(200).json({
      type: "file",
      name: data.name,
      path: data.path,
      sha: data.sha,
      content,
      size: data.size
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not connect to GitHub."
    });
  }
};