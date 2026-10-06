// ErgoAssist Pro – Server (ohne Abhaengigkeiten, Node >= 18)
// - liefert die Web-App aus
// - speichert Daten dauerhaft in /data (Docker-Volume) -> geraeteuebergreifend
// - leitet /ollama/* an die lokale KI weiter (kein CORS-Problem)
// - optional: Passwortschutz (ACCESS_PASSWORD)
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = +process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || "/data";
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const OLLAMA = (process.env.OLLAMA_URL || "http://ollama:11434").replace(/\/$/, "");
const PASSWORD = process.env.ACCESS_PASSWORD || "";
const KEYS = new Set(["ergoassist_patients", "ergoassist_settings"]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".txt": "text/plain" };

fs.mkdirSync(path.join(DATA_DIR, "backups"), { recursive: true });
const file = k => path.join(DATA_DIR, k + ".json");

function authorized(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const pass = Buffer.from(h.slice(6), "base64").toString().split(":").slice(1).join(":");
  return pass === PASSWORD;
}

// Atomar schreiben + taeglich ein Backup (letzte 14 behalten)
function save(k, body) {
  const f = file(k), tmp = f + ".tmp";
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, f);
  const day = new Date().toISOString().slice(0, 10);
  const b = path.join(DATA_DIR, "backups", `${k}_${day}.json`);
  fs.writeFileSync(b, body);
  const old = fs.readdirSync(path.join(DATA_DIR, "backups")).filter(n => n.startsWith(k + "_")).sort().slice(0, -14);
  old.forEach(n => fs.unlinkSync(path.join(DATA_DIR, "backups", n)));
}

function proxyOllama(req, res) {
  const target = new URL(OLLAMA + req.url.replace(/^\/ollama/, ""));
  const headers = { ...req.headers, host: target.host };
  delete headers.origin; delete headers.referer; delete headers.authorization; // sonst lehnt Ollama (CORS) ab
  const p = http.request(target, { method: req.method, headers }, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  p.on("error", () => { res.writeHead(502); res.end("Ollama nicht erreichbar"); });
  req.on("close", () => p.destroy());
  req.pipe(p);
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") { res.writeHead(200); return res.end("ok"); }
  if (!authorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="ErgoAssist Pro"' });
    return res.end("Login erforderlich");
  }
  if (url.pathname.startsWith("/ollama/")) return proxyOllama(req, res);

  if (url.pathname.startsWith("/api/data/")) {
    const k = url.pathname.slice(10);
    if (!KEYS.has(k)) { res.writeHead(404); return res.end(); }
    if (req.method === "GET") {
      if (!fs.existsSync(file(k))) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return fs.createReadStream(file(k)).pipe(res);
    }
    if (req.method === "PUT") {
      const chunks = []; let size = 0;
      req.on("data", c => { size += c.length; if (size > 50e6) req.destroy(); else chunks.push(c); });
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString();
          JSON.parse(body); // nur gueltiges JSON speichern
          save(k, body);
          res.writeHead(204); res.end();
        } catch { res.writeHead(400); res.end("Ungueltige Daten"); }
      });
      return;
    }
    res.writeHead(405); return res.end();
  }

  // Statische Dateien
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); return res.end("Nicht gefunden"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(full).pipe(res);
}).listen(PORT, () => console.log(`ErgoAssist Pro laeuft auf Port ${PORT}, Daten in ${DATA_DIR}, KI: ${OLLAMA}`));
