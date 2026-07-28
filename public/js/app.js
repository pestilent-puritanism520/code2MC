/* Code2MC frontend — Made by Atharva Phadnis */

const DEFAULT_SKETCH = `// Code2MC — Made by Atharva Phadnis
void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(500);
  digitalWrite(LED_BUILTIN, LOW);
  delay(500);
  Serial.println("Hello from Code2MC!");
}
`;

const $ = (s) => document.querySelector(s);
const consoleEl = $("#console");
function log(msg, cls = "") {
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = msg;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

let editor, currentSketch = "sketch";

/* Monaco */
require.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" } });
require(["vs/editor/editor.main"], () => {
  monaco.languages.register({ id: "arduino" });
  monaco.languages.setMonarchTokensProvider("arduino", {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string"],
        [/\b(void|int|long|float|double|char|bool|boolean|byte|const|static|unsigned|signed|short|if|else|for|while|do|switch|case|break|continue|return|struct|class|public|private|protected|new|delete|true|false|NULL)\b/, "keyword"],
        [/\b(setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|delayMicroseconds|Serial|millis|micros|map|constrain|min|max|abs|attachInterrupt|detachInterrupt|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|LED_BUILTIN)\b/, "type.identifier"],
        [/#\s*\w+/, "keyword.directive"],
        [/\b\d+(\.\d+)?\b/, "number"],
      ],
      comment: [[/[^\/*]+/, "comment"], [/\*\//, "comment", "@pop"], [/./, "comment"]],
      string: [[/[^\\"]+/, "string"], [/\\./, "string.escape"], [/"/, "string", "@pop"]],
    },
  });

  editor = monaco.editor.create($("#editor"), {
    value: DEFAULT_SKETCH,
    language: "arduino",
    theme: "vs-dark",
    fontSize: 14,
    minimap: { enabled: false },
    automaticLayout: true,
    tabSize: 2,
  });

  // autosave
  editor.onDidChangeModelContent(debounce(saveCurrent, 600));
});

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  return r.json();
}

/* Boards */
async function loadBoards() {
  const boards = await api("/api/boards");
  const sel = $("#boardSelect");
  sel.innerHTML = boards.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
}

/* Ports */
async function loadPorts() {
  const { ports = [] } = await api("/api/ports");
  const sel = $("#portSelect");
  sel.innerHTML = `<option value="">— port —</option>` +
    ports.map(p => `<option value="${p.address}">${p.label || p.address}</option>`).join("");
  log(`Detected ${ports.length} port(s).`, "dim");
}

/* Files */
async function loadFiles() {
  const { sketches = [] } = await api("/api/files");
  if (!sketches.includes("sketch")) sketches.unshift("sketch");
  const ul = $("#fileList");
  ul.innerHTML = sketches.map(n =>
    `<li data-name="${n}" class="${n === currentSketch ? "active" : ""}">${n}.ino</li>`
  ).join("");
  ul.querySelectorAll("li").forEach(li => {
    li.onclick = () => openSketch(li.dataset.name);
  });
}

async function openSketch(name) {
  currentSketch = name;
  const { code } = await api(`/api/files/${encodeURIComponent(name)}`);
  if (editor) editor.setValue(code || DEFAULT_SKETCH);
  loadFiles();
}

async function saveCurrent() {
  if (!editor) return;
  await api(`/api/files/${encodeURIComponent(currentSketch)}`, {
    method: "POST",
    body: JSON.stringify({ code: editor.getValue() }),
  });
}

/* Compile / Upload */
async function verify() {
  await saveCurrent();
  log(`\n▶ Compiling for ${$("#boardSelect").value}...`, "dim");
  const res = await api("/api/compile", {
    method: "POST",
    body: JSON.stringify({
      code: editor.getValue(),
      board: $("#boardSelect").value,
      sketchName: currentSketch,
    }),
  });
  if (res.stdout) log(res.stdout);
  if (res.stderr) log(res.stderr, res.ok ? "warn" : "err");
  log(res.ok ? "✔ Compile successful." : "✖ Compile failed.", res.ok ? "ok" : "err");
  if (!res.ok && res.missingHeader) offerAutoInstall(res.missingHeader);
}

async function upload() {
  await saveCurrent();
  const port = $("#portSelect").value;
  if (!port) { log("Select a port first.", "warn"); return; }
  log(`\n▶ Uploading to ${port}...`, "dim");
  const res = await api("/api/upload", {
    method: "POST",
    body: JSON.stringify({
      code: editor.getValue(),
      board: $("#boardSelect").value,
      port,
      sketchName: currentSketch,
    }),
  });
  if (res.stdout) log(res.stdout);
  if (res.stderr) log(res.stderr, res.ok ? "warn" : "err");
  log(res.ok ? "✔ Upload complete." : `✖ ${res.stage || "Upload"} failed.`, res.ok ? "ok" : "err");
  if (!res.ok && res.missingHeader) offerAutoInstall(res.missingHeader);
}

/* Auto-install missing lib */
function offerAutoInstall(headerFile) {
  const guess = headerFile.replace(/\.h$/, "");
  showConfirm(
    `Missing library`,
    `The sketch references "${headerFile}" which isn't installed. Search & install a library matching "${guess}"?`,
    async () => {
      log(`\n▶ Searching for "${guess}"...`, "dim");
      const { libraries = [] } = await api(`/api/lib/search?q=${encodeURIComponent(guess)}`);
      if (!libraries.length) { log("No matching library found.", "err"); return; }
      const first = libraries[0].name;
      log(`Installing "${first}"...`, "dim");
      const r = await api("/api/lib/install", { method: "POST", body: JSON.stringify({ name: first }) });
      log(r.stdout || "", "");
      if (r.stderr) log(r.stderr, r.ok ? "warn" : "err");
      log(r.ok ? `✔ Installed ${first}. Try compiling again.` : "✖ Install failed.", r.ok ? "ok" : "err");
      loadInstalled();
    }
  );
}

/* Library Manager */
async function searchLibs() {
  const q = $("#libQuery").value.trim();
  if (!q) return;
  $("#libResults").innerHTML = `<div class="dim" style="padding:8px;color:var(--muted)">Searching...</div>`;
  const { libraries = [] } = await api(`/api/lib/search?q=${encodeURIComponent(q)}`);
  renderLibList($("#libResults"), libraries.slice(0, 25), "install");
}

async function loadInstalled() {
  const { libraries = [] } = await api("/api/lib/list");
  renderLibList($("#libInstalled"), libraries, "uninstall");
}

function renderLibList(container, libs, mode) {
  if (!libs.length) {
    container.innerHTML = `<div style="padding:8px;color:var(--muted);font-size:12px">Nothing here.</div>`;
    return;
  }
  container.innerHTML = "";
  libs.forEach(l => {
    const el = document.createElement("div");
    el.className = "lib-item";
    el.innerHTML = `
      <div class="row">
        <div><span class="name">${escapeHtml(l.name)}</span> <span class="ver">${escapeHtml(l.latest || l.version || "")}</span></div>
        <button>${mode === "install" ? "Install" : "Uninstall"}</button>
      </div>
      ${l.sentence || l.author ? `<div class="desc">${escapeHtml(l.sentence || l.author)}</div>` : ""}
    `;
    el.querySelector("button").onclick = async () => {
      const url = mode === "install" ? "/api/lib/install" : "/api/lib/uninstall";
      log(`\n▶ ${mode === "install" ? "Installing" : "Uninstalling"} "${l.name}"...`, "dim");
      const r = await api(url, { method: "POST", body: JSON.stringify({ name: l.name }) });
      if (r.stdout) log(r.stdout);
      if (r.stderr) log(r.stderr, r.ok ? "warn" : "err");
      log(r.ok ? "✔ Done." : "✖ Failed.", r.ok ? "ok" : "err");
      loadInstalled();
    };
    container.appendChild(el);
  });
}

function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* Modal */
function showConfirm(title, msg, onYes) {
  $("#confirmTitle").textContent = title;
  $("#confirmMsg").textContent = msg;
  $("#confirmModal").hidden = false;
  $("#confirmYes").onclick = () => { $("#confirmModal").hidden = true; onYes(); };
  $("#confirmNo").onclick = () => { $("#confirmModal").hidden = true; };
}

/* Wire up */
window.addEventListener("DOMContentLoaded", async () => {
  await loadBoards();
  await loadPorts();
  await loadFiles();
  await openSketch("sketch");
  loadInstalled();

  $("#refreshPorts").onclick = loadPorts;
  $("#verifyBtn").onclick = verify;
  $("#uploadBtn").onclick = upload;
  $("#libSearchBtn").onclick = searchLibs;
  $("#libQuery").addEventListener("keydown", e => { if (e.key === "Enter") searchLibs(); });
  $("#clearConsole").onclick = () => (consoleEl.innerHTML = "");
  $("#libToggle").onclick = () => {
    const p = $("#libraryPanel");
    p.classList.toggle("hidden");
    document.querySelector(".workspace").classList.toggle("no-lib", p.classList.contains("hidden"));
  };
  $("#newSketchBtn").onclick = async () => {
    const name = prompt("New sketch name:", "my_sketch");
    if (!name) return;
    currentSketch = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (editor) editor.setValue(DEFAULT_SKETCH);
    await saveCurrent();
    loadFiles();
  };

  log("Code2MC ready. Made by Atharva Phadnis.", "ok");
});
