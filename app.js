"use strict";

const $ = (id) => document.getElementById(id);

const state = {
repos: [],
repo: null,
files: [],
file: null,
branch: "main",
originalContent: "",
loading: false,
saving: false,
view: "Dashboard",
directory: "",
requestId: 0
};

const elements = {
repoList: $("repoList"),
fileList: $("fileList"),
repoCount: $("repoCount"),
selectedRepo: $("selectedRepo"),
editorStatus: $("editorStatus"),
changeStatus: $("changeStatus"),
connectionStatus: $("connectionStatus"),
connectionDot: $("connectionDot"),
explorerRepoName: $("explorerRepoName"),
explorerRepoStatus: $("explorerRepoStatus"),
explorerBranch: $("explorerBranch"),
currentFile: $("currentFile"),
currentBranch: $("currentBranch"),
activeFileTab: $("activeFileTab"),
editorBadge: $("editorBadge"),
editorNotice: $("editorNotice"),
codeEditor: $("codeEditor"),
lineNumbers: $("lineNumbers"),
languageStatus: $("languageStatus"),
editorConnection: $("editorConnection"),
cursorPosition: $("cursorPosition"),
unsavedIndicator: $("unsavedIndicator"),
commitMessage: $("commitMessage"),
saveFile: $("saveFile"),
reloadFile: $("reloadFile"),
refreshRepos: $("refreshRepos"),
refreshFiles: $("refreshFiles"),
refreshDashboard: $("refreshDashboard"),
browseRepos: $("browseRepos"),
dashboardNav: $("dashboardNav"),
repositoriesNav: $("repositoriesNav"),
editorNav: $("editorNav"),
breadcrumbCurrent: $("breadcrumbCurrent"),
mobileMenu: $("mobileMenu"),
sidebar: $("sidebar"),
mobileOverlay: $("mobileOverlay")
};

function createElement(tag, className, text) {
const element = document.createElement(tag);

if (className) {
element.className = className;
}

if (text !== undefined) {
element.textContent = String(text);
}

return element;
}

function setConnection(message, connected = false) {
elements.connectionStatus.textContent = message;

elements.connectionDot.style.background = connected
? "var(--green)"
: "var(--orange)";

elements.connectionDot.style.boxShadow = connected
? "0 0 10px rgba(76,219,173,.25)"
: "none";
}

function setNotice(message, type = "") {
const notice = elements.editorNotice;

notice.replaceChildren();

const icon = createElement(
"span",
"notice-icon",
type === "error" ? "!" : type === "success" ? "✓" : "ⓘ"
);

const text = createElement("span", "", message);

notice.append(icon, text);
notice.className = "editor-notice ${type}".trim();
}

async function api(path, options = {}) {
const response = await fetch(path, {
credentials: "same-origin",
cache: "no-store",
...options,
headers: {
...(options.body
? { "Content-Type": "application/json" }
: {}),
...(options.headers || {})
}
});

const data = await response.json().catch(() => ({}));

if (response.status === 401) {
throw new Error(
"Authentication required. Please sign in before accessing GitHub."
);
}

if (response.status === 403) {
throw new Error(
data.error || "Access denied. Check your account permissions."
);
}

if (!response.ok) {
throw new Error(
data.error || "Request failed with status ${response.status}."
);
}

return data;
}

function setLoading(loading) {
state.loading = loading;

elements.refreshRepos.disabled = loading;
elements.refreshFiles.disabled = loading;

updateEditorStatus();
}

function getRepositoryName(repo) {
return repo?.fullName || repo?.full_name || repo?.name || "Unknown";
}

function getDefaultBranch(repo) {
return repo?.defaultBranch || repo?.default_branch || "main";
}

function getFileName(path) {
return String(path || "").split("/").filter(Boolean).pop() || "/";
}

function getLanguage(path) {
const extension = String(path || "")
.split(".")
.pop()
.toLowerCase();

const languages = {
js: "JavaScript",
mjs: "JavaScript",
cjs: "JavaScript",
jsx: "JavaScript JSX",
ts: "TypeScript",
tsx: "TypeScript JSX",
html: "HTML",
htm: "HTML",
css: "CSS",
json: "JSON",
md: "Markdown",
py: "Python",
sh: "Shell",
yml: "YAML",
yaml: "YAML",
xml: "XML",
svg: "SVG",
txt: "Plain Text",
env: "Environment",
gitignore: "Git Ignore"
};

return languages[extension] || "Plain Text";
}

