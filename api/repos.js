const { requireAuth } = require("./auth");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

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

  try {
    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || "GitHub request failed."
      });
    }

    const repositories = data.map(repo => ({
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      defaultBranch: repo.default_branch,
      description: repo.description || "",
      updatedAt: repo.updated_at
    }));

    return res.status(200).json({
      repositories
    });
  } catch (error) {
    return res.status(500).json({
      error: "Could not connect to GitHub."
    });
  }
};