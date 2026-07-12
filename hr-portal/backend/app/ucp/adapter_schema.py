"""Phase 5-4: adapter schema 驱动的 resource 配置系统

目标: 解决 ucp_resource 8 个 JSON 字段「含义随 adapter 而变」的痛点

设计:
- AdapterDefinition.schema_json 增加 categories 分组
  {
    "categories": [
      {"key": "protocol", "label": "协议配置", "fields": [...]},
      {"key": "mapping", "label": "字段映射", "fields": [...]},
      ...
    ]
  }
- 每个 category 对应 ucp_resource 的 1 个 JSON 字段
  (key: protocol → resource.protocol, mapping → resource.mapping_config)
- 后端 create_resource/update_resource 按 schema 校验 JSON 字段
- 前端 resource 表单: 选 adapter_code → 拉 schema → 按 categories 动态渲染表单项

向后兼容:
- 旧 schema 格式 (无 categories) 仍可用,后端校验做 best-effort
- resource JSON 字段名维持不变,只是有 schema 校验保护
"""
from __future__ import annotations

from typing import Any

from app.ucp.adapter_registry import AdapterDefinition


# ===== Resource JSON 字段 → category 映射 =====

# 业务约定: ucp_resource 的 8 个 JSON 字段,
# 每个字段对应 1 个 category key. (后端校验和前端渲染都基于这个映射)
RESOURCE_JSON_FIELDS = (
    "protocol",
    "report_config",
    "mapping_config",
    "file_config",
    "scheduling",
    "notification_config",
    "retry_config",
    "circuit_breaker_config",
)


# 每个 category key 对应的"显示标签"(前端 group 标题用)
CATEGORY_LABELS: dict[str, str] = {
    "protocol": "协议配置",
    "report_config": "报表参数",
    "mapping_config": "字段映射",
    "file_config": "文件配置",
    "scheduling": "调度策略",
    "notification_config": "通知配置",
    "retry_config": "重试配置",
    "circuit_breaker_config": "熔断配置",
}


# ===== 字段类型 → 前端控件类型 =====

# 控件类型:
# - text: 单行文本
# - textarea: 多行文本
# - number: 数字
# - boolean: 开关
# - select: 下拉单选
# - json: JSON 编辑器(默认文本, 可被前端降级为 textarea)
FIELD_CONTROL_TYPES = {
    "string": "text",
    "integer": "number",
    "number": "number",
    "boolean": "boolean",
    "object": "json",
    "array": "json",
}


def extract_categories(schema: dict | None) -> list[dict[str, Any]]:
    """从 adapter schema 中提取 categories 列表.

    兼容两种 schema 格式:
    1) 新格式: {"categories": [{"key": "protocol", "label": "协议", "fields": [...]}]}
    2) 旧格式: {"fields": [...]}  → 全部归类到 "protocol" category(向后兼容)
    """
    if not isinstance(schema, dict):
        return []
    if "categories" in schema and isinstance(schema["categories"], list):
        out: list[dict[str, Any]] = []
        for cat in schema["categories"]:
            if not isinstance(cat, dict):
                continue
            key = cat.get("key")
            label = cat.get("label") or CATEGORY_LABELS.get(key, key or "未分类")
            fields = cat.get("fields")
            if not isinstance(fields, list):
                fields = []
            if not key:
                continue
            out.append({"key": key, "label": label, "fields": fields})
        return out
    # 旧格式降级
    legacy_fields = schema.get("fields")
    if isinstance(legacy_fields, list) and legacy_fields:
        return [
            {
                "key": "protocol",
                "label": CATEGORY_LABELS["protocol"],
                "fields": legacy_fields,
            }
        ]
    return []


def serialize_schema_for_client(defn: AdapterDefinition | None) -> dict:
    """把 AdapterDefinition 序列化为前端期望的 schema 结构.

    返回:
    {
        "adapter_code": "BEISEN_EMPLOYEE",
        "adapter_type": "HTTP",
        "version": "1.0.0",
        "categories": [{"key": "protocol", "label": "...", "fields": [...]}]
    }
    """
    if defn is None:
        return {
            "adapter_code": None,
            "adapter_type": None,
            "version": None,
            "categories": [],
        }
    schema = defn.schema_json or {}
    categories = extract_categories(schema)
    return {
        "adapter_code": defn.adapter_code,
        "adapter_type": defn.adapter_type,
        "version": defn.version,
        "categories": categories,
    }


