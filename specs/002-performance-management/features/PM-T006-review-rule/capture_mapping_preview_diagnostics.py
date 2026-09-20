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
    def __init__(self, port: int, url_hint: str):
        pages = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/json").read())
        page = next(item for item in pages if item.get("type") == "page" and url_hint in item.get("url", ""))
        ws_path = "/" + "/".join(page["webSocketDebuggerUrl"].split("/")[3:])
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.connect(("127.0.0.1", port))
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET {ws_path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\n"
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
        if not header:
            raise RuntimeError("CDP websocket closed")
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

    def wait(self, milliseconds: int = 220) -> None:
        self.evaluate(f"new Promise(resolve => setTimeout(resolve, {milliseconds}))")

    def navigate(self, url: str) -> None:
        self.call("Page.navigate", {"url": url})
        self.wait(900)
        self.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()")
        self.wait(300)

    def screenshot(self, path: Path) -> None:
        result = self.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False, "fromSurface": True})
        path.write_bytes(base64.b64decode(result["result"]["data"]))


def set_value(selector: str, value: str, index: int | None = None) -> str:
    target = f"document.querySelectorAll({json.dumps(selector)})[{index}]" if index is not None else f"document.querySelector({json.dumps(selector)})"
    return f"""(() => {{
      const element = {target};
      if (!element) return false;
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(element, {json.dumps(value)});
      element.dispatchEvent(new Event('input', {{ bubbles: true }}));
      element.dispatchEvent(new Event('change', {{ bubbles: true }}));
      return true;
    }})()"""


def click_button(text: str) -> str:
    return f"""(() => {{
      const element = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === {json.dumps(text)} && item.getBoundingClientRect().width > 0);
      if (!element) return false;
      element.click();
      return true;
    }})()"""


def click_indexed(selector: str, index: int) -> str:
    return f"""(() => {{
      const element = document.querySelectorAll({json.dumps(selector)})[{index}];
      if (!element) return false;
      element.click();
      return true;
    }})()"""


def snapshot_js(state_id: str) -> str:
    return f"""(() => {{
      const rect = node => {{
        const r = node?.getBoundingClientRect();
        return r ? {{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}} : null;
      }};
      const style = node => {{
        if (!node) return null;
        const s = getComputedStyle(node);
        return {{
          display:s.display, position:s.position, width:s.width, height:s.height,
          margin_left:s.marginLeft, padding:s.padding, color:s.color,
          background_color:s.backgroundColor, border:s.border,
          border_radius:s.borderRadius, box_shadow:s.boxShadow,
          overflow_x:s.overflowX, overflow_y:s.overflowY,
          font_family:s.fontFamily, font_size:s.fontSize,
          font_weight:s.fontWeight, line_height:s.lineHeight,
          align_items:s.alignItems, flex:s.flex, flex_shrink:s.flexShrink,
          gap:s.gap, z_index:s.zIndex
        }};
      }};
      const nodeInfo = (node, index) => ({{
        index, tag:node.tagName, text:(node.innerText || node.textContent || '').trim(),
        class_name:typeof node.className === 'string' ? node.className : '',
        bbox:rect(node), styles:style(node),
        inline_width:node.style.width || '', parent_class:node.parentElement?.className || ''
      }});
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return {{source_state_id:{json.dumps(state_id)}, open:false}};
      const dialogRect = rect(dialog);
      const body = dialog.querySelector('.ud__modal__body') || dialog.querySelector('.review-rule-preview-body');
      const descendants = [...dialog.querySelectorAll('*')].map((node,index) => nodeInfo(node,index)).filter(item => item.bbox && item.bbox.width > 0 && item.bbox.height > 0);
      const segments = descendants.filter(item =>
        item.bbox.height >= 18 && item.bbox.height <= 22 && item.bbox.width > 20 &&
        (item.styles.background_color === 'rgb(253, 226, 226)' || item.styles.background_color === 'rgb(236, 226, 254)' || item.styles.background_color === 'rgb(238, 229, 255)')
      );
      const bar = segments.length ? descendants.find(item => item.bbox.width >= 500 && item.bbox.height >= 18 && item.bbox.height <= 22 && item.bbox.y === segments[0].bbox.y) : null;
      const barBottom = bar ? bar.bbox.bottom : 0;
      const ticks = descendants.filter(item =>
        item.bbox.y >= barBottom - 2 && item.bbox.y <= barBottom + 28 &&
        /^[-+]?\\d+(?:\\.\\d+)?$/.test(item.text)
      );
      const levels = descendants.filter(item => item.bbox.height >= 23 && item.bbox.height <= 26 && (item.styles.background_color === 'rgb(253, 226, 226)' || item.styles.background_color === 'rgb(236, 226, 254)' || item.styles.background_color === 'rgb(238, 229, 255)'));
      const maxBottom = descendants.reduce((max,item) => Math.max(max, item.bbox.bottom), dialogRect.bottom);
      return {{
        source_state_id:{json.dumps(state_id)}, open:true,
        viewport:{{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}},
        dialog:{{bbox:dialogRect,styles:style(dialog),scroll_width:dialog.scrollWidth,scroll_height:dialog.scrollHeight,client_width:dialog.clientWidth,client_height:dialog.clientHeight}},
        body:body ? {{bbox:rect(body),styles:style(body),scroll_width:body.scrollWidth,scroll_height:body.scrollHeight,client_width:body.clientWidth,client_height:body.clientHeight}} : null,
        preview_input:rect(dialog.querySelector('input[aria-label="预览分数"]')),
        segments, bar, ticks, level_chips:levels,
        visible_content_max_bottom:maxBottom,
        content_overflow_beyond_dialog:maxBottom > dialogRect.bottom + 0.5,
        all_dialog_nodes:descendants
      }};
    }})()"""


