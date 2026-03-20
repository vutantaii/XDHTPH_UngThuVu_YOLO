import argparse
import json
import os
import sys
import warnings
from pathlib import Path

import numpy as np
from PIL import Image

warnings.filterwarnings("ignore", category=UserWarning)
os.environ.setdefault("YOLO_VERBOSE", "False")

try:
    from ultralytics import YOLO
    import torch

    # Ensure torch.load defaults to weights_only=False (for PyTorch >=2.6 safety change)
    _orig_load = torch.load

    def _load_with_weights_false(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return _orig_load(*args, **kwargs)

    torch.load = _load_with_weights_false
except ImportError as err:
    print(json.dumps({"error": f"Thiếu thư viện ultralytics ({err}). Chạy: pip install -r ai_model/requirements.txt"}))
    sys.exit(1)


DEVICE = "cpu"
_unet_model = None
_unet_status = None
_unet_missing_dep = None


def _load_unet_model(unet_path: Path):
    """Load U-Net (segmentation_models_pytorch) once for mask heuristic."""
    global _unet_model, _unet_status, _unet_missing_dep

    if _unet_model is not None and _unet_status == "ok":
        return _unet_model

    if unet_path is None or not unet_path.exists():
        _unet_status = "missing"
        return None

    try:
        import segmentation_models_pytorch as smp
    except Exception as exc:  # pragma: no cover - optional dep
        _unet_status = "missing_dependency"
        _unet_missing_dep = str(exc)
        return None

    try:
        model = smp.Unet(
            encoder_name="resnet34",
            encoder_weights=None,
            in_channels=3,
            classes=1,
        )
        state_dict = torch.load(unet_path, map_location=DEVICE)
        model.load_state_dict(state_dict, strict=False)
        model.eval()
        _unet_model = model
        _unet_status = "ok"
        return model
    except Exception:
        _unet_status = "failed"
        return None


def run_unet_segmentation(unet_path: Path, image_path: Path):
    model = _load_unet_model(unet_path)
    if model is None:
        if _unet_status == "missing_dependency":
            return None, f"Thiếu segmentation_models_pytorch: {_unet_missing_dep}"
        return None, _unet_status or "unavailable"

    img = Image.open(image_path).convert("RGB")
    img = img.resize((256, 256))
    arr = np.asarray(img).astype("float32") / 255.0
    tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)

    with torch.no_grad():
        logits = model(tensor)

    if isinstance(logits, (list, tuple)):
        logits = logits[0]

    prob = torch.sigmoid(logits)
    mask = prob[0, 0].cpu().numpy()
    ratio = float((mask > 0.5).mean())

    label = "Không thấy vùng nghi ngờ" if ratio < 0.005 else "Có vùng nghi ngờ"

    return {
        "label": label,
        "confidence": ratio,
        "mask_ratio": ratio,
    }, None


def _derive_diagnosis_from_boxes(boxes):
    # Ưu tiên nhãn YOLO nếu đã fine-tune 3 lớp: normal/benign/malignant
    candidates = []
    for box in boxes:
        name = str(box.get("class_name", "")).lower()
        if "benign" in name or "lành" in name:
            candidates.append(("lành tính", box.get("confidence", 0.0)))
        elif "malig" in name or "ác" in name:
            candidates.append(("ác tính", box.get("confidence", 0.0)))
        elif "normal" in name or "bình" in name:
            candidates.append(("bình thường", box.get("confidence", 0.0)))
    if not candidates:
        return None
    # Chọn nhãn có score cao nhất
    label, score = max(candidates, key=lambda x: x[1])
    return {"label": label, "confidence": score}


def _combine_diagnosis(boxes, seg_diag):
    # Nếu YOLO có nhãn 3 lớp → dùng YOLO
    diag_from_yolo = _derive_diagnosis_from_boxes(boxes)
    if diag_from_yolo:
        return diag_from_yolo

    # Nếu không có nhãn 3 lớp, fallback U-Net mask heuristic
    if seg_diag:
        label = seg_diag.get("label")
        ratio = seg_diag.get("mask_ratio")
        if ratio is not None:
            # Nếu gần như không có vùng nghi ngờ ⇒ bình thường
            if ratio < 0.001:
                return {"label": "bình thường", "confidence": 1.0 - ratio, "mask_ratio": ratio}
            # Nếu có vùng nhỏ ⇒ gán lành tính
            if ratio < 0.02:
                return {"label": "lành tính", "confidence": 1.0 - ratio, "mask_ratio": ratio}
            # Vùng lớn ⇒ nghi ngờ ác tính
            return {"label": "ác tính", "confidence": ratio, "mask_ratio": ratio}
        return seg_diag
    return None


def run_inference(weights_path: Path, image_path: Path, unet_path: Path | None = None):
    if not weights_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file trọng số: {weights_path}")
    if not image_path.exists():
        raise FileNotFoundError(f"Không tìm thấy ảnh nguồn: {image_path}")

    model = YOLO(weights_path)
    results = model.predict(source=str(image_path), verbose=False, imgsz=640)
    res = results[0]

    boxes = []
    names = model.names if hasattr(model, "names") else {}

    if res.boxes is not None:
        for box in res.boxes:
            cls_id = int(box.cls[0]) if box.cls is not None else -1
            conf = float(box.conf[0]) if box.conf is not None else 0.0
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
            boxes.append({
                "class_id": cls_id,
                "class_name": names.get(cls_id, str(cls_id)) if isinstance(names, dict) else str(cls_id),
                "confidence": conf,
                "xyxy": [x1, y1, x2, y2]
            })

    payload = {
        "image": {
            "width": int(res.orig_shape[1]),
            "height": int(res.orig_shape[0]),
            "path": str(image_path)
        },
        "boxes": boxes
    }

    seg_diag = None
    if unet_path is not None:
        seg_diag, diag_err = run_unet_segmentation(unet_path, image_path)
        if diag_err:
            payload["diagnosis_error"] = diag_err

    combined = _combine_diagnosis(boxes, seg_diag)
    if combined is not None:
        payload["diagnosis"] = combined

    return payload


def parse_args():
    parser = argparse.ArgumentParser(description="Infer breast ultrasound image with YOLO model.")
    parser.add_argument("--weights", required=True, help="Đường dẫn file .pt")
    parser.add_argument("--source", required=True, help="Đường dẫn ảnh siêu âm")
    parser.add_argument("--unet", required=False, help="Đường dẫn file U-Net/Classifier .pth")
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        unet_path = Path(args.unet) if args.unet else None
        result = run_inference(Path(args.weights), Path(args.source), unet_path=unet_path)
        print(json.dumps(result))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
