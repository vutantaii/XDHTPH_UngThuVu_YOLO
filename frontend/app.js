const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("uploadForm");
const progress = document.getElementById("progress");
const progressLabel = document.getElementById("progressLabel");
const previewImg = document.getElementById("previewImg");
const overlay = document.getElementById("overlay");
const boxesEl = document.getElementById("boxes");
const metaEl = document.getElementById("meta");
const diagnosisEl = document.getElementById("diagnosis");
const conclusionEl = document.getElementById("conclusion");
const adviceEl = document.getElementById("advice");
const patientName = document.getElementById("patientName");
const patientAge = document.getElementById("patientAge");
const patientId = document.getElementById("patientId");
const patientGender = document.getElementById("patientGender");
const diagnoseBtn = document.getElementById("diagnoseBtn");
const exportBtn = document.getElementById("exportPdfBtn");
const navLinks = document.querySelectorAll(".topbar a[data-section]");
const sections = {
  home: document.getElementById("home"),
  diagnose: document.getElementById("diagnose"),
  model: document.getElementById("model"),
  auth: document.getElementById("auth"),
};
const navAuthLink = document.getElementById("navAuthLink");
const homeInfo = document.getElementById("home-info");
const heroCtas = document.querySelectorAll(".btn[data-go]");

const authUser = document.getElementById("authUser");
const authPass = document.getElementById("authPass");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");
const togglePass = document.getElementById("togglePass");
const doctorUser = document.getElementById("doctorUser");
const doctorPass = document.getElementById("doctorPass");
const createDoctorBtn = document.getElementById("createDoctorBtn");
const adminDoctorCard = document.getElementById("adminDoctorCard");
const adminDoctorStatus = document.getElementById("adminDoctorStatus");

let selectedFile = null;
// Không lưu token vào localStorage để mỗi lần mở lại phải đăng nhập
let authToken = null;
let authRole = null;
let authMode = "login"; // "login" | "register"
let lastPrediction = null;
let jsPdfLib = null;
let jsPdfLoading = null;
let jsPdfAutoTable = null;
let jsPdfAutoTableLoading = null;
let vnFontReady = false;
let vnFontLoading = null;
let vnFontFailed = false;

function updateDiagnoseButtonState() {
  if (!diagnoseBtn) return;
  diagnoseBtn.disabled = !(selectedFile && authToken);
}

function setAuthStatus(text, ok = false) {
  if (!authStatus) return;
  authStatus.textContent = text;
  authStatus.style.color = ok ? "#2dd4bf" : "var(--muted)";
}

function setAdminDoctorStatus(text, ok = false) {
  if (!adminDoctorStatus) return;
  adminDoctorStatus.textContent = text;
  adminDoctorStatus.style.color = ok ? "#2dd4bf" : "var(--muted)";
}

function setAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById("authTitle");
  if (title) title.textContent = mode === "login" ? "Đăng nhập" : "Đăng ký";
  if (loginBtn) loginBtn.textContent = mode === "login" ? "Đăng nhập" : "Đăng ký";
}

function persistToken(token) {
  authToken = token;
  if (!token) authRole = null;
  if (logoutBtn) logoutBtn.disabled = !token;
  syncNavAuth();
  updateDiagnoseButtonState();
}

function syncNavAuth() {
  if (!navAuthLink) return;
  navAuthLink.textContent = authToken ? "Đăng xuất" : "Đăng nhập";
}

function updateAdminUi() {
  if (!adminDoctorCard) return;
  if (authRole === "admin") {
    adminDoctorCard.classList.remove("section-hidden");
  } else {
    adminDoctorCard.classList.add("section-hidden");
  }
}

function showProgress(show, label = "Đang tải...") {
  progress.hidden = !show;
  progressLabel.textContent = label;
}

function colorFor(idx) {
  const palette = ["#00e0b8", "#ff7e5f", "#6dd3ff", "#f9d423"];
  return palette[idx % palette.length];
}

function drawBoxes(prediction) {
  const ctx = overlay.getContext("2d");
  const { boxes, image } = prediction;
  if (!image || !image.width || !image.height) return;

  const scaleX = previewImg.clientWidth / image.width;
  const scaleY = previewImg.clientHeight / image.height;

  overlay.width = previewImg.clientWidth;
  overlay.height = previewImg.clientHeight;

  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.lineWidth = 2;
  ctx.font = "13px 'Space Grotesk', sans-serif";

  boxes.forEach((box, idx) => {
    const color = colorFor(idx);
    const [x1, y1, x2, y2] = box.xyxy;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;
    const x = x1 * scaleX;
    const y = y1 * scaleY;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x, y, w, h);

    const label = `${box.class_name || box.class_id} ${(box.confidence * 100).toFixed(1)}%`;
    const textWidth = ctx.measureText(label).width + 10;
    const textHeight = 18;
    ctx.fillRect(x, Math.max(0, y - textHeight - 2), textWidth, textHeight);
    ctx.fillStyle = "#0b1021";
    ctx.fillText(label, x + 5, Math.max(12, y - 6));
  });
}