def main() -> int:
    parser = argparse.ArgumentParser(description="采集评分映射预览多区间、等分、分隔条和小数位证据")
    parser.add_argument("--url", default="https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules/create")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=9222)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cdp = Cdp(args.port, "idreamsky.feishu.cn")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width":1920,"height":1080,"deviceScaleFactor":1,"mobile":False})
    if "/login" in str(cdp.evaluate("location.pathname")):
        raise SystemExit("Chrome 当前页面未登录，请先打开已登录的飞书绩效页面")

    def reset() -> None:
        list_url = args.url.rsplit("/create", 1)[0] + "?tab=rule"
        cdp.navigate(list_url)
        cdp.navigate(args.url)
        if not cdp.evaluate("location.pathname.endsWith('/create')"):
            raise RuntimeError("未能进入评估规则新建页")

    def set_one(selector: str, value: str, index: int | None = None) -> None:
        if not cdp.evaluate(set_value(selector, value, index)):
            raise RuntimeError(f"未找到输入框：{selector}[{index}]" if index is not None else f"未找到输入框：{selector}")
        cdp.wait(160)

    def choose_mapping() -> None:
        if not cdp.evaluate(click_indexed('input[role="radio"]', 2)):
            raise RuntimeError("未找到评分映射等级型单选项")
        cdp.wait(220)

    def build_intervals(upper_values: list[str], precision_index: int = 0) -> None:
        reset()
        choose_mapping()
        set_one('input.ud__native-input', f"映射预览诊断-{len(upper_values)+1}段", 0)
        set_one('input.ud__native-input', "1", 1)
        set_one('input.ud__native-input', "10", 2)
        for _ in range(len(upper_values) + 1 - 2):
            if not cdp.evaluate(click_button("添加分数子区间")):
                raise RuntimeError("未找到添加分数子区间按钮")
            cdp.wait(180)
        upper_selector = 'input.ud__native-input'
        count = int(cdp.evaluate(f"document.querySelectorAll({json.dumps(upper_selector)}).length"))
        expected_count = 3 + (len(upper_values) + 1) * 4
        if count != expected_count:
            raise RuntimeError(f"区间输入数量异常：期望 {expected_count}，实际 {count}")
        for row, value in enumerate(upper_values):
            set_one(upper_selector, value, 4 + row * 4)
        for row, code in enumerate(["a", "b", "d", "c"][:len(upper_values) + 1]):
            set_one(upper_selector, code, 5 + row * 4)
        if precision_index:
            if not cdp.evaluate(click_indexed('input[role="radio"]', 6 + precision_index)):
                raise RuntimeError("未找到映射小数位单选项")
            cdp.wait(260)

    def capture(name: str, state_id: str) -> dict:
        if not cdp.evaluate(click_button("预览")):
            raise RuntimeError("未找到预览按钮")
        cdp.wait(300)
        snapshot = cdp.evaluate(snapshot_js(state_id))
        if not snapshot.get("open"):
            raise RuntimeError(f"预览未打开：{state_id}")
        cdp.screenshot(args.out / f"{name}.png")
        html = cdp.evaluate("document.documentElement.outerHTML")
        (args.out / f"{name}.html").write_text(str(html), encoding="utf-8")
        (args.out / f"{name}.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
        return snapshot

    records = []
    build_intervals([3, 5, 7], 0)
    records.append(capture("mapping-4-intervals-integer", "RR-PREVIEW-MAPPING-4-INTERVALS-INTEGER"))

    build_intervals([3, 5], 1)
    records.append(capture("mapping-3-intervals-1-decimal", "RR-PREVIEW-MAPPING-3-INTERVALS-1-DECIMAL"))

    build_intervals([3, 5], 2)
    records.append(capture("mapping-3-intervals-2-decimal", "RR-PREVIEW-MAPPING-3-INTERVALS-2-DECIMAL"))

    (args.out / "manifest.json").write_text(json.dumps({
        "objective":"定位评分映射预览多区间容器、区间等分、白色分隔条和小数位显示问题",
        "url":args.url,
        "viewport":{"width":1920,"height":1080,"dpr":1},
        "records":records,
        "safety":["仅执行新建页表单填写和预览，不执行保存、提交、删除或外部跳转"],
        "return_files":["*.png","*.html","*.json","manifest.json"]
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out":str(args.out),"states":len(records)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