function isTextFile(file) {
if (file.type === "dir") {
return false;
}

const path = String(file.path || "");

return !/.(png|jpe?g|gif|webp|ico|pdf|zip|gz|mp4|mp3|woff2?|ttf|exe|dll|bin)$/i.test(
path
);
}

function closeMobileMenu() {
elements.sidebar.classList.remove("open");
elements.mobileOverlay.classList.remove("visible");
}

function openMobileMenu() {
elements.sidebar.classList.add("open");
elements.mobileOverlay.classList.add("visible");
}

function navigate(view) {
state.view = view;

elements.breadcrumbCurrent.textContent = view;

const navItems = [
elements.dashboardNav,
elements.repositoriesNav,
elements.editorNav
];

navItems.forEach((item) => item.classList.remove("active"));

if (view === "Dashboard") {
elements.dashboardNav.classList.add("active");
window.scrollTo({ top: 0, behavior: "smooth" });
}

if (view === "Repositories") {
elements.repositoriesNav.classList.add("active");

$("workspace").scrollIntoView({
  behavior: "smooth",
  block: "start"
});

}

if (view === "Code Editor") {
elements.editorNav.classList.add("active");

$("workspace").scrollIntoView({
  behavior: "smooth",
  block: "start"
});

elements.codeEditor.focus({ preventScroll: true });

}

closeMobileMenu();
}

function renderRepos() {
elements.repoList.replaceChildren();

if (!state.repos.length) {
elements.repoList.append(
createElement(
"div",
"sidebar-empty",
"No repositories available."
)
);

return;

}

for (const repo of state.repos) {
const fullName = getRepositoryName(repo);

const button = createElement("button", "repo-item");

button.type = "button";
button.classList.toggle(
  "active",
  Boolean(state.repo && getRepositoryName(state.repo) === fullName)
);

button.append(
  document.createTextNode(fullName)
);

button.title = fullName;

button.addEventListener("click", () => {
  selectRepo(repo);
});

elements.repoList.append(button);

}
}

function renderFiles() {
elements.fileList.replaceChildren();

if (!state.repo) {
showEmptyFiles(
"No repository selected",
"Choose a repository to browse its files."
);

return;

}

if (!state.files.length) {
showEmptyFiles(
"No files found",
"This directory may be empty or inaccessible."
);

return;

}

const sortedFiles = [...state.files].sort((a, b) => {
if (a.type === "dir" && b.type !== "dir") return -1;
if (a.type !== "dir" && b.type === "dir") return 1;

return String(a.path).localeCompare(String(b.path));

});

if (state.directory) {
const parentPath = state.directory.split("/").slice(0, -1).join("/");

const back = createElement("button", "file-item", "↰  ..");
back.type = "button";
back.addEventListener("click", () => browsePath(parentPath));

elements.fileList.append(back);

}

for (const file of sortedFiles) {
const button = createElement("button", "file-item");

button.type = "button";

const name = getFileName(file.path);

button.textContent = file.type === "dir"
  ? `▸  ${name}/`
  : `   ${name}`;

button.title = file.path;

if (state.file?.path === file.path) {
  button.classList.add("active");
}

button.addEventListener("click", () => {
  if (file.type === "dir") {
    browsePath(file.path);
    return;
  }

  if (!isTextFile(file)) {
    setNotice(
      "This file type cannot be edited in the text editor.",
      "error"
    );

    return;
  }

  openFile(file.path);
});

elements.fileList.append(button);

}
}

function showEmptyFiles(title, description) {
const empty = createElement("div", "explorer-empty");

empty.append(
createElement("span", "empty-icon", "▤"),
createElement("strong", "", title),
createElement("span", "", description)
);

elements.fileList.append(empty);
}

async function loadRepos() {
setConnection("Connecting...");
elements.refreshRepos.disabled = true;

try {
const data = await api("/api/repos");

state.repos = Array.isArray(data.repositories)
  ? data.repositories
  : [];

elements.repoCount.textContent = String(state.repos.length);

if (state.repo) {
  const selectedName = getRepositoryName(state.repo);

  const updated = state.repos.find(
    (repo) => getRepositoryName(repo) === selectedName
  );

  if (!updated) {
    state.repo = null;
    state.file = null;
    state.files = [];
    state.directory = "";

    resetEditor();
  } else {
    state.repo = updated;
  }
}

renderRepos();

setConnection("Connected", true);

if (!state.repo && state.repos.length === 1) {
  await selectRepo(state.repos[0]);
}

} catch (error) {
setConnection("Connection failed");
setNotice(error.message, "error");
} finally {
elements.refreshRepos.disabled = false;
}
}