function renderBoxes(prediction) {
  boxesEl.innerHTML = "";
  if (!prediction.boxes || prediction.boxes.length === 0) {
    boxesEl.innerHTML = '<p class="small">Không phát hiện bất thường.</p>';
    return;
  }

  prediction.boxes.forEach((box, idx) => {
    const div = document.createElement("div");
    div.className = "box-card";
    div.innerHTML = `
      <div>
        <strong style="color:${colorFor(idx)}">${box.class_name || box.class_id}</strong>
        <p class="small">Score: ${(box.confidence * 100).toFixed(1)}%</p>
      </div>
      <div class="small">${box.xyxy.map(v => v.toFixed(1)).join(", ")}</div>
    `;
    boxesEl.appendChild(div);
  });
}

function renderMeta(prediction) {
  if (!prediction.image) return;
  const patient = prediction.patient || {};
  const boxes = prediction.boxes || [];
  const parts = [];
  if (patient.name) parts.push(`BN: ${patient.name}`);
  if (patient.id) parts.push(`HS: ${patient.id}`);
  if (patient.age) parts.push(`Tuổi: ${patient.age}`);
  if (patient.gender) parts.push(`Giới tính: ${formatGender(patient.gender)}`);
  parts.push(`${prediction.image.width} x ${prediction.image.height}`);
  parts.push(`${boxes.length} box`);
  metaEl.textContent = parts.join(" · ");
}

function renderDiagnosis(prediction) {
  if (!diagnosisEl) return;
  diagnosisEl.innerHTML = "";

  if (prediction.diagnosis_error) {
    diagnosisEl.innerHTML = `<div class="diagnosis-card"><span class="diagnosis-error">Không thể chạy phân loại: ${prediction.diagnosis_error}</span></div>`;
    return;
  }

  const diag = prediction.diagnosis;
  if (!diag || !diag.label) return;

  const score = typeof diag.confidence === "number" ? `${(diag.confidence * 100).toFixed(1)}%` : "--";
  const label = diag.label.charAt(0).toUpperCase() + diag.label.slice(1);

  const labelLower = diag.label.toLowerCase();
  let toneClass = "";
  if (labelLower.includes("bình")) toneClass = "diag-normal";
  else if (labelLower.includes("lành")) toneClass = "diag-benign";
  else if (labelLower.includes("ác")) toneClass = "diag-malignant";

  diagnosisEl.innerHTML = `
    <div class="diagnosis-card">
      <div>
        <div class="diagnosis-label ${toneClass}">Kết luận: ${label}</div>
        <div class="diagnosis-score">Độ tin cậy: ${score}</div>
      </div>
    </div>
  `;
}

function buildSummary(diagnosis, prediction) {
  const labelLower = (diagnosis?.label || "").toLowerCase();
  const patient = prediction?.patient || {};
  const name = patient.name || patientName.value.trim() || "Bệnh nhân";

  if (labelLower.includes("ác")) {
    return {
      conclusion: `${name} có tổn thương nghi ngờ ác tính.`,
      advice: "Cần tham khảo bác sĩ chuyên khoa, cân nhắc sinh thiết hoặc chẩn đoán hình ảnh bổ sung trong thời gian sớm nhất.",
    };
  }
  if (labelLower.includes("lành")) {
    return {
      conclusion: `${name} có tổn thương gợi ý lành tính.`,
      advice: "Khuyến nghị tái khám hoặc siêu âm kiểm tra sau 3-6 tháng và theo dõi triệu chứng lâm sàng.",
    };
  }
  if (labelLower.includes("bình")) {
    return {
      conclusion: `${name} không phát hiện dấu hiệu nghi ngờ.`,
      advice: "Tiếp tục tầm soát định kỳ, duy trì lối sống lành mạnh và báo bác sĩ nếu xuất hiện triệu chứng mới.",
    };
  }
  return {
    conclusion: `${name}: chưa đủ dữ liệu để kết luận rõ ràng.`,
    advice: "Cân nhắc chụp lặp lại hoặc tham khảo ý kiến chuyên gia nếu nghi ngờ lâm sàng còn tồn tại.",
  };
}

