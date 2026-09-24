#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import os
import socket
import struct
import urllib.request
from pathlib import Path


class Cdp:
    def __init__(self, port: int):
        pages = json.loads(urllib.request.urlopen(f"http://[::1]:{port}/json").read())
        page = next(item for item in pages if item.get("type") == "page")
        path = "/" + "/".join(page["webSocketDebuggerUrl"].split("/")[3:])
        self.socket = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        self.socket.connect(("::1", port))
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET {path} HTTP/1.1\r\nHost: [::1]:{port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.socket.sendall(request.encode())
        response = b""
        while b"\r\n\r\n" not in response:
            response += self.socket.recv(4096)
        self.sequence = 0

    def _send(self, payload: dict) -> None:
        data = json.dumps(payload, separators=(",", ":")).encode()
        mask = os.urandom(4)
        length = len(data)
        if length < 126:
            header = bytes([0x81, 0x80 | length])
        elif length < 65536:
            header = bytes([0x81, 0x80 | 126]) + struct.pack(">H", length)
        else:
            header = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", length)
        self.socket.sendall(header + mask + bytes(value ^ mask[index % 4] for index, value in enumerate(data)))

    def _receive(self) -> dict:
        header = self.socket.recv(2)
        length = header[1] & 127
        if length == 126:
            length = struct.unpack(">H", self.socket.recv(2))[0]
        elif length == 127:
            length = struct.unpack(">Q", self.socket.recv(8))[0]
        data = b""
        while len(data) < length:
            data += self.socket.recv(length - len(data))
        return json.loads(data.decode())

    def call(self, method: str, params: dict | None = None) -> dict:
        self.sequence += 1
        self._send({"id": self.sequence, "method": method, "params": params or {}})
        while True:
            response = self._receive()
            if response.get("id") == self.sequence:
                return response

    def evaluate(self, expression: str):
        response = self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
        result = response.get("result", {})
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"])
        return result.get("result", {}).get("value")

    def navigate(self, url: str) -> None:
        self.call("Page.navigate", {"url": url})
        self.evaluate("new Promise(resolve => setTimeout(resolve, 700))")

    def screenshot(self, path: Path) -> None:
        result = self.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False, "fromSurface": True})
        path.write_bytes(base64.b64decode(result["result"]["data"]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=9222)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cdp = Cdp(args.port)
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False})
    if "/login" in str(cdp.evaluate("location.pathname")):
        raise SystemExit("Chrome debug tab is not authenticated")

    def wait() -> None:
        cdp.evaluate("new Promise(resolve => setTimeout(resolve, 150))")

    def reset() -> None:
        list_url = args.url.rsplit('/create', 1)[0] + '?tab=rule'
        cdp.navigate(list_url)
        cdp.navigate(args.url)
        cdp.evaluate("new Promise(resolve => setTimeout(resolve, 900))")

    def set_value(selector: str, value: str) -> bool:
        return bool(cdp.evaluate(
            f"""(() => {{
              const element = document.querySelector({json.dumps(selector)});
              if (!element) return false;
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setter.call(element, {json.dumps(value)});
              element.dispatchEvent(new Event('input', {{ bubbles: true }}));
              element.dispatchEvent(new Event('change', {{ bubbles: true }}));
              return true;
            }})()"""
        ))

    def click(selector: str) -> bool:
        return bool(cdp.evaluate(f"(() => {{ const element = document.querySelector({json.dumps(selector)}); if (!element) return false; element.click(); return true }})()"))

    def click_button(label: str) -> bool:
        return bool(cdp.evaluate(f"(() => {{ const element = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === {json.dumps(label)}); if (!element) return false; element.click(); return true }})()"))

    def click_indexed(selector: str, index: int) -> bool:
        return bool(cdp.evaluate(f"(() => {{ const element = document.querySelectorAll({json.dumps(selector)})[{index}]; if (!element) return false; element.click(); return true }})()"))

    def set_indexed(selector: str, values: list[str]) -> int:
        count = int(cdp.evaluate(f"document.querySelectorAll({json.dumps(selector)}).length"))
        for index, value in enumerate(values):
            if not bool(cdp.evaluate(f"(() => {{ const element = document.querySelectorAll({json.dumps(selector)})[{index}]; if (!element) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(element, {json.dumps(value)}); element.dispatchEvent(new Event('input', {{ bubbles: true }})); element.dispatchEvent(new Event('change', {{ bubbles: true }})); return true; }})()")):
                raise RuntimeError(f"selector did not resolve {selector}[{index}]")
            wait()
        return count

    def snapshot(source_state_id: str) -> dict:
        return cdp.evaluate(f"""(() => {{
          const rect = element => {{ const value = element?.getBoundingClientRect(); return value ? {{ x: value.x, y: value.y, width: value.width, height: value.height }} : null }};
          const dialog = document.querySelector('[role="dialog"]');
          const root = dialog || document.querySelector('.full-screen-modal');
          const style = root ? getComputedStyle(root) : null;
          return {{
            source_state_id: {json.dumps(source_state_id)},
            geometry: {{
              bbox: rect(root),
              header: rect(dialog?.querySelector('.review-rule-preview-header')),
              body: rect(dialog?.querySelector('.review-rule-preview-body')),
              close_button: rect(dialog?.querySelector('.preview-close-button')),
              preview_input: rect(dialog?.querySelector('input[aria-label="预览分数"], input[aria-label="预览评分"]'))
            }},
            styles: style ? {{ display: style.display, position: style.position, boxSizing: style.boxSizing, backgroundColor: style.backgroundColor, color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, border: style.border, borderRadius: style.borderRadius, boxShadow: style.boxShadow, overflowX: style.overflowX, overflowY: style.overflowY, zIndex: style.zIndex }} : {{}},
            svg: [...(dialog || document).querySelectorAll('svg[data-icon]')].map(element => {{ const path = element.querySelector('path'); return {{ data_icon: element.dataset.icon, viewBox: element.getAttribute('viewBox'), path: path?.getAttribute('d') || '', bbox: rect(element) }}; }})
          }};
        }})()""")

    def capture(name: str, state: str, records: list[dict]) -> None:
        wait()
        cdp.screenshot(args.out / f"{name}.png")
        records.append(snapshot(state))

    def fill_rating() -> None:
        set_value('input[placeholder="请输入名称"]', "评级预览规则")
        if set_indexed('input[placeholder*="等级代号"]', ["C", "B", "A"]) != 3:
            raise RuntimeError("rating code fixture did not resolve three inputs")

    def fill_score(fixed: bool = False) -> None:
        set_value('input[placeholder="请输入名称"]', "评分预览规则")
        if fixed:
            click_indexed('input[name="score-method"]', 1)
            set_indexed('.fixed-score-option-row input', ["20", "40"])
        else:
            set_value('input[aria-label="分数下限"]', "0")
            set_value('input[aria-label="分数上限"]', "100")

    def fill_mapping() -> None:
        set_value('input[placeholder="请输入名称"]', "评分映射预览规则")
        set_value('input[aria-label="分数下限"]', "0")
        set_value('input[aria-label="分数上限"]', "100")
        set_value('input[aria-label="第1个区间分数上限"]', "60")
        set_indexed('input[placeholder="请输入等级代号"]', ["C", "A"])

    records: list[dict] = []
    reset(); click_button("预览"); capture("01-rating-validation", "RR-PREVIEW-RATING-VALIDATION-ERROR", records)
    reset(); fill_rating(); click_button("预览"); capture("02-rating-non-quantified", "RR-PREVIEW-RATING-NON-QUANTIFIED", records)
    reset(); fill_rating(); click('[role="switch"]'); set_indexed('input[aria-label*="量化分"]', ["1", "2", "3"]); click_button("预览"); capture("03-rating-quantified", "RR-PREVIEW-RATING-QUANTIFIED", records)
    reset(); click_indexed('input[name="review-type"]', 1); click_button("预览"); capture("04-score-validation", "RR-PREVIEW-SCORE-VALIDATION-ERROR", records)
    reset(); click_indexed('input[name="review-type"]', 1); fill_score(); click_button("预览"); capture("05-score-bounds", "RR-PREVIEW-SCORE-BOUNDS", records)
    reset(); click_indexed('input[name="review-type"]', 1); fill_score(True); click_button("预览"); capture("06-score-fixed", "RR-PREVIEW-SCORE-FIXED", records)
    reset(); click_indexed('input[name="review-type"]', 2); click_button("预览"); capture("07-mapping-validation", "RR-PREVIEW-MAPPING-VALIDATION-ERROR", records)
    reset(); click_indexed('input[name="review-type"]', 2); fill_mapping(); click_button("预览"); capture("08-mapping-initial", "RR-PREVIEW-MAPPING-INITIAL", records)
    set_value('input[aria-label="预览分数"]', "50"); capture("09-mapping-value-50", "RR-PREVIEW-MAPPING-VALUE-50", records)
    (args.out / "runtime-snapshots.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"screenshots": 9, "runtime_snapshots": len(records), "out": str(args.out)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
