#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import socket
import struct
import time
import urllib.request
from pathlib import Path
from typing import Any


class Cdp:
    def __init__(self, port: int, url_hint: str):
        pages = json.loads(urllib.request.urlopen(f"http://[::1]:{port}/json").read())
        page = next(
            (item for item in pages if item.get("type") == "page" and url_hint in item.get("url", "")),
            next(item for item in pages if item.get("type") == "page"),
        )
        ws_path = "/" + "/".join(page["webSocketDebuggerUrl"].split("/")[3:])
        self.socket = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        self.socket.connect(("::1", port))
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET {ws_path} HTTP/1.1\r\nHost: [::1]:{port}\r\nUpgrade: websocket\r\n"
            f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )
        self.socket.sendall(request.encode())
        response = b""
        while b"\r\n\r\n" not in response:
            response += self.socket.recv(4096)
        self.sequence = 0

    def _send(self, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, separators=(",", ":")).encode()
        mask = os.urandom(4)
        length = len(data)
        if length < 126:
            header = bytes([0x81, 0x80 | length])
        elif length < 65536:
            header = bytes([0x81, 0x80 | 126]) + struct.pack(">H", length)
        else:
            header = bytes([0x81, 0x80 | 127]) + struct.pack(">Q", length)
        masked = bytes(value ^ mask[index % 4] for index, value in enumerate(data))
        self.socket.sendall(header + mask + masked)

    def _receive(self) -> dict[str, Any]:
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

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.sequence += 1
        self._send({"id": self.sequence, "method": method, "params": params or {}})
        while True:
            response = self._receive()
            if response.get("id") == self.sequence:
                return response

    def evaluate(self, expression: str) -> Any:
        response = self.call(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": True},
        )
        result = response.get("result", {})
        if "exceptionDetails" in result:
            raise RuntimeError(result["exceptionDetails"])
        return result.get("result", {}).get("value")

    def wait(self, milliseconds: int = 250) -> None:
        self.evaluate(f"new Promise(resolve => setTimeout(resolve, {milliseconds}))")

    def navigate(self, url: str) -> None:
        self.call("Page.navigate", {"url": url})
        self.wait(900)
        self.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()")
        self.wait(300)

    def screenshot(self, path: Path) -> None:
        result = self.call(
            "Page.captureScreenshot",
            {"format": "png", "captureBeyondViewport": False, "fromSurface": True},
        )
        path.write_bytes(base64.b64decode(result["result"]["data"]))

    def move_mouse(self, x: float, y: float) -> None:
        self.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        self.wait(180)


def js_text_click(text: str, selector: str = "button") -> str:
    return f"""(() => {{
      const wanted = {json.dumps(text)};
      const elements = [...document.querySelectorAll({json.dumps(selector)})];
      const element = elements.find(item => item.innerText.trim() === wanted && item.getBoundingClientRect().width > 0);
      if (!element) return false;
      element.click();
      return true;
    }})()"""


def set_input_value(selector: str, value: str) -> str:
    return f"""(() => {{
      const elements = [...document.querySelectorAll({json.dumps(selector)})];
      const element = elements.find(item => item.getBoundingClientRect().width > 0);
      if (!element) return false;
      const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
      setter.call(element, {json.dumps(value)});
      element.dispatchEvent(new Event('input', {{ bubbles: true }}));
      element.dispatchEvent(new Event('change', {{ bubbles: true }}));
      return true;
    }})()"""


