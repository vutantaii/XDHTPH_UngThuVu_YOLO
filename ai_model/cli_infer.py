import argparse
import json
import sys
from pathlib import Path

# Bảo đảm import được ai_model.infer
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ai_model.infer import run_inference  # noqa: E402


def parse_args():
    parser = argparse.ArgumentParser(description="CLI chạy suy luận YOLO/U-Net")
    parser.add_argument("--file", "--source", dest="source", required=True, help="Đường dẫn ảnh")
    parser.add_argument("--weights", required=True, help="Đường dẫn file .pt")
    parser.add_argument("--unet", required=False, help="Đường dẫn file U-Net .pth")
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        weights_path = Path(args.weights)
        source_path = Path(args.source)
        unet_path = Path(args.unet) if args.unet else None
        result = run_inference(weights_path, source_path, unet_path)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
