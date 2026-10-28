from starlette.responses import JSONResponse

from app.identity_switch.service import current_switch


class IdentitySwitchMiddleware:
    def __init__(self, app, session_factory=None):
        self.app = app
        self.session_factory = session_factory

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        if b"x-app-switch-session" in headers and not scope["path"].startswith("/api/v1/performance/"):
            response = JSONResponse({"detail": {"code": "SWITCH_APP_NOT_SUPPORTED", "message": "切换会话仅允许访问绩效应用"}}, status_code=403)
            return await response(scope, receive, send)
        token = current_switch.set(None)
        try:
            await self.app(scope, receive, send)
            call = current_switch.get()
            if call is not None and scope.get("method") in {"POST", "PUT", "PATCH", "DELETE"}:
                from app.identity_switch.notifications import finalize_operation
                await finalize_operation(call, self.session_factory)
        finally:
            current_switch.reset(token)