def _check_field_type(field_name: str, value: Any, expected_type: str) -> str | None:
    """校验字段值类型, 返回错误消息或 None."""
    if expected_type == "string":
        if not isinstance(value, str):
            return f"字段 {field_name!r} 应为 string, 实际 {type(value).__name__}"
    elif expected_type == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            return f"字段 {field_name!r} 应为 integer, 实际 {type(value).__name__}"
    elif expected_type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return f"字段 {field_name!r} 应为 number, 实际 {type(value).__name__}"
    elif expected_type == "boolean":
        if not isinstance(value, bool):
            return f"字段 {field_name!r} 应为 boolean, 实际 {type(value).__name__}"
    elif expected_type == "array":
        if not isinstance(value, list):
            return f"字段 {field_name!r} 应为 array, 实际 {type(value).__name__}"
    elif expected_type == "object":
        if not isinstance(value, dict):
            return f"字段 {field_name!r} 应为 object, 实际 {type(value).__name__}"
    return None


def validate_payload_against_schema(
    payload: dict[str, Any],
    categories: list[dict[str, Any]],
) -> list[str]:
    """根据 schema 校验 resource 各 JSON 字段的 payload.

    payload 形如: {"protocol": {...}, "mapping_config": {...}, ...}
    每个 key 是 RESOURCE_JSON_FIELDS 中的 1 个.

    返回错误消息列表(空列表 = 通过).
    """
    errors: list[str] = []
    if not categories:
        # schema 为空, 跳过校验
        return errors

    cat_by_key = {c["key"]: c for c in categories}
    for cat_key, cat in cat_by_key.items():
        cat_value = payload.get(cat_key)
        if cat_value is None:
            # 未提供该 category 字段, 检查是否所有字段都是 required
            required_in_cat = [f for f in cat.get("fields", []) if f.get("required")]
            if required_in_cat:
                names = [f["name"] for f in required_in_cat]
                errors.append(
                    f"category {cat['label']!r}({cat_key}) 缺失, 必填字段: {names}"
                )
            continue
        if not isinstance(cat_value, dict):
            errors.append(
                f"category {cat['label']!r}({cat_key}) 应为 object, 实际 {type(cat_value).__name__}"
            )
            continue
        # 校验每个字段
        seen = set()
        for f in cat.get("fields", []):
            if not isinstance(f, dict):
                continue
            fname = f.get("name")
            if not isinstance(fname, str) or not fname:
                continue
            seen.add(fname)
            ftype = f.get("type", "string")
            fval = cat_value.get(fname)
            if fval is None:
                if f.get("required"):
                    errors.append(
                        f"category {cat['label']!r} 字段 {fname!r} 必填"
                    )
                continue
            err = _check_field_type(fname, fval, ftype)
            if err:
                errors.append(f"{cat['label']} - {err}")
            if ftype == "string" and f.get("enum"):
                allowed = f["enum"]
                if isinstance(allowed, list) and fval not in allowed:
                    errors.append(
                        f"category {cat['label']!r} 字段 {fname!r} 取值不在枚举内: {allowed}"
                    )
        # 未知字段警告(但不阻断)
        for extra in cat_value.keys() - seen:
            # 静默忽略, 允许向后兼容存旧字段
            pass
    return errors


def normalize_payload_from_client(
    form_values: dict[str, Any],
    categories: list[dict[str, Any]],
) -> dict[str, Any]:
    """把前端按 category 组织的 form_values 转换为后端 resource JSON 字段.

    form_values: {"protocol": {"base_url": "..."}, "scheduling": {"cron": "..."}}
    返回: 同结构,只保留 schema 中声明的字段(过滤前端额外的内部字段)
    """
    out: dict[str, Any] = {}
    for cat in categories:
        key = cat.get("key")
        if not key:
            continue
        cat_form = form_values.get(key)
        if not isinstance(cat_form, dict):
            continue
        cleaned: dict[str, Any] = {}
        for f in cat.get("fields", []):
            if not isinstance(f, dict):
                continue
            fname = f.get("name")
            if not isinstance(fname, str) or not fname:
                continue
            if fname in cat_form and cat_form[fname] is not None and cat_form[fname] != "":
                cleaned[fname] = cat_form[fname]
        if cleaned:
            out[key] = cleaned
    return out
