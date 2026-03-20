const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const multer = require("multer");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 3000;
const PYTHON_BIN = process.env.PYTHON_BIN || "python"; // chỉnh thành ./.venv/Scripts/python.exe nếu cần
const WEIGHTS_PATH = process.env.WEIGHTS_PATH || path.join(ROOT, "ai_model", "best.pt");
const UNET_PATH = process.env.UNET_PATH || path.join(ROOT, "ai_model", "unet_breast.pth");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const CLI_PATH = path.join(ROOT, "ai_model", "cli_infer.py");
const MONGO_URI = process.env.MONGO_URI || null;
const MONGO_DB = process.env.MONGO_DB || "breast_ai";
const MONGO_DOCTOR_COLLECTION = process.env.MONGO_DOCTOR_COLLECTION || "doctors";

const uploadDir = path.join(os.tmpdir(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
app.use(express.json());

// Bắt buộc đăng nhập theo yêu cầu; có thể tắt bằng cách set AUTH_REQUIRED=false
const AUTH_REQUIRED = (process.env.AUTH_REQUIRED || "true").toLowerCase() === "true";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// Token store: token -> { user, role }
const activeTokens = new Map();
// In-memory doctor accounts (username -> password). Used khi không cấu hình MongoDB.
const doctorAccounts = new Map();

let mongoClient = null;
let doctorCollection = null;

function requireAuth(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  const token = auth.slice("Bearer ".length);
  const session = activeTokens.get(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid token" });
  }
  req.user = session.user;
  req.role = session.role;
  return next();
}

function requireAdmin(req, res, next) {
  if (!AUTH_REQUIRED) return res.status(403).json({ error: "Auth disabled, admin guard not available" });
  if (req.role !== "admin") return res.status(403).json({ error: "Admin only" });
  return next();
}

async function getDoctorCollection() {
  if (!MONGO_URI) return null;
  if (doctorCollection) return doctorCollection;
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  doctorCollection = mongoClient.db(MONGO_DB).collection(MONGO_DOCTOR_COLLECTION);
  await doctorCollection.createIndex({ username: 1 }, { unique: true });
  return doctorCollection;
}

async function findDoctor(username) {
  const col = await getDoctorCollection();
  if (col) return col.findOne({ username });
  if (doctorAccounts.has(username)) return { username, password: doctorAccounts.get(username) };
  return null;
}

async function createDoctor(username, password) {
  const col = await getDoctorCollection();
  if (col) {
    await col.insertOne({ username, password, created_at: new Date() });
    return;
  }
  doctorAccounts.set(username, password);
}

function runPythonInference(imagePath) {
  return new Promise((resolve, reject) => {
    const args = [CLI_PATH, "--file", imagePath, "--weights", WEIGHTS_PATH];
    if (UNET_PATH) args.push("--unet", UNET_PATH);

    const child = spawn(PYTHON_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });

    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || stdout || `Python exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Không parse được JSON từ Python: ${err.message}; output=${stdout}`));
      }
    });
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", weights: WEIGHTS_PATH, unet: UNET_PATH, python: PYTHON_BIN, auth_required: AUTH_REQUIRED });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  let role = null;

  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    role = "admin";
  } else {
    const doctor = await findDoctor(username);
    if (doctor && doctor.password === password) role = "doctor";
  }

  if (!role) return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

  const token = crypto.randomUUID();
  activeTokens.set(token, { user: username, role });
  return res.json({ token, user: username, role, auth_required: AUTH_REQUIRED });
});

app.post("/api/admin/users", requireAuth, requireAdmin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Thiếu username hoặc password" });
  if (password.length < 6) return res.status(400).json({ error: "Mật khẩu phải >= 6 ký tự" });
  if (username === ADMIN_USER) return res.status(400).json({ error: "Không thể ghi đè tài khoản admin" });

  const existing = await findDoctor(username);
  if (existing) return res.status(400).json({ error: "Tài khoản đã tồn tại" });

  await createDoctor(username, password);
  return res.json({ ok: true, username });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user, role: req.role });
});

app.post("/api/predict", upload.single("file"), async (req, res) => {
  if (AUTH_REQUIRED) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Yêu cầu đăng nhập" });
    }
    const token = auth.slice("Bearer ".length);
    if (!activeTokens.has(token)) {
      return res.status(401).json({ error: "Yêu cầu đăng nhập" });
    }
  }

  if (!req.file) {
    return res.status(400).json({ error: "Thiếu file ảnh (multipart field 'file')" });
  }

  const patient = {
    name: req.body?.patient_name || null,
    id: req.body?.patient_id || null,
    gender: req.body?.patient_gender || null,
    age: req.body?.patient_age || null,
  };

  // Ultralytics không nhận file không có phần mở rộng, nên thêm ext từ tên gốc
  const origExt = path.extname(req.file.originalname || "") || ".png";
  const tempPathWithExt = `${req.file.path}${origExt}`;
  fs.renameSync(req.file.path, tempPathWithExt);

  try {
    const result = await runPythonInference(tempPathWithExt);
    const hasPatient = Object.values(patient).some((v) => v !== null && v !== "");
    if (hasPatient) result.patient = patient;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(tempPathWithExt, () => {});
  }
});

app.use("/static", express.static(FRONTEND_DIR));
app.get("*", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Node server listening on port ${PORT}`);
});
