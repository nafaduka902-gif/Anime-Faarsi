(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const state = {
    repositories: [],
    repo: null,
    branch: "",
    directory: "",
    file: null,
    originalContent: "",
    saving: false
  };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...(options.headers || {})
      }
    });

    let data;

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (response.status === 401) {
      showLogin();
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function toast(message) {
    const element = $("toast");

    element.textContent = message;
    element.classList.remove("hidden");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      element.classList.add("hidden");
    }, 4000);
  }

  function setStatus(message) {
    $("editorStatus").textContent = message;
  }

  function showLogin() {
    $("loginScreen").classList.remove("hidden");
    $("workspace").classList.add("hidden");
  }

  function showWorkspace() {
    $("loginScreen").classList.add("hidden");
    $("workspace").classList.remove("hidden");
  }

  function setConnection(online, message) {
    $("connectionStatus").textContent = message;

    $("connectionDot").classList.toggle(
      "online",
      Boolean(online)
    );
  }

  function navigate(page) {
    const pages = {
      Dashboard: "dashboardPage",
      Repositories: "repositoriesPage",
      "Code Editor": "editorPage"
    };

    for (const [name, id] of Object.entries(pages)) {
      $(id).classList.toggle("hidden", name !== page);
    }

    $("breadcrumbCurrent").textContent = page;

    for (const [name, id] of [
      ["Dashboard", "dashboardNav"],
      ["Repositories", "repositoriesNav"],
      ["Code Editor", "editorNav"]
    ]) {
      $(id).classList.toggle("active", name === page);
    }

    closeMobileMenu();
  }

  function openMobileMenu() {
    $("sidebar").classList.add("open");
    $("mobileOverlay").classList.add("open");
  }

  function closeMobileMenu() {
    $("sidebar").classList.remove("open");
    $("mobileOverlay").classList.remove("open");
  }

  function isDirty() {
    return Boolean(
      state.file &&
      $("codeEditor").value !== state.originalContent
    );
  }

  function updateDirtyState() {
    const dirty = isDirty();

    $("unsavedIndicator").classList.toggle(
      "hidden",
      !dirty
    );

    $("changeStatus").textContent =
      dirty ? "Unsaved changes" : "Ready";

    $("saveFile").disabled =
      !state.file || !dirty || state.saving;
  }

  function updateLineNumbers() {
    const text = $("codeEditor").value;
    const lineCount = Math.max(
      1,
      text.split("\n").length
    );

    $("lineNumbers").textContent = Array
      .from({ length: lineCount }, (_, i) => i + 1)
      .join("\n");

    updateCursorPosition();
  }

  function updateCursorPosition() {
    const editor = $("codeEditor");
    const before = editor.value.slice(
      0,
      editor.selectionStart
    );

    const lines = before.split("\n");
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;

    $("cursorPosition").textContent =
      `Ln ${line}, Col ${col}`;

    $("lineNumbers").scrollTop = editor.scrollTop;
  }

  function languageFromName(name) {
    const ext = String(name).split(".").pop().toLowerCase();

    const map = {
      js: "JavaScript",
      cjs: "JavaScript",
      mjs: "JavaScript",
      ts: "TypeScript",
      json: "JSON",
      html: "HTML",
      css: "CSS",
      md: "Markdown",
      py: "Python",
      sh: "Shell",
      yml: "YAML",
      yaml: "YAML",
      xml: "XML",
      txt: "Plain text",
      env: "Environment"
    };

    return map[ext] || "Plain text";
  }

  function renderRepositories() {
    const repos = state.repositories;

    $("repoCount").textContent = repos.length;

    const cards = repos.length
      ? repos.map(repo => `
          <article class="repository-card">
            <h3>${escapeHtml(repo.fullName)}</h3>
            <p>${escapeHtml(repo.description || "No description provided.")}</p>
            <div class="repo-meta">
              ${repo.private ? "Private" : "Public"}
              · Default branch: ${escapeHtml(repo.defaultBranch || "main")}
            </div>
            <button
              class="primary-button"
              data-open-repo="${escapeHtml(repo.fullName)}"
            >
              Open repository
            </button>
          </article>
        `).join("")
      : '<p class="muted">No repositories found.</p>';

    $("repositoryCards").innerHTML = cards;
    $("allRepositories").innerHTML = cards;

    $("repoList").innerHTML = repos.length
      ? repos.map(repo => `
          <button
            class="repo-item ${
              state.repo?.fullName === repo.fullName ? "active" : ""
            }"
            data-open-repo="${escapeHtml(repo.fullName)}"
            title="${escapeHtml(repo.fullName)}"
          >
            <span>${repo.private ? "🔒" : "◈"}</span>
            <span>${escapeHtml(repo.name)}</span>
          </button>
        `).join("")
      : '<p class="muted">No repositories available.</p>';
  }

  async function loadRepositories() {
    setStatus("Loading repositories...");
    setConnection(false, "Connecting to GitHub...");

    try {
      const result = await api("/api/repos");

      state.repositories = result.repositories || [];

      renderRepositories();

      setConnection(true, "Connected to GitHub");
      setStatus("Ready");

      if (state.repo) {
        const updated = state.repositories.find(
          repo => repo.fullName === state.repo.fullName
        );

        if (updated) {
          state.repo = updated;
          state.branch =
            state.branch || updated.defaultBranch || "main";
        }
      }

      if (!state.repo && state.repositories.length) {
        $("selectedRepo").textContent = "Select a repository";
      }

      return true;
    } catch (error) {
      setConnection(false, "Connection failed");
      setStatus("Error");
      toast(error.message);
      return false;
    }
  }

  async function selectRepository(fullName) {
    const repo = state.repositories.find(
      item => item.fullName === fullName
    );

    if (!repo) return;

    if (isDirty() && !confirm("Discard your unsaved changes?")) {
      return;
    }

    state.repo = repo;
    state.branch = repo.defaultBranch || "main";
    state.directory = "";
    state.file = null;
    state.originalContent = "";

    $("selectedRepo").textContent = repo.name;
    $("explorerRepoName").textContent = repo.fullName;
    $("explorerBranch").textContent = state.branch;
    $("currentBranch").textContent = `Branch: ${state.branch}`;

    $("currentFile").textContent = "No file open";
    $("editorBadge").textContent = "No file";
    $("codeEditor").value = "";
    $("codeEditor").disabled = true;
    $("editorNotice").textContent =
      "Select a text file from the explorer to start editing.";

    updateLineNumbers();
    updateDirtyState();
    renderRepositories();
    navigate("Code Editor");

    await browsePath("");
  }

  async function browsePath(path) {
    if (!state.repo) {
      toast("Select a repository first.");
      return;
    }

    const params = new URLSearchParams({
      repo: state.repo.fullName,
      path,
      branch: state.branch
    });

    $("fileList").innerHTML =
      '<p class="muted">Loading files...</p>';

    try {
      const result = await api(`/api/files?${params}`);

      if (result.type === "file") {
        await openFile(result);
        return;
      }

      state.directory = path;

      const files = result.files || [];

      const parent = path
        ? `<button class="file-item directory" data-path="${
            escapeHtml(path.split("/").slice(0, -1).join("/"))
          }"><span>↩</span><span>..</span></button>`
        : "";

      $("fileList").innerHTML = parent + (
        files.length
          ? files
              .sort((a, b) => {
                if (a.type !== b.type) {
                  return a.type === "dir" ? -1 : 1;
                }

                return a.name.localeCompare(b.name);
              })
              .map(file => {
                const isDir = file.type === "dir";

                return `
                  <button
                    class="file-item ${isDir ? "directory" : ""}"
                    data-path="${escapeHtml(file.path)}"
                    data-type="${escapeHtml(file.type)}"
                    title="${escapeHtml(file.path)}"
                  >
                    <span>${isDir ? "📁" : "📄"}</span>
                    <span>${escapeHtml(file.name)}</span>
                  </button>
                `;
              }).join("")
          : '<p class="muted">This directory is empty.</p>'
      );
    } catch (error) {
      $("fileList").innerHTML =
        `<p class="error-text">${escapeHtml(error.message)}</p>`;

      toast(error.message);
    }
  }

  async function openFile(file) {
    if (isDirty() && !confirm("Discard your unsaved changes?")) {
      return;
    }

    state.file = {
      path: file.path,
      name: file.name,
      sha: file.sha
    };

    state.originalContent = file.content;

    $("currentFile").textContent = file.path;
    $("editorBadge").textContent = "Editing";
    $("codeEditor").value = file.content;
    $("codeEditor").disabled = false;
    $("editorNotice").textContent =
      `Editing ${file.path} on branch ${state.branch}.`;

    $("languageStatus").textContent =
      languageFromName(file.name);

    $("commitMessage").value = `Update ${file.name}`;

    updateLineNumbers();
    updateDirtyState();
    navigate("Code Editor");

    $("codeEditor").focus();
  }

  async function saveCurrentFile() {
    if (!state.file || !state.repo) {
      toast("Open a file first.");
      return;
    }

    if (!isDirty()) {
      toast("There are no changes to save.");
      return;
    }

    const message = $("commitMessage").value.trim();

    if (!message) {
      toast("Enter a commit message.");
      $("commitMessage").focus();
      return;
    }

    if (!confirm(
      `Save changes to ${state.repo.fullName}/${state.file.path}?`
    )) {
      return;
    }

    state.saving = true;
    $("saveFile").disabled = true;
    setStatus("Saving...");
    $("editorNotice").textContent =
      "Sending changes to GitHub...";

    try {
      const result = await api("/api/save", {
        method: "POST",
        body: JSON.stringify({
          repo: state.repo.fullName,
          path: state.file.path,
          branch: state.branch,
          content: $("codeEditor").value,
          message
        })
      });

      state.originalContent = $("codeEditor").value;

      if (result.path) {
        state.file.path = result.path;
      }

      updateDirtyState();

      setStatus("Saved");
      $("editorNotice").textContent =
        "File saved successfully to GitHub.";

      toast("File saved successfully.");

      // Refresh after saving, without blocking the refresh itself.
      const currentDirectory = state.directory;

      await browsePath(currentDirectory);
    } catch (error) {
      setStatus("Save failed");
      $("editorNotice").textContent = error.message;
      toast(error.message);
    } finally {
      state.saving = false;
      updateDirtyState();
    }
  }

  async function reloadCurrentFile() {
    if (!state.file || !state.repo) {
      toast("Open a file first.");
      return;
    }

    if (isDirty() && !confirm("Discard your unsaved changes and reload?")) {
      return;
    }

    const params = new URLSearchParams({
      repo: state.repo.fullName,
      path: state.file.path,
      branch: state.branch
    });

    try {
      const file = await api(`/api/files?${params}`);

      if (file.type !== "file") {
        throw new Error("The selected path is no longer a file.");
      }

      await openFile(file);
      toast("File reloaded.");
    } catch (error) {
      toast(error.message);
    }
  }

  async function logout() {
    if (isDirty() && !confirm("Discard unsaved changes and sign out?")) {
      return;
    }

    try {
      await api("/api/logout", {
        method: "POST",
        body: JSON.stringify({})
      });
    } catch {
      // Clear the local interface even if the request fails.
    }

    state.repositories = [];
    state.repo = null;
    state.branch = "";
    state.directory = "";
    state.file = null;
    state.originalContent = "";

    showLogin();
  }

  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = $("loginButton");
    const errorElement = $("loginError");

    button.disabled = true;
    button.textContent = "Signing in...";
    errorElement.textContent = "";

    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          password: $("password").value
        })
      });

      $("password").value = "";
      showWorkspace();

      const loaded = await loadRepositories();

      if (loaded) {
        navigate("Dashboard");
      }
    } catch (error) {
      errorElement.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Sign in";
    }
  });

  document.addEventListener("click", async event => {
    const repoButton = event.target.closest("[data-open-repo]");

    if (repoButton) {
      await selectRepository(repoButton.dataset.openRepo);
      return;
    }

    const fileButton = event.target.closest("[data-path]");

    if (fileButton) {
      const path = fileButton.dataset.path;
      const type = fileButton.dataset.type;

      if (type === "dir") {
        await browsePath(path);
      } else {
        await browsePath(path);
      }

      return;
    }

    const nav = event.target.closest(".nav-item");

    if (nav) {
      if (nav.id === "dashboardNav") {
        navigate("Dashboard");
      } else if (nav.id === "repositoriesNav") {
        navigate("Repositories");
      } else {
        navigate("Code Editor");
      }
    }
  });

  $("saveFile").addEventListener("click", saveCurrentFile);
  $("reloadFile").addEventListener("click", reloadCurrentFile);

  $("refreshRepos").addEventListener("click", loadRepositories);
  $("refreshDashboard").addEventListener("click", loadRepositories);

  $("refreshFiles").addEventListener("click", () => {
    browsePath(state.directory);
  });

  $("browseRepos").addEventListener("click", () => {
    navigate("Repositories");
  });

  $("logoutButton").addEventListener("click", logout);

  $("mobileMenu").addEventListener("click", openMobileMenu);
  $("mobileOverlay").addEventListener("click", closeMobileMenu);

  $("codeEditor").addEventListener("input", () => {
    updateLineNumbers();
    updateDirtyState();
  });

  $("codeEditor").addEventListener("click", updateCursorPosition);
  $("codeEditor").addEventListener("keyup", updateCursorPosition);
  $("codeEditor").addEventListener("scroll", () => {
    $("lineNumbers").scrollTop = $("codeEditor").scrollTop;
  });

  $("codeEditor").addEventListener("keydown", event => {
    if (event.key === "Tab") {
      event.preventDefault();

      const editor = $("codeEditor");
      const start = editor.selectionStart;
      const end = editor.selectionEnd;

      editor.setRangeText("  ", start, end, "end");

      updateLineNumbers();
      updateDirtyState();
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveCurrentFile();
    }
  });

  window.addEventListener("beforeunload", event => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Check whether a valid session already exists.
  async function initialize() {
    try {
      const result = await api("/api/repos");

      state.repositories = result.repositories || [];

      showWorkspace();
      renderRepositories();
      setConnection(true, "Connected to GitHub");
      navigate("Dashboard");
    } catch {
      showLogin();
    }
  }

  initialize();
})();