function formatGender(gender) {
  const v = (gender || "").trim().toLowerCase();
  if (["male", "nam", "m"].includes(v)) return "nam";
  if (["female", "nu", "nữ", "f"].includes(v)) return "nữ";
  return gender || "--";
}

function renderSummary(prediction) {
  if (!conclusionEl || !adviceEl) return;
  const diag = prediction?.diagnosis;
  if (!diag) {
    conclusionEl.textContent = "Chưa có kết luận.";
    adviceEl.textContent = "Hãy chạy chẩn đoán để nhận khuyến nghị.";
    return;
  }
  const { conclusion, advice } = buildSummary(diag, prediction);
  conclusionEl.textContent = conclusion;
  adviceEl.textContent = advice;
}

function loadJsPdf() {
  if (jsPdfLib) return Promise.resolve(jsPdfLib);
  if (jsPdfLoading) return jsPdfLoading;
  jsPdfLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
    script.onload = () => {
      jsPdfLib = window.jspdf;
      resolve(jsPdfLib);
    };
    script.onerror = () => reject(new Error("Không tải được jsPDF"));
    document.head.appendChild(script);
  });
  return jsPdfLoading;
}

function loadJsPdfAutoTable() {
  if (jsPdfAutoTable) return Promise.resolve(jsPdfAutoTable);
  if (jsPdfAutoTableLoading) return jsPdfAutoTableLoading;
  jsPdfAutoTableLoading = loadJsPdf().then(() => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js";
    script.onload = () => {
      // Đảm bảo plugin gắn vào jsPDF trước khi dùng
      jsPdfAutoTable = true;
      resolve(true);
    };
    script.onerror = () => reject(new Error("Không tải được jsPDF-AutoTable"));
    document.head.appendChild(script);
  }));
  return jsPdfAutoTableLoading;
}

async function ensureVietnameseFont(doc) {
  // Nhúng Noto Sans; nếu tải font lỗi sẽ fallback Helvetica để tránh crash AutoTable
  if (vnFontReady) {
    doc.setFont("NotoSans", "normal");
    return;
  }
  if (vnFontLoading) {
    await vnFontLoading;
    doc.setFont(vnFontReady ? "NotoSans" : "helvetica", "normal");
    return;
  }

  const fontUrls = [
    "/static/fonts/NotoSans-Regular.ttf", // ưu tiên font nội bộ để không phụ thuộc internet
    "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
  ];

  vnFontLoading = (async () => {
    let buf = null;
    for (const url of fontUrls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        buf = await res.arrayBuffer();
        break;
      } catch (err) {
        // thử URL kế tiếp nếu lỗi
      }
    }

    if (!buf) throw new Error("Không tải được font NotoSans");

    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const b64 = btoa(binary);
    doc.addFileToVFS("NotoSans-Regular.ttf", b64);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    vnFontReady = true;
    vnFontFailed = false;
    doc.setFont("NotoSans", "normal");
  })().catch(() => {
    vnFontReady = false;
    vnFontFailed = true;
  });

  await vnFontLoading;
  if (vnFontReady) {
    doc.setFont("NotoSans", "normal");
  } else {
    doc.setFont("helvetica", "normal");
  }
}