async function selectRepo(repo) {
if (state.loading || state.saving) return;

state.repo = repo;
state.file = null;
state.files = [];
state.directory = "";
state.branch = getDefaultBranch(repo);

const fullName = getRepositoryName(repo);

elements.selectedRepo.textContent =
repo.name || fullName.split("/").pop();

elements.explorerRepoName.textContent = fullName;
elements.explorerRepoStatus.textContent = "Selected";
elements.explorerBranch.textContent = state.branch;

renderRepos();
resetEditor();

await browsePath("");
}

async function browsePath(path = "") {
if (!state.repo || state.loading || state.saving) return;

const requestId = ++state.requestId;

setLoading(true);

state.directory = path;

elements.fileList.replaceChildren(
createElement("div", "explorer-empty", "Loading files...")
);

try {
const params = new URLSearchParams({
repo: getRepositoryName(state.repo),
path,
branch: state.branch
});

const data = await api(`/api/files?${params}`);

if (requestId !== state.requestId) return;

state.files = Array.isArray(data.files) ? data.files : [];

renderFiles();

setNotice(
  path
    ? `Loaded directory: ${path}`
    : `Repository loaded: ${getRepositoryName(state.repo)}`,
  "success"
);

} catch (error) {
if (requestId !== state.requestId) return;

setNotice(error.message, "error");

showEmptyFiles(
  "Unable to load files",
  "Check the repository, branch, and API configuration."
);

} finally {
if (requestId === state.requestId) {
setLoading(false);
}
}
}

async function openFile(path) {
if (!state.repo || state.loading || state.saving) return;

const requestId = ++state.requestId;

setLoading(true);

try {
const params = new URLSearchParams({
repo: getRepositoryName(state.repo),
path,
branch: state.branch
});

const data = await api(`/api/files?${params}`);

if (requestId !== state.requestId) return;

if (typeof data.content !== "string") {
  throw new Error(
    "The API did not return file content as text."
  );
}

state.file = {
  path,
  sha: data.sha || null
};

state.originalContent = data.content;

elements.currentFile.textContent = path;
elements.currentBranch.textContent = `Branch: ${state.branch}`;
elements.activeFileTab.textContent = getFileName(path);

elements.codeEditor.value = data.content;
elements.codeEditor.disabled = false;

elements.commitMessage.value =
  `Update ${getFileName(path)}`;

elements.languageStatus.textContent = getLanguage(path);
elements.reloadFile.disabled = false;

renderFiles();
updateEditorStatus();

setNotice(
  `Successfully loaded ${path}`,
  "success"
);

navigate("Code Editor");

} catch (error) {
if (requestId !== state.requestId) return;

setNotice(error.message, "error");

} finally {
if (requestId === state.requestId) {
setLoading(false);
}
}
}

function resetEditor() {
state.file = null;
state.originalContent = "";

elements.currentFile.textContent = "No file selected";
elements.currentBranch.textContent = "Select a file to begin";
elements.activeFileTab.textContent = "No file open";

elements.codeEditor.value = "";
elements.codeEditor.disabled = true;

elements.commitMessage.value = "";
elements.languageStatus.textContent = "Plain Text";

elements.reloadFile.disabled = true;
elements.cursorPosition.textContent = "Ln 1, Col 1";

updateEditorStatus();

setNotice(
"Select a repository, then choose a file to edit."
);
}

function updateLineNumbers() {
const lines = elements.codeEditor.value.split("\n").length;

elements.lineNumbers.textContent = Array.from(
{ length: Math.max(lines, 1) },
(_, index) => index + 1
).join("\n");

elements.lineNumbers.scrollTop =
elements.codeEditor.scrollTop;
}

function updateCursorPosition() {
const editor = elements.codeEditor;

const cursor = editor.selectionStart;
const textBeforeCursor = editor.value.slice(0, cursor);
const lines = textBeforeCursor.split("\n");

const line = lines.length;
const column = lines[lines.length - 1].length + 1;

elements.cursorPosition.textContent =
"Ln ${line}, Col ${column}";
}

