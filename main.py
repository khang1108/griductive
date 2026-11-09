from __future__ import annotations

import argparse
from pathlib import Path
import sys
import threading
import time
import webbrowser

import uvicorn

# Ensure src/ is on PYTHONPATH for direct execution
SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


def run_web(host: str = "127.0.0.1", port: int = 8000, open_browser: bool = True) -> None:
    url = f"http://{host}:{port}"
    print("=" * 66)
    print("  🔍 Griductive Solver — Modern Web Edition (TypeScript + Python)")
    print(f"  Game URL: {url}")
    if open_browser:
        print("  Opening browser automatically...")
    print("  Press Ctrl+C to terminate.")
    print("=" * 66)

    if open_browser:
        def _open():
            time.sleep(0.8)
            webbrowser.open(url)
        threading.Thread(target=_open, daemon=True).start()

    uvicorn.run("griductive.server.app:app", host=host, port=port, log_level="info")


def main() -> None:
    parser = argparse.ArgumentParser(description="Griductive Solver")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not auto-open browser in Web mode",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Web server port (default: 8000)",
    )
    args = parser.parse_args()

    run_web(port=args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