async function exportPdf() {
  if (!lastPrediction || !lastPrediction.diagnosis) {
    alert("Chưa có kết quả để xuất PDF.");
    return;
  }

  try {
    const lib = await loadJsPdf();
    await loadJsPdfAutoTable();
    if (!lib || !lib.jsPDF || !lib.jsPDF.API.autoTable) throw new Error("jsPDF chưa sẵn sàng");

    const diag = lastPrediction.diagnosis;
    const summary = buildSummary(diag, lastPrediction);
    const patient = lastPrediction.patient || {
      name: patientName.value.trim() || "(không cung cấp)",
      age: patientAge.value.trim() || "--",
      id: patientId.value.trim() || "--",
      gender: formatGender(patientGender.value.trim() || "--"),
    };
    const boxesCount = (lastPrediction.boxes || []).length;
    const score = typeof diag.confidence === "number" ? `${(diag.confidence * 100).toFixed(1)}%` : "--";
    const now = new Date().toLocaleString("vi-VN");

    const doc = new lib.jsPDF();
    await ensureVietnameseFont(doc);

    // Header
    doc.setTextColor(83, 69, 172);
    doc.setFontSize(18);
    doc.text("Báo Cáo Chẩn Đoán", 14, 16);
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(11);
    doc.text("Tổng hợp kết quả chẩn đoán hỗ trợ quyết định lâm sàng", 14, 23);

    // Meta table
    const metaRows = [
      ["Mã hồ sơ", patient.id || "--"],
      ["Bệnh nhân", patient.name || "--"],
      ["Giới tính", formatGender(patient.gender || "--")],
      ["Tuổi", patient.age || "--"],
      ["Loại chẩn đoán", "Ung thư vú"],
      ["Kết luận", diag.label || "--"],
      ["Độ tin cậy", score],
      ["Số box phát hiện", `${boxesCount}`],
      ["Thời gian", now],
    ];

    doc.autoTable({
      startY: 30,
      head: [["Trường", "Giá trị"]],
      body: metaRows,
      styles: { fontSize: 10, cellPadding: 4, font: "NotoSans" },
      headStyles: { fillColor: [83, 69, 172], textColor: 255, font: "NotoSans" },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      tableLineColor: [210, 210, 210],
      tableLineWidth: 0.2,
    });

    let y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text("Kết luận & Lời khuyên", 14, y);
    doc.setFontSize(10);
    const wrapConclusion = doc.splitTextToSize(`Kết luận: ${summary.conclusion}`, 180);
    const wrapAdvice = doc.splitTextToSize(`Lời khuyên: ${summary.advice}`, 180);
    y += 6;
    doc.text(wrapConclusion, 14, y);
    y += wrapConclusion.length * 5 + 2;
    doc.text(wrapAdvice, 14, y);

    // Giải thích bổ sung: liệt kê box (tên + score)
    if (boxesCount > 0) {
      const explainRows = (lastPrediction.boxes || []).slice(0, 6).map((b, idx) => [
        `${idx + 1}. ${b.class_name || b.class_id}`,
        `${(b.confidence * 100).toFixed(1)}%`,
        b.xyxy ? b.xyxy.map((v) => v.toFixed(1)).join(" · ") : "",
      ]);
      doc.autoTable({
        startY: y + 10,
        head: [["Vùng nghi ngờ", "Score", "Tọa độ (x1 · y1 · x2 · y2)"]],
        body: explainRows,
        styles: { fontSize: 9, cellPadding: 3, font: "NotoSans" },
        headStyles: { fillColor: [83, 69, 172], textColor: 255, font: "NotoSans" },
        alternateRowStyles: { fillColor: [245, 243, 255] },
        tableLineColor: [210, 210, 210],
        tableLineWidth: 0.2,
      });
    }

    doc.save("breast-ai-report.pdf");
  } catch (err) {
    console.error(err);
    alert(err.message || "Không xuất được PDF");
  }
}

function handlePreview(file, prediction) {
  const url = URL.createObjectURL(file);
  previewImg.onload = () => {
    drawBoxes(prediction);
    URL.revokeObjectURL(url);
  };
  previewImg.src = url;
}

function setSelectedFile(file) {
  selectedFile = file;
  updateDiagnoseButtonState();
  if (!file) return;

  lastPrediction = null;
  renderSummary(null);

  const url = URL.createObjectURL(file);
  previewImg.onload = () => {
    const ctx = overlay.getContext("2d");
    overlay.width = previewImg.clientWidth || previewImg.naturalWidth || 0;
    overlay.height = previewImg.clientHeight || previewImg.naturalHeight || 0;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    URL.revokeObjectURL(url);
  };
  previewImg.src = url;
  boxesEl.innerHTML = '<p class="small">Chưa chẩn đoán. Nhấn "Chẩn đoán" để chạy.</p>';
  metaEl.textContent = "";
}

async function submit() {
  if (!authToken) {
    alert("Vui lòng đăng nhập trước khi chẩn đoán.");
    showSection("auth");
    return;
  }
  if (!selectedFile) {
    alert("Vui lòng chọn ảnh trước khi chẩn đoán.");
    return;
  }

  showProgress(true, "Đang suy luận với YOLO...");
  diagnoseBtn.disabled = true;

  const formData = new FormData();
  formData.append("file", selectedFile);

  const trimmedName = patientName.value.trim();
  const trimmedId = patientId.value.trim();
  const ageVal = patientAge.value.trim();
  const genderVal = patientGender.value.trim();

  if (trimmedName) formData.append("patient_name", trimmedName);
  if (ageVal) formData.append("patient_age", ageVal);
  if (trimmedId) formData.append("patient_id", trimmedId);
  if (genderVal) formData.append("patient_gender", genderVal);

  try {
    const headers = {};
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const res = await fetch("/api/predict", { method: "POST", body: formData, headers });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Lỗi không xác định");

    renderMeta(data);
    renderBoxes(data);
    renderDiagnosis(data);
    lastPrediction = {
      ...data,
      patient: data.patient || {
        name: trimmedName,
        age: ageVal,
        id: trimmedId,
        gender: genderVal,
      },
    };
    renderSummary(lastPrediction);
    handlePreview(selectedFile, data);
  } catch (err) {
    alert(err.message);
    console.error(err);
  } finally {
    showProgress(false);
    updateDiagnoseButtonState();
  }
}