function updateEditorStatus() {
const changed =
Boolean(state.file) &&
elements.codeEditor.value !== state.originalContent;

elements.changeStatus.textContent = changed
? "Unsaved changes detected"
: "No unsaved changes";

elements.editorStatus.textContent = changed
? "Modified"
: state.file
? "Ready"
: "Idle";

elements.editorBadge.textContent = state.saving
? "SAVING"
: changed
? "MODIFIED"
: state.file
? "READY"
: "IDLE";

elements.unsavedIndicator.hidden = !changed;

elements.editorConnection.textContent = state.saving
? "Saving changes..."
: changed
? "Unsaved changes"
: "Ready";

elements.saveFile.disabled =
!state.file ||
!changed ||
state.loading ||
state.saving;

elements.saveFile.innerHTML = state.saving
? "<span>↻</span> Saving..."
: "<span>↑</span> Save to GitHub";

updateLineNumbers();
updateCursorPosition();
}

async function saveFile() {
if (
!state.repo ||
!state.file ||
state.loading ||
state.saving
) {
return;
}

const content = elements.codeEditor.value;

if (content === state.originalContent) {
setNotice("There are no changes to save.");
return;
}

const message = elements.commitMessage.value.trim();

if (!message) {
setNotice("Enter a commit message before saving.", "error");
elements.commitMessage.focus();
return;
}

const confirmed = window.confirm(
"Save changes to ${state.file.path} in ${getRepositoryName(state.repo)}?"
);

if (!confirmed) return;

state.saving = true;
updateEditorStatus();

setNotice("Saving changes to GitHub...");

try {
await api("/api/save", {
method: "POST",
body: JSON.stringify({
repo: getRepositoryName(state.repo),
path: state.file.path,
branch: state.branch,
content,
message
})
});

state.originalContent = content;

updateEditorStatus();

setNotice(
  "Changes successfully committed to GitHub.",
  "success"
);

await browsePath(state.directory);

} catch (error) {
setNotice(error.message, "error");
} finally {
state.saving = false;
updateEditorStatus();
}
}

function bindEvents() {
elements.refreshRepos.addEventListener(
"click",
loadRepos
);

elements.refreshDashboard.addEventListener(
"click",
loadRepos
);

elements.browseRepos.addEventListener(
"click",
() => navigate("Repositories")
);

elements.dashboardNav.addEventListener(
"click",
() => navigate("Dashboard")
);

elements.repositoriesNav.addEventListener(
"click",
() => navigate("Repositories")
);

elements.editorNav.addEventListener(
"click",
() => navigate("Code Editor")
);

elements.refreshFiles.addEventListener(
"click",
() => browsePath(state.directory)
);

elements.reloadFile.addEventListener("click", async () => {
if (!state.file) return;

const changed =
  elements.codeEditor.value !== state.originalContent;

if (
  changed &&
  !window.confirm(
    "Discard unsaved changes and reload the file?"
  )
) {
  return;
}

await openFile(state.file.path);

});

elements.saveFile.addEventListener(
"click",
saveFile
);

elements.codeEditor.addEventListener("input", () => {
updateEditorStatus();
});

elements.codeEditor.addEventListener("click", updateCursorPosition);

elements.codeEditor.addEventListener("keyup", updateCursorPosition);

elements.codeEditor.addEventListener("select", updateCursorPosition);

elements.codeEditor.addEventListener("scroll", () => {
elements.lineNumbers.scrollTop =
elements.codeEditor.scrollTop;
});

elements.codeEditor.addEventListener("keydown", (event) => {
if (event.key !== "Tab") return;

event.preventDefault();

const editor = elements.codeEditor;
const start = editor.selectionStart;
const end = editor.selectionEnd;

editor.setRangeText("  ", start, end, "end");

updateEditorStatus();

});

elements.mobileMenu.addEventListener("click", () => {
if (elements.sidebar.classList.contains("open")) {
closeMobileMenu();
} else {
openMobileMenu();
}
});

elements.mobileOverlay.addEventListener(
"click",
closeMobileMenu
);

window.addEventListener("resize", () => {
if (window.innerWidth > 760) {
closeMobileMenu();
}
});

window.addEventListener("beforeunload", (event) => {
const changed =
Boolean(state.file) &&
elements.codeEditor.value !== state.originalContent;

if (changed) {
  event.preventDefault();
  event.returnValue = "";
}

});
}

function initialize() {
bindEvents();
resetEditor();
renderRepos();
renderFiles();
loadRepos();
}

initialize();