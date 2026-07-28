/**
 * Code2MC backend
 * Made by Atharva Phadnis
 */
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const SKETCH_ROOT = path.join(__dirname, "..", "sketches");
if (!fs.existsSync(SKETCH_ROOT)) fs.mkdirSync(SKETCH_ROOT, { recursive: true });

const BOARDS = [
  { id: "uno",   name: "Arduino Uno",         fqbn: "arduino:avr:uno" },
  { id: "esp32", name: "ESP32 Dev Module",    fqbn: "esp32:esp32:esp32" },
  { id: "pico",  name: "Raspberry Pi Pico",   fqbn: "rp2040:rp2040:rpipico" },
];

function run(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(cmd, { maxBuffer: 20 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? err.code || 1 : 0, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

function shellQuote(s) {
  if (process.platform === "win32") return `"${String(s).replace(/"/g, '""')}"`;
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function ensureSketchDir(name) {
  const safe = (name || "sketch").replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(SKETCH_ROOT, safe);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { dir, name: safe, inoPath: path.join(dir, `${safe}.ino`) };
}

/* ---------------- Boards & Ports ---------------- */

app.get("/api/boards", (_req, res) => res.json(BOARDS));

app.get("/api/ports", async (_req, res) => {
  const r = await run("arduino-cli board list --format json");
  if (!r.ok && !r.stdout) return res.json({ ports: [], error: r.stderr });
  try {
    const data = JSON.parse(r.stdout);
    const list = (data.detected_ports || data || []).map((p) => {
      const port = p.port || p;
      return {
        address: port.address || port.name || "",
        protocol: port.protocol || "",
        label: port.label || port.address || "",
      };
    }).filter(p => p.address);
    res.json({ ports: list });
  } catch {
    res.json({ ports: [], raw: r.stdout, error: r.stderr });
  }
});

/* ---------------- Files ---------------- */

app.get("/api/files", (_req, res) => {
  const entries = fs.readdirSync(SKETCH_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  res.json({ sketches: entries });
});

app.get("/api/files/:name", (req, res) => {
  const { inoPath, name } = ensureSketchDir(req.params.name);
  const code = fs.existsSync(inoPath) ? fs.readFileSync(inoPath, "utf8") : "";
  res.json({ name, code });
});

app.post("/api/files/:name", (req, res) => {
  const { inoPath, name } = ensureSketchDir(req.params.name);
  fs.writeFileSync(inoPath, req.body.code ?? "", "utf8");
  res.json({ ok: true, name });
});

/* ---------------- Compile / Upload ---------------- */

function fqbnFor(boardId) {
  const b = BOARDS.find(b => b.id === boardId || b.fqbn === boardId);
  return b ? b.fqbn : boardId;
}

async function writeSketch(sketchName, code) {
  const s = ensureSketchDir(sketchName);
  fs.writeFileSync(s.inoPath, code ?? "", "utf8");
  return s;
}

// detect a missing include from CLI stderr:  fatal error: DHT.h: No such file or directory
function detectMissingHeader(output) {
  const m = output.match(/([A-Za-z0-9_.\-]+\.h):\s*No such file or directory/);
  return m ? m[1] : null;
}

app.post("/api/compile", async (req, res) => {
  const { code, board, sketchName } = req.body || {};
  const s = await writeSketch(sketchName || "sketch", code);
  const fqbn = fqbnFor(board || "uno");
  const r = await run(`arduino-cli compile --fqbn ${shellQuote(fqbn)} ${shellQuote(s.dir)}`);
  const missing = !r.ok ? detectMissingHeader(r.stderr + r.stdout) : null;
  res.json({ ok: r.ok, stdout: r.stdout, stderr: r.stderr, missingHeader: missing });
});

app.post("/api/upload", async (req, res) => {
  const { code, board, port, sketchName } = req.body || {};
  if (!port) return res.json({ ok: false, stderr: "No port selected." });
  const s = await writeSketch(sketchName || "sketch", code);
  const fqbn = fqbnFor(board || "uno");
  const compile = await run(`arduino-cli compile --fqbn ${shellQuote(fqbn)} ${shellQuote(s.dir)}`);
  if (!compile.ok) {
    return res.json({
      ok: false, stage: "compile",
      stdout: compile.stdout, stderr: compile.stderr,
      missingHeader: detectMissingHeader(compile.stderr + compile.stdout),
    });
  }
  const up = await run(`arduino-cli upload -p ${shellQuote(port)} --fqbn ${shellQuote(fqbn)} ${shellQuote(s.dir)}`);
  res.json({ ok: up.ok, stage: "upload", stdout: compile.stdout + "\n" + up.stdout, stderr: up.stderr });
});

/* ---------------- Library Manager ---------------- */

app.get("/api/lib/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ libraries: [] });
  const r = await run(`arduino-cli lib search ${shellQuote(q)} --format json`);
  try {
    const data = JSON.parse(r.stdout || "{}");
    const libs = (data.libraries || []).map(l => ({
      name: l.name,
      latest: (l.latest && l.latest.version) || (l.releases && Object.keys(l.releases).pop()) || "",
      author: (l.latest && l.latest.author) || "",
      sentence: (l.latest && (l.latest.sentence || l.latest.paragraph)) || "",
    }));
    res.json({ libraries: libs });
  } catch {
    res.json({ libraries: [], error: r.stderr, raw: r.stdout });
  }
});

app.get("/api/lib/list", async (_req, res) => {
  const r = await run(`arduino-cli lib list --format json`);
  try {
    const data = JSON.parse(r.stdout || "[]");
    const arr = Array.isArray(data) ? data : (data.installed_libraries || data.libraries || []);
    const libs = arr.map(item => {
      const lib = item.library || item;
      return {
        name: lib.name || lib.real_name || "",
        version: lib.version || "",
        author: lib.author || "",
      };
    }).filter(l => l.name);
    res.json({ libraries: libs });
  } catch {
    res.json({ libraries: [], error: r.stderr });
  }
});

app.post("/api/lib/install", async (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (!name) return res.json({ ok: false, stderr: "Missing library name" });
  const r = await run(`arduino-cli lib install ${shellQuote(name)}`);
  res.json({ ok: r.ok, stdout: r.stdout, stderr: r.stderr });
});

app.post("/api/lib/uninstall", async (req, res) => {
  const name = String((req.body || {}).name || "").trim();
  if (!name) return res.json({ ok: false, stderr: "Missing library name" });
  const r = await run(`arduino-cli lib uninstall ${shellQuote(name)}`);
  res.json({ ok: r.ok, stdout: r.stdout, stderr: r.stderr });
});

/* ---------------- Core install helpers ---------------- */

app.post("/api/core/install", async (req, res) => {
  const core = String((req.body || {}).core || "").trim();
  if (!core) return res.json({ ok: false, stderr: "Missing core" });
  const r = await run(`arduino-cli core install ${shellQuote(core)}`);
  res.json({ ok: r.ok, stdout: r.stdout, stderr: r.stderr });
});

/* ---------------- Start ---------------- */

app.listen(PORT, () => {
  console.log(`\n  🚀 Code2MC running at http://localhost:${PORT}`);
  console.log(`  Made by Atharva Phadnis\n`);
});
