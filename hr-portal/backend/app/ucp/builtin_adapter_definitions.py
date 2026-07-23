"""System-maintained metadata for executable UCP adapters.

The adapter registry is persisted so that the UI can render resource configuration
forms. Executable adapters are registered in Python at application startup. This
catalogue keeps those two layers synchronized without manual registration.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.models import AdapterDefinition


BUILTIN_ADAPTER_DEFINITIONS: tuple[dict[str, Any], ...] = (
    {
        "adapter_code": "BEISEN_PENDING_LIST_ADAPTER",
        "adapter_type": "HTTP",
        "name": "北森待入职名单",
        "description": "从北森拉取待入职人员名单。",
    },
    {
        "adapter_code": "BEISEN_REPORT_PULL_ADAPTER",
        "adapter_type": "HTTP",
        "name": "北森报表读取",
        "description": "复用北森凭证和平台内置接口读取指定 Report ID。",
    },
    {
        "adapter_code": "FEISHU_OFFER_DETAIL_ADAPTER",
        "adapter_type": "HTTP",
        "name": "飞书 Offer 明细",
        "description": "查询飞书招聘 Offer 明细。",
    },
    {
        "adapter_code": "FEISHU_BITABLE_PULL_ADAPTER",
        "adapter_type": "HTTP",
        "name": "飞书多维表格读取",
        "description": "复用飞书凭证读取资源下配置的多维表格数据对象。",
        "schema": {
            "categories": [
                {
                    "key": "protocol",
                    "label": "通用连接配置",
                    "fields": [],
                }
            ]
        },
    },    {
        "adapter_code": "EXCEL_IMPORT_ADAPTER",
        "adapter_type": "FILE",
        "name": "Excel 文件导入",
        "description": "解析上传的 Excel 文件并输出数据行。",
    },
    {
        "adapter_code": "DATASOURCE_BRIDGE_ADAPTER",
        "adapter_type": "DB",
        "name": "数据源桥接",
        "description": "复用平台已配置的数据源。",
    },
    {
        "adapter_code": "PUSH_TARGET_BRIDGE_ADAPTER",
        "adapter_type": "HTTP",
        "name": "推送目标桥接",
        "description": "复用平台已配置的推送目标。",
    },
    {
        "adapter_code": "DIDI_ACCOUNT_PUSH_ADAPTER",
        "adapter_type": "HTTP",
        "name": "企业滴滴账号管理",
        "description": "按入职、离职等生命周期事件创建、停用或删除企业滴滴账号。",
        "schema": {
            "categories": [
                {
                    "key": "protocol",
                    "label": "滴滴接口配置",
                    "fields": [
                        {
                            "name": "auth_mode",
                            "type": "string",
                            "enum": ["basic", "bearer"],
                            "default": "basic",
                            "help": "认证方式，以滴滴开放平台实际接口为准。",
                        },
                        {
                            "name": "endpoints",
                            "type": "object",
                            "help": "上线时配置 CREATE、UPDATE、DISABLE、REACTIVATE、DELETE 接口。",
                        },
                        {
                            "name": "simulate",
                            "type": "boolean",
                            "default": False,
                            "help": "仅开发联调时启用；生产环境必须关闭。",
                        },
                    ],
                }
            ]
        },
    },
    {
        "adapter_code": "CAOCAO_ACCOUNT_PUSH_ADAPTER",
        "adapter_type": "HTTP",
        "name": "曹操出行账号管理",
        "description": "管理曹操出行企业账号。",
    },
    {
        "adapter_code": "OA_ORG_PULL_ADAPTER",
        "adapter_type": "HTTP",
        "name": "OA 组织拉取",
        "description": "从 OA 系统拉取组织架构。",
    },
    {
        "adapter_code": "OA_TARGET_PULL_ADAPTER",
        "adapter_type": "HTTP",
        "name": "目标组织拉取",
        "description": "拉取目标系统组织架构。",
    },
    {
        "adapter_code": "OA_ORG_DIFF_ADAPTER",
        "adapter_type": "TRANSFORM",
        "name": "OA 组织差异比对",
        "description": "比对来源与目标组织架构。",
    },
    {
        "adapter_code": "OA_ORG_PUSH_ADAPTER",
        "adapter_type": "HTTP",
        "name": "OA 组织推送",
        "description": "将组织架构变更推送到目标系统。",
    },
)


async def ensure_builtin_adapter_definitions(db: AsyncSession) -> int:
    """Insert missing built-in adapter metadata and activate it.

    Existing rows are intentionally not overwritten: administrators may enrich
    descriptions or schemas after deployment. The operation is safe to call on
    every application startup.
    """
    codes = [item["adapter_code"] for item in BUILTIN_ADAPTER_DEFINITIONS]
    existing_codes = set(
        (await db.execute(
            select(AdapterDefinition.adapter_code).where(
                AdapterDefinition.adapter_code.in_(codes)
            )
        )).scalars()
    )

    for definition in BUILTIN_ADAPTER_DEFINITIONS:
        if definition["adapter_code"] in existing_codes:
            continue
        db.add(
            AdapterDefinition(
                adapter_code=definition["adapter_code"],
                adapter_type=definition["adapter_type"],
                name=definition["name"],
                description=definition["description"],
                schema_json=definition.get("schema", {}),
                version="1.0.0",
                is_active=True,
                created_by="system",
            )
        )

    created_count = len(codes) - len(existing_codes)
    if created_count:
        await db.commit()
    return created_count