def set_indexed_values(selector: str, values: list[str]) -> str:
    return f"""(() => {{
      const elements = [...document.querySelectorAll({json.dumps(selector)})];
      if (elements.length < {len(values)}) return false;
      for (const [index, value] of {json.dumps(values)}.entries()) {{
        const element = elements[index];
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
        setter.call(element, value);
        element.dispatchEvent(new Event('input', {{ bubbles: true }}));
        element.dispatchEvent(new Event('change', {{ bubbles: true }}));
      }}
      return true;
    }})()"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture fixed-score preview responsive states through Chrome CDP")
    parser.add_argument(
        "--url",
        default="https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules/create",
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=9222)
    parser.add_argument("--width", type=int, default=894)
    parser.add_argument("--height", type=int, default=631)
    parser.add_argument("--dpr", type=float, default=1)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    cdp = Cdp(args.port, "idreamsky.feishu.cn")
    cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {
            "width": args.width,
            "height": args.height,
            "deviceScaleFactor": args.dpr,
            "mobile": False,
        },
    )

    if "/login" in str(cdp.evaluate("location.pathname")):
        raise SystemExit("Chrome 当前页面未登录，请先打开已登录的飞书绩效页面")

    def reset() -> None:
        list_url = args.url.rsplit("/create", 1)[0] + "?tab=rule"
        cdp.navigate(list_url)
        cdp.navigate(args.url)
        if not cdp.evaluate("location.pathname.endsWith('/create')"):
            raise RuntimeError("未能进入评估规则新建页")

    def click_text(text: str, selector: str = "button") -> None:
        if not cdp.evaluate(js_text_click(text, selector)):
            raise RuntimeError(f"未找到可点击目标：{text}")
        cdp.wait(220)

    def set_value(selector: str, value: str) -> None:
        if not cdp.evaluate(set_input_value(selector, value)):
            raise RuntimeError(f"未找到输入框：{selector}")
        cdp.wait(120)

    def set_values(selector: str, values: list[str]) -> None:
        if not cdp.evaluate(set_indexed_values(selector, values)):
            raise RuntimeError(f"输入框数量不足：{selector}，需要 {len(values)} 个")
        cdp.wait(240)

    def choose_score_fixed() -> None:
        labels = cdp.evaluate("""(() => [...document.querySelectorAll('label')].map(item => item.innerText.trim()).filter(Boolean))()""")
        if "评分" not in labels:
            raise RuntimeError("未找到评估类型“评分”选项")
        click_text("评分", "label")
        click_text("在固定分值选项内选择评分", "label")

    def add_one() -> None:
        clicked = cdp.evaluate(js_text_click("添加分值"))
        if not clicked:
            raise RuntimeError("未找到添加分值按钮")
        cdp.wait(180)

    def option_count() -> int:
        return int(cdp.evaluate("document.querySelectorAll('input[placeholder=\"请输入分值\"]').length"))

    def build_count(count: int) -> None:
        reset()
        choose_score_fixed()
        current = option_count()
        while current < count:
            add_one()
            current = option_count()
        if current != count:
            raise RuntimeError(f"固定分值数量异常：期望 {count}，实际 {current}")
        set_values('input[placeholder="请输入分值"]', [str(index) for index in range(1, count + 1)])
        set_value('input[placeholder="请输入名称"]', f"固定分值专项采集-{count}")

    def stable_style(element: str) -> dict[str, Any]:
        return cdp.evaluate(f"""(() => {{
          const node = {element};
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {{
            tag: node.tagName,
            text: node.innerText?.trim() || node.textContent?.trim() || "",
            class_name: node.className?.baseVal || node.className || "",
            bbox: {{x: rect.x, y: rect.y, width: rect.width, height: rect.height}},
            styles: {{
              display: style.display,
              position: style.position,
              width: style.width,
              height: style.height,
              margin_left: style.marginLeft,
              padding: style.padding,
              font_family: style.fontFamily,
              font_size: style.fontSize,
              font_weight: style.fontWeight,
              line_height: style.lineHeight,
              color: style.color,
              background_color: style.backgroundColor,
              border: style.border,
              border_radius: style.borderRadius,
              box_shadow: style.boxShadow,
              cursor: style.cursor,
              z_index: style.zIndex,
              align_items: style.alignItems,
              overflow: style.overflow
            }}
          }};
        }})()""")

    def preview_nodes() -> dict[str, Any]:
        return cdp.evaluate("""(() => {
          const dialog = document.querySelector('[role="dialog"]');
          if (!dialog) return {open: false, options: [], arrows: []};
          const options = [...dialog.querySelectorAll('div.flex-shrink-0.rounded-full')].map((node, index) => {
            const rect = node.getBoundingClientRect();
            const first = node.firstElementChild;
            const style = getComputedStyle(node);
            return {
              index,
              value: first?.textContent?.trim() || "",
              bbox: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
              styles: {
                color: style.color,
                background_color: style.backgroundColor,
                border: style.border,
                border_radius: style.borderRadius,
                box_shadow: style.boxShadow,
                cursor: style.cursor,
                display: style.display,
                width: style.width,
                height: style.height,
                margin_left: style.marginLeft,
                font_family: style.fontFamily,
                font_size: style.fontSize,
                font_weight: style.fontWeight,
                line_height: style.lineHeight,
                align_items: style.alignItems
              }
            };
          }).filter(item => item.bbox.width > 0 && item.bbox.height > 0);
          const arrows = [...dialog.querySelectorAll('svg[data-icon="RightOutlined"], svg[data-icon="LeftOutlined"]')].map(svg => {
            const holder = svg.closest('div.z-20, div.z-10') || svg.parentElement;
            const rect = holder.getBoundingClientRect();
            const style = getComputedStyle(holder);
            return {
              icon: svg.dataset.icon,
              bbox: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
              svg_bbox: (() => { const r = svg.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })(),
              style: {color: style.color, background_image: style.backgroundImage, cursor: style.cursor, z_index: style.zIndex}
            };
          });
          const strip = dialog.querySelector('div.pt-2') || [...dialog.querySelectorAll('div')].find(node => node.className?.includes?.('hide-scroll'));
          return {
            open: true,
            dialog: stable(dialog),
            strip: strip ? stable(strip) : null,
            options,
            arrows
          };
          function stable(node) {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
              bbox: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
              class_name: node.className?.baseVal || node.className || "",
              styles: {
                display: style.display,
                position: style.position,
                width: style.width,
                height: style.height,
                margin_left: style.marginLeft,
                padding: style.padding,
                font_family: style.fontFamily,
                font_size: style.fontSize,
                font_weight: style.fontWeight,
                line_height: style.lineHeight,
                color: style.color,
                background_color: style.backgroundColor,
                border: style.border,
                border_radius: style.borderRadius,
                box_shadow: style.boxShadow,
                overflow_x: style.overflowX,
                overflow_y: style.overflowY,
                align_items: style.alignItems,
                z_index: style.zIndex
              }
            };
          }
        })()""")

    def page_layout() -> dict[str, Any]:
        return cdp.evaluate("""(() => {
          const rect = node => { const value = node?.getBoundingClientRect(); return value ? {x:value.x,y:value.y,width:value.width,height:value.height} : null; };
          const nodes = [...document.querySelectorAll('body *')].filter(node => {
            const value = node.getBoundingClientRect();
            return value.width > 0 && value.height > 0 && (node.matches('button,input,textarea,svg') || node.className?.toString().includes('rounded-full') || node.className?.toString().includes('pt-2') || node.getAttribute('role') === 'dialog');
          }).slice(0, 250).map(node => ({tag:node.tagName, class_name:node.className?.baseVal || node.className || '', text:node.innerText?.trim() || '', role:node.getAttribute('role') || '', data_icon:node.dataset?.icon || '', bbox:rect(node)}));
          return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}, document:{scroll_width:document.documentElement.scrollWidth,scroll_height:document.documentElement.scrollHeight}, nodes};
        })()""")

    def full_html() -> str:
        return str(cdp.evaluate("document.documentElement.outerHTML"))

    def capture(name: str, source_state_id: str, action: dict[str, Any] | None = None) -> dict[str, Any]:
        cdp.wait(180)
        html = full_html()
        preview = preview_nodes()
        computed = {
            "source_state_id": source_state_id,
            "preview": preview,
            "controls": cdp.evaluate("""(() => [...document.querySelectorAll('button,input,textarea')].map(node => {
              const rect=node.getBoundingClientRect(); const style=getComputedStyle(node);
              return {tag:node.tagName,text:node.innerText?.trim() || node.value || '',placeholder:node.getAttribute('placeholder') || '',disabled:node.disabled || false,readonly:node.readOnly || false,bbox:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},styles:{color:style.color,background_color:style.backgroundColor,border:style.border,cursor:style.cursor,display:style.display,width:style.width,height:style.height,margin_left:style.marginLeft,font_family:style.fontFamily,font_size:style.fontSize,font_weight:style.fontWeight,line_height:style.lineHeight,align_items:style.alignItems}};
            }))()""")
        }
        layout = page_layout()
        screenshot = args.out / f"{name}.png"
        cdp.screenshot(screenshot)
        (args.out / f"{name}.html").write_text(html, encoding="utf-8")
        (args.out / f"{name}.layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=2), encoding="utf-8")
        (args.out / f"{name}.computed.json").write_text(json.dumps(computed, ensure_ascii=False, indent=2), encoding="utf-8")
        contract = {
            "source_state_id": source_state_id,
            "viewport": {"width": args.width, "height": args.height, "dpr": args.dpr},
            "geometry": {"preview": preview.get("dialog"), "strip": preview.get("strip"), "options": preview.get("options"), "arrows": preview.get("arrows")},
            "styles": computed,
            "svg": cdp.evaluate("""(() => [...document.querySelectorAll('svg[data-icon]')].map(svg => ({data_icon:svg.dataset.icon,viewBox:svg.getAttribute('viewBox'),path:svg.querySelector('path')?.getAttribute('d') || '',bbox:(() => {const r=svg.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()})))()"""),
        }
        (args.out / f"{name}.target_contract.json").write_text(json.dumps(contract, ensure_ascii=False, indent=2), encoding="utf-8")
        evidence = {
            "source_state_id": source_state_id,
            "action": action or {"kind": "state_capture"},
            "before_html": f"{name}.html",
            "after_html": f"{name}.html",
            "layout": f"{name}.layout.json",
            "computed": f"{name}.computed.json",
            "target_contract": f"{name}.target_contract.json",
            "screenshot": f"{name}.png",
            "interaction_evidence": f"{name}.interaction_evidence.json",
            "fingerprint": hashlib.sha256(html.encode()).hexdigest(),
        }
        (args.out / f"{name}.interaction_evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
        return {"name": name, "source_state_id": source_state_id, "preview": preview, "action": action}

    def capture_form_count(count: int) -> dict[str, Any]:
        build_count(count)
        return capture(f"form-{count:02d}", f"RR-SCORE-FIXED-OPTIONS-COUNT-{count}", {"kind": "count-boundary", "count": count})

    def open_preview(count: int) -> None:
        click_text("预览")
        if not bool(cdp.evaluate("Boolean(document.querySelector('[role=\"dialog\"]'))")):
            raise RuntimeError(f"{count}项预览未打开")
        cdp.wait(220)

    def capture_preview_state(count: int, suffix: str = "default") -> dict[str, Any]:
        return capture(f"preview-{count:02d}-{suffix}", f"RR-PREVIEW-SCORE-FIXED-OPTIONS-{count}-{suffix.upper()}", {"kind": "preview", "count": count, "variant": suffix})

    def hover_value(value: str, suffix: str, count: int) -> dict[str, Any]:
        bbox = cdp.evaluate(f"""(() => {{
          const wanted = {json.dumps(value)};
          const node = [...document.querySelectorAll('[role="dialog"] div.flex-shrink-0.rounded-full')].find(item => item.firstElementChild?.textContent?.trim() === wanted);
          if (!node) return null;
          const r=node.getBoundingClientRect(); return {{x:r.x,y:r.y,width:r.width,height:r.height}};
        }})()""")
        if not bbox:
            raise RuntimeError(f"预览中未找到选项 {value}")
        cdp.move_mouse(bbox["x"] + bbox["width"] / 2, bbox["y"] + bbox["height"] / 2)
        return capture_preview_state(count, suffix)

    def click_preview_arrow(icon: str) -> None:
        clicked = cdp.evaluate(f"""(() => {{ const svg=document.querySelector('[role="dialog"] svg[data-icon={json.dumps(icon)}]'); if (!svg) return false; (svg.closest('div.z-20, div.z-10') || svg).click(); return true; }})()""")
        if not clicked:
            raise RuntimeError(f"未找到预览箭头：{icon}")
        cdp.wait(300)

    manifest: dict[str, Any] = {
        "schema_version": 1,
        "objective": "PM-T006 fixed-score preview responsive capture",
        "url": args.url,
        "viewport": {"width": args.width, "height": args.height, "dpr": args.dpr},
        "source_states": [],
        "notes": ["No submit/save/delete action was executed", "Values are test-only and remain unsaved"],
    }

    for count in (2, 5, 10, 11, 20):
        manifest["source_states"].append(capture_form_count(count))

    for count in (2, 5, 10, 11, 20):
        build_count(count)
        open_preview(count)
        manifest["source_states"].append(capture_preview_state(count))
        if count <= 10:
            manifest["source_states"].append(hover_value("1", "first-hover", count))
            manifest["source_states"].append(hover_value(str(count), "last-hover", count))
        else:
            manifest["source_states"].append(hover_value("5", "middle-hover", count))
            manifest["source_states"].append(hover_value("10", "right-edge-hover", count))
            click_preview_arrow("RightOutlined")
            manifest["source_states"].append(capture_preview_state(count, "after-right"))
            visible = cdp.evaluate("""(() => [...document.querySelectorAll('[role="dialog"] div.flex-shrink-0.rounded-full')].map(node => node.firstElementChild?.textContent?.trim() || '').filter(Boolean))()""")
            if visible:
                manifest["source_states"].append(hover_value(visible[len(visible) // 2], "after-right-middle-hover", count))
                manifest["source_states"].append(hover_value(visible[0], "after-right-left-edge-hover", count))
            if count == 20:
                click_preview_arrow("LeftOutlined")
                manifest["source_states"].append(capture_preview_state(count, "after-left"))
        if bool(cdp.evaluate("Boolean(document.querySelector('[role=\"dialog\"]'))")):
            closed = cdp.evaluate("""(() => { const svg = document.querySelector('[role=\"dialog\"] svg[data-icon=\"CloseOutlined\"]'); if (!svg) return false; (svg.closest('button') || svg).click(); return true; })()""")
            if not closed:
                raise RuntimeError("未找到 CloseOutlined 关闭按钮")
            cdp.wait(250)

    (args.out / "capture-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(args.out), "states": len(manifest["source_states"]), "viewport": manifest["viewport"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
