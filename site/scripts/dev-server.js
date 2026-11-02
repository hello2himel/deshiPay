#!/usr/bin/env node
/*
 * Tiny zero-dependency dev server that mimics netlify.toml's routing:
 *   /app          -> /app.html
 *   /<username>   -> /pay.html   (single segment, no matching file)
 *
 * Usage: npm run dev   (PORT=8888 by default)
 * If you have the Netlify CLI, `netlify dev` does the same and more.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT) || 8888;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon"
};

function resolve(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p === "/") p = "/index.html";
  const abs = path.normalize(path.join(root, p));
  if (!abs.startsWith(root)) return null;
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  if (p === "/app") return path.join(root, "app.html");
  if (p === "/favicon.ico") return path.join(root, "favicon.svg");
  const pretty = { "/login": "login.html", "/terms": "terms.html", "/privacy": "privacy.html", "/contact": "contact.html", "/deshipay": "deshipay.html" };
  if (pretty[p]) return path.join(root, pretty[p]);
  if (/^\/[^/.]+\/?$/.test(p)) return path.join(root, "pay.html");
  return null;
}

http
  .createServer((req, res) => {
    const file = resolve(req.url);
    if (!file) {
      const nf = path.join(root, "404.html");
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : "Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log("DeshiQR dev server: http://localhost:" + port));