function wireUpload() {
  dropzone.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (file) setSelectedFile(file);
  });

  dropzone.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    dropzone.style.borderColor = "rgba(0, 224, 184, 0.6)";
  });
  dropzone.addEventListener("dragleave", () => {
    dropzone.style.borderColor = "var(--border)";
  });
  dropzone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    dropzone.style.borderColor = "var(--border)";
    const file = ev.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  wireUpload();
  if (logoutBtn) logoutBtn.disabled = !authToken;
  if (authToken) setAuthStatus("Đã đăng nhập");
  syncNavAuth();
  renderSummary(null);
  updateAdminUi();
  // Ẩn mọi section trừ Trang chủ lúc khởi động
  showSection("home");
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      if (link === navAuthLink && authToken) {
        e.preventDefault();
        persistToken(null);
        setAuthStatus("Đã đăng xuất");
        showSection("home");
        return;
      }
      e.preventDefault();
      const target = link.dataset.section;
      showSection(target);
    });
  });
  heroCtas.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.go;
      showSection(target);
    });
  });

  if (loginBtn) {
    loginBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (authMode === "register") {
        alert("Chức năng đăng ký chưa bật. Vui lòng dùng tài khoản mặc định hoặc liên hệ admin.");
        return;
      }
      try {
        const body = {
          username: authUser.value.trim() || "admin",
          password: authPass.value.trim() || "admin123",
        };
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "Không đăng nhập được");
        persistToken(data.token);
        authRole = data.role || null;
        setAuthStatus("Đã đăng nhập", true);
        updateAdminUi();
        // Admin ở lại màn hình đăng nhập để tạo tài khoản bác sĩ, bác sĩ thường chuyển sang chẩn đoán
        if (authRole === "admin") {
          showSection("auth");
        } else {
          showSection("diagnose");
        }
      } catch (err) {
        setAuthStatus(err.message || "Đăng nhập thất bại");
        alert(err.message);
      }
    });
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setAuthMode(authMode === "login" ? "register" : "login");
    });
  }

  if (createDoctorBtn) {
    createDoctorBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (authRole !== "admin") {
        alert("Chỉ admin được tạo tài khoản bác sĩ.");
        return;
      }
      const username = (doctorUser?.value || "").trim();
      const password = (doctorPass?.value || "").trim();
      if (!username || !password) {
        setAdminDoctorStatus("Vui lòng nhập đủ username và mật khẩu");
        return;
      }
      if (password.length < 6) {
        setAdminDoctorStatus("Mật khẩu phải >= 6 ký tự");
        return;
      }
      try {
        setAdminDoctorStatus("Đang tạo...", true);
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "Tạo tài khoản thất bại");
        setAdminDoctorStatus(`Đã tạo tài khoản: ${data.username}`, true);
        if (doctorUser) doctorUser.value = "";
        if (doctorPass) doctorPass.value = "";
      } catch (err) {
        setAdminDoctorStatus(err.message || "Tạo tài khoản thất bại");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      persistToken(null);
      setAuthStatus("Đã đăng xuất");
      updateAdminUi();
    });
  }

  if (togglePass && authPass) {
    togglePass.addEventListener("click", () => {
      const isHidden = authPass.type === "password";
      authPass.type = isHidden ? "text" : "password";
      togglePass.textContent = isHidden ? "Ẩn" : "Hiện";
    });
  }

  if (diagnoseBtn) {
    diagnoseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      submit();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await exportPdf();
    });
  }

  updateDiagnoseButtonState();
  updateAdminUi();
});

function showSection(key) {
  Object.entries(sections).forEach(([name, el]) => {
    if (!el) return;
    if (name === key) {
      el.classList.remove("section-hidden");
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      el.classList.add("section-hidden");
    }
  });
  if (homeInfo) {
    if (key === "home") {
      homeInfo.classList.remove("section-hidden");
    } else {
      homeInfo.classList.add("section-hidden");
    }
  }
}
