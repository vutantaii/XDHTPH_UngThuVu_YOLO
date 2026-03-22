---
title: Breast AI YOLO
emoji: "🩺"
colorFrom: blue
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
---

# HỆ THỐNG HỖ TRỢ CHẨN ĐOÁN UNG THƯ VÚ
SPA tĩnh (HTML/CSS/JS) gọi Node/Express; backend spawn Python CLI để suy luận YOLOv8 (phát hiện) + U-Net (phân đoạn/heuristic diagnosis).

```
Browser → Node/Express → Python CLI → YOLOv8 + (tùy chọn) U-Net → JSON kết quả
```

## Tổng quan (bản mô tả đầy đủ)

Hệ thống web hỗ trợ chẩn đoán ung thư vú, giao diện tĩnh (HTML/JS) gọi API Node/Express, backend chạy Python để suy luận mô hình YOLOv8 (phát hiện khối bất thường) và U-Net (tùy chọn) cho phân đoạn/gợi ý chẩn đoán. Kết quả hiển thị trực quan (ảnh + box), xuất PDF kèm thông tin bệnh nhân, login admin tạo tài khoản bác sĩ, lưu người dùng trên MongoDB.

**Mục đích**
- Hỗ trợ bác sĩ xem nhanh kết quả phát hiện khối u vú từ ảnh siêu âm.
- Xuất báo cáo PDF (tiếng Việt, có font nhúng) kèm box phát hiện và kết luận gợi ý.
- Minh họa kiến trúc 3-tier: frontend tĩnh, backend Node/Express, suy luận ML bằng Python.

**Tiến độ & chức năng chính**
1) Frontend
- Kéo‑thả/upload ảnh, nhập thông tin bệnh nhân, xem box overlay và bảng kết quả.
- Xuất PDF với font tiếng Việt, bảng thông tin bệnh nhân, kết luận, box phát hiện.
- Điều hướng SPA (home/diagnose/model/auth), login/logout; admin giữ nguyên màn đăng nhập để tạo bác sĩ.

2) Backend (Node/Express)
- API `/api/health`, `/api/login`, `/api/predict`, `/api/admin/users` (multer 25MB, auth optional).
- Gọi Python CLI `ai_model/cli_infer.py` với YOLOv8 + tùy chọn U-Net; trả JSON.
- Lưu tài khoản bác sĩ trên MongoDB (DB `breast_cancer`, collection `users`).

3) Máy học (Python)
- Mô hình phát hiện: YOLOv8 (`best.pt`); phân đoạn/gợi ý: `unet_breast.pth` (tùy chọn).
- Script suy luận: [ai_model/cli_infer.py](ai_model/cli_infer.py) gọi [ai_model/infer.py](ai_model/infer.py).
- Phụ thuộc `ultralytics`, `torch`, `opencv-python`, `pillow` (đã xử lý lỗi PIL).

**Kiến trúc thư mục** (dự án này)
- `frontend/`: SPA tĩnh (index, styles, app.js, fonts NotoSans cho PDF).
- `backend/`: server Express, multer, routes API, gọi Python.
- `ai_model/`: trọng số YOLOv8, U-Net, script suy luận, requirements riêng.
- `archive/`, `Thyroid Ultrasound.v1i.yolov8/`: dữ liệu/tham khảo.

**Công nghệ sử dụng**
- Ngôn ngữ: Node.js 18+, Python 3.10+.
- Web: Express, multer, fetch API; frontend thuần HTML/CSS/JS.
- ML: Ultralytics YOLOv8, torch; U-Net tùy chọn.
- DB: MongoDB (pymongo/Node Mongo driver) cho tài khoản bác sĩ.

**Mô hình & dữ liệu**
- YOLOv8 phát hiện box; kết quả trả tọa độ, nhãn, confidence; U-Net (nếu bật) cho mặt nạ.
- Trọng số: `ai_model/best.pt` (siêu âm vú), `ai_model/unet_breast.pth` tùy chọn.

**Triển khai & mở rộng**
- Dockerfile sẵn; cần biến môi trường MONGO_URI/MONGO_DB/MONGO_DOCTOR_COLLECTION/PYTHON_BIN.
- Có thể thay trọng số mới, chỉnh giới hạn upload, thêm lưu kết quả vào DB, hoặc tách frontend deploy CDN.

## Thành phần chính
- Frontend: [frontend/index.html](frontend/index.html), [frontend/styles.css](frontend/styles.css), [frontend/app.js](frontend/app.js) (serve qua `/static`).
- Backend API: [backend/server.js](backend/server.js) (Express, multer 25MB, `/api/health`, `/api/login`, `/api/predict`).
- Suy luận: [ai_model/cli_infer.py](ai_model/cli_infer.py) gọi [ai_model/infer.py](ai_model/infer.py) với `best.pt` (YOLOv8) và tùy chọn `unet_breast.pth` (U-Net segmentation).

## Yêu cầu môi trường
- Node.js >= 18
- Python >= 3.10, pip
- Máy Windows: bật venv `Scripts\activate`; macOS/Linux: `source .venv/bin/activate`.
- RAM GPU không bắt buộc (mặc định chạy CPU); có GPU CUDA sẽ nhanh hơn nếu môi trường phù hợp.

## Chạy nhanh bằng Docker (không cần cài Node/Python/Mongo)
Chỉ cần cài Docker Desktop, sau đó chạy:

```bash
docker compose up --build
```

