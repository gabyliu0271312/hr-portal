import asyncio
import base64
import json
import time
import urllib.parse
import urllib.request

import websockets


def new_page(url: str) -> str:
    request = urllib.request.Request(
        "http://127.0.0.1:9222/json/new?" + urllib.parse.quote(url, safe=":/?=&%"),
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)["webSocketDebuggerUrl"]


async def main() -> None:
    ws_url = new_page("http://frontend/login?redirect=%2Freport%2Fdesigner%2F14")
    async with websockets.connect(ws_url, max_size=16 * 1024 * 1024) as socket:
        message_id = 0

        async def command(method: str, params: dict | None = None) -> dict:
            nonlocal message_id
            message_id += 1
            await socket.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
            while True:
                response = json.loads(await socket.recv())
                if response.get("id") == message_id:
                    if "error" in response:
                        raise RuntimeError(response["error"])
                    return response.get("result", {})

        async def evaluate(expression: str) -> object:
            result = await command("Runtime.evaluate", {"expression": expression, "returnByValue": True, "awaitPromise": True})
            return result.get("result", {}).get("value")

        async def wait_for(expression: str, timeout_seconds: int = 25) -> object:
            deadline = time.monotonic() + timeout_seconds
            while time.monotonic() < deadline:
                result = await evaluate(expression)
                if result:
                    return result
                await asyncio.sleep(0.25)
            raise TimeoutError(f"Timed out waiting for: {expression}")

        async def screenshot(path: str) -> None:
            image = await command("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True})
            with open(path, "wb") as stream:
                stream.write(base64.b64decode(image["data"]))

        await command("Page.enable")
        await command("Runtime.enable")
        await command("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 1200, "deviceScaleFactor": 1, "mobile": False})
        await wait_for("document.readyState === 'complete' && document.querySelectorAll('input').length >= 2")
        await screenshot("/evidence/18-browser-login.png")
        await evaluate("""
            (() => {
              const inputs = document.querySelectorAll('input');
              const set = (element, value) => {
                const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                setter.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
              };
              set(inputs[0], 'admin');
              set(inputs[1], 'Admin@2026');
              document.querySelector('form').requestSubmit();
              return true;
            })()
        """)
        await wait_for("location.pathname === '/report/designer/14' && document.querySelector('.field-workbench')", 35)
        await asyncio.sleep(1)
        await screenshot("/evidence/19-browser-report-designer.png")
        evidence = {
            "url": await evaluate("location.href"),
            "title": await evaluate("document.title"),
            "selected_field_cards": await evaluate("Array.from(document.querySelectorAll('.selected-field')).map(item => item.innerText)"),
            "body_contains_second_instance_label": await evaluate("document.body.innerText.includes('(2)')"),
            "body_text": await evaluate("document.body.innerText"),
        }
        with open("/evidence/20-browser-designer-dom.json", "w", encoding="utf-8") as stream:
            json.dump(evidence, stream, ensure_ascii=False, indent=2)


asyncio.run(main())