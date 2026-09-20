#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path


SOURCE = Path(__file__).with_name("capture_mapping_preview_diagnostics.py")
spec = importlib.util.spec_from_file_location("mapping_diagnostics", SOURCE)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

Cdp = module.Cdp
set_value = module.set_value
click_button = module.click_button
click_indexed = module.click_indexed
snapshot_js = module.snapshot_js


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="采集评分映射预览最小值和最大值指示线边界证据")
    parser.add_argument("--url", default="https://idreamsky.feishu.cn/perf/admin/review-questions/review-rules/create")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--port", type=int, default=9223)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cdp = Cdp(args.port, "idreamsky.feishu.cn")
    cdp.call("Emulation.setDeviceMetricsOverride", {"width": 1920, "height": 1080, "deviceScaleFactor": 1, "mobile": False})

    def reset() -> None:
        list_url = args.url.rsplit("/create", 1)[0] + "?tab=rule"
        cdp.navigate(list_url)
        cdp.navigate(args.url)

    def set_one(selector: str, value: str, index: int | None = None) -> None:
        if not cdp.evaluate(set_value(selector, value, index)):
            raise RuntimeError(f"未找到输入框：{selector}[{index}]")
        cdp.wait(160)

    def prepare() -> None:
        reset()
        if not cdp.evaluate(click_indexed('input[role="radio"]', 2)):
            raise RuntimeError("未找到评分映射等级型单选项")
        cdp.wait(220)
        selector = 'input.ud__native-input'
        set_one(selector, "映射预览边界诊断", 0)
        set_one(selector, "0", 1)
        set_one(selector, "100", 2)
        set_one(selector, "60", 4)
        set_one(selector, "C", 5)
        set_one(selector, "A", 9)
        if not cdp.evaluate(click_button("预览")):
            raise RuntimeError("未找到预览按钮")
        cdp.wait(300)

    def capture(name: str, state_id: str, value: str) -> None:
        selector = '[role="dialog"] input.ud__native-input'
        if not cdp.evaluate(set_value(selector, value)):
            raise RuntimeError(f"未找到预览输入框：{value}")
        cdp.wait(260)
        snapshot = cdp.evaluate(snapshot_js(state_id))
        if not snapshot.get("open"):
            raise RuntimeError(f"预览未打开：{state_id}")
        cdp.screenshot(args.out / f"{name}.png")
        html = cdp.evaluate("document.documentElement.outerHTML")
        (args.out / f"{name}.html").write_text(str(html), encoding="utf-8")
        (args.out / f"{name}.json").write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")

    prepare()
    capture("mapping-value-min", "RR-PREVIEW-MAPPING-VALUE-MIN", "0")
    prepare()
    capture("mapping-value-max", "RR-PREVIEW-MAPPING-VALUE-MAX", "100")
    (args.out / "manifest.json").write_text(json.dumps({
        "objective": "采集评分映射预览最小值/最大值的气泡、指示线、边界夹紧和白色容器关系",
        "url": args.url,
        "viewport": {"width": 1920, "height": 1080, "dpr": 1},
        "states": ["RR-PREVIEW-MAPPING-VALUE-MIN", "RR-PREVIEW-MAPPING-VALUE-MAX"],
        "safety": ["仅填写表单和打开预览，不执行保存、提交或删除"]
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(args.out), "states": 2}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
