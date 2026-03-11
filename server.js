const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8787;
const DATA_DIR = path.join(__dirname, "data");

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

const ALLOWED_FILES = new Set([
  "history.json",
  "validators.json",
  "potential-partners.json",
  "infra-costs.json",
  "competitors.json",
]);

function sanitizeFilename(name) {
  const base = path.basename(name);
  if (!ALLOWED_FILES.has(base)) return null;
  return base;
}

app.get("/api/data/:file", (req, res) => {
  const file = sanitizeFilename(req.params.file);
  if (!file) return res.status(400).json({ error: "Invalid file" });

  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return res.json([]);

  try {
    const data = JSON.parse(fs.readFileSync(fp, "utf8"));
    res.json(data);
  } catch {
    res.json([]);
  }
});

app.post("/api/data/:file", (req, res) => {
  const file = sanitizeFilename(req.params.file);
  if (!file) return res.status(400).json({ error: "Invalid file" });

  const fp = path.join(DATA_DIR, file);
  try {
    fs.writeFileSync(fp, JSON.stringify(req.body, null, 2) + "\n");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`DSRV Dashboard running at http://localhost:${PORT}`);
});
