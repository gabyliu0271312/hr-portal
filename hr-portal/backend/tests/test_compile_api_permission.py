# -*- coding: utf-8 -*-
"""Rec1（非阻断 1）：compile-formula 端点权限策略一致性校验。

验证编译预览 API 与旧 translate-formula API 使用相同的
warehouse.metrics:C 权限依赖，杜绝只有数据集访问权但没有
指标模块权限的用户调用编译能力。
"""
from app.ai_formula.router import router


def _find_compile_route():
    for route in router.routes:
        if getattr(route, "path", "") == "/warehouse/metrics/compile-formula":
            return route
    raise AssertionError("compile-formula route not found in ai_formula router")


def test_compile_formula_endpoint_declares_permission_dependency():
    """POST /warehouse/metrics/compile-formula 必须声明 require_op 权限依赖。"""
    route = _find_compile_route()
    assert route.dependencies, (
        "compile-formula 端点缺少权限依赖；"
        "应使用 dependencies=[Depends(require_op('warehouse.metrics', 'C'))]"
    )


def test_compile_formula_permission_matches_old_translate_api():
    """权限依赖闭包变量应包含 warehouse.metrics 资源 + C 操作码，
    与旧 POST /warehouse/metrics/translate-formula 一致。"""
    route = _find_compile_route()
    dep = route.dependencies[0].dependency
    found = set()
    for cell in dep.__closure__ or ():
        try:
            found.add(cell.cell_contents)
        except (TypeError, ValueError):
            pass
    assert "warehouse.metrics" in found, (
        f"compile-formula 权限依赖资源应为 warehouse.metrics，实际闭包变量: {found}"
    )
    assert "C" in found, (
        f"compile-formula 权限依赖操作码应为 C（与旧 translate-formula 一致），"
        f"实际闭包变量: {found}"
    )