Sau khi container chạy xong:
- Ứng dụng: `http://localhost:7860`
- API health: `http://localhost:7860/api/health`
- MongoDB nội bộ: `mongodb://localhost:27017` (được tạo tự động bởi `docker-compose.yml`)

Dừng hệ thống:

```bash
docker compose down
```

Xóa luôn dữ liệu Mongo volume:

```bash
docker compose down -v
```

Ghi chú:
- Mặc định `docker-compose.yml` đang để `AUTH_REQUIRED=false` để người dùng dùng thử ngay.
- Nếu muốn bật đăng nhập, sửa `AUTH_REQUIRED=true` trong `docker-compose.yml` và đặt `ADMIN_USER`, `ADMIN_PASSWORD`.

## Cài đặt nhanh (Windows)
```powershell
# 1) Node
npm install

# 2) Python cho suy luận
python -m venv .venv
.venv\Scripts\activate
pip install --upgrade pip
pip install -r ai_model/requirements.txt

# 3) Chạy server
set PYTHON_BIN=.venv\Scripts\python.exe
npm start
# Mặc định http://localhost:3000
```
macOS/Linux đổi dòng `set` thành `export PYTHON_BIN=.venv/bin/python`.

## Biến môi trường (.env)
Tạo file `.env` (tham khảo `.env.example` nếu có):
- `PORT` (mặc định 3000)
- `PYTHON_BIN` (bắt buộc trỏ đúng interpreter, ví dụ `.venv/Scripts/python.exe`)
- `WEIGHTS_PATH` (mặc định `ai_model/best.pt`)
- `UNET_PATH` (mặc định `ai_model/unet_breast.pth`, để trống nếu không dùng U-Net)
- `AUTH_REQUIRED` (`true|false`, mặc định false)
- `ADMIN_USER`, `ADMIN_PASSWORD` (mặc định `admin` / `admin123` khi bật auth)

## Cách sử dụng giao diện
1) Mở trang tại `http://localhost:3000`.
2) (Nếu bật auth) Đăng nhập ở mục "Truy cập API".
3) Nhập thông tin bệnh nhân (tùy chọn) và kéo-thả ảnh (JPG/PNG/BMP; tối đa 25MB).
4) Nhấn "Chẩn đoán" → xem box overlay + danh sách box; nếu có U-Net sẽ trả thêm gợi ý chẩn đoán.

## API
Base URL: `http://localhost:3000`

### GET /api/health
Trả về `{ status, weights, unet, python }` để kiểm tra đường dẫn và interpreter.

### POST /api/login
Body JSON: `{ "username": "...", "password": "..." }` → `{ token, user, auth_required }`.
Token lưu in-memory, không có refresh, cần gửi header `Authorization: Bearer <token>` khi `AUTH_REQUIRED=true`.

### POST /api/predict
- Multipart field `file` (bắt buộc).
- Các trường tùy chọn: `patient_name`, `patient_id`, `patient_age`, `patient_gender`.
- Header `Authorization` chỉ khi bật auth.
- Phản hồi: `{ image: {width,height,path}, boxes: [...], diagnosis?, diagnosis_error?, patient? }`.

Ví dụ curl (không bật auth):
```bash
curl -X POST http://localhost:3000/api/predict \
  -F "file=@sample.jpg"
```

## Chạy CLI trực tiếp (không qua Node)
```bash
python ai_model/cli_infer.py --file path/to/image.jpg --weights ai_model/best.pt --unet ai_model/unet_breast.pth
```
Kết quả in JSON ra stdout.

## Cấu trúc thư mục chính
- ai_model/: `best.pt`, `unet_breast.pth`, [infer.py](ai_model/infer.py), [cli_infer.py](ai_model/cli_infer.py), `requirements.txt`
- frontend/: [index.html](frontend/index.html), [styles.css](frontend/styles.css), [app.js](frontend/app.js)
- backend/: [server.js](backend/server.js)
- package.json: scripts `start`, `dev` (nodemon)
- archive/, Thyroid Ultrasound.v1i.yolov8/: dữ liệu/weight tham khảo

## Lưu ý kỹ thuật
- File upload lưu trong thư mục tạm OS và bị xóa sau khi xử lý xong.
- Mặc định chạy CPU; muốn tận dụng GPU cần cài đúng bản `torch` hỗ trợ CUDA.
- Nếu bật auth, token được lưu trong RAM Node (khởi động lại sẽ mất).

## Xử lý sự cố thường gặp
- Thiếu `ultralytics` hoặc `torch`: kiểm tra đã kích hoạt venv và chạy `pip install -r ai_model/requirements.txt`.
- "Không parse được JSON từ Python": thường do lỗi import; xem stderr của tiến trình Python và kiểm tra `PYTHON_BIN`, `WEIGHTS_PATH`.
- Ảnh quá lớn: giới hạn 25MB ở multer; giảm kích thước hoặc tăng giới hạn trong [backend/server.js](backend/server.js).

## Phát triển
- Chạy hot-reload Node: `npm run dev` (yêu cầu `npx nodemon`).
- Tùy chỉnh giao diện trực tiếp trong [frontend/styles.css](frontend/styles.css) và [frontend/app.js](frontend/app.js).
Link Dataset: https://app.roboflow.com/abc-jebjf/thyroid-ultrasound-va7qd-hoig0/browse?queryText=&pageSize=50&startingIndex=0&browseQuery=true
              https://www.kaggle.com/code/utkarshsaxenadn/breast-ultrasound-image-segmentation-deeplabv3?select=Dataset_BUSI_with_GT
  Linnk server: https://huggingface.co/spaces/VuTanTai/Breast-cancer
