"""UCP Phase 3-6: OA 组织架构同步 Adapter

实现两个适配器:
  - OA_ORG_PULL_ADAPTER: 从源系统（北森）拉取组织树
  - OA_ORG_PUSH_ADAPTER: 将 diff 推送到目标系统 (OA)

设计:
  - 源数据拉取: 走 BEISEN_PENDING_LIST_ADAPTER 模式, 但调用北森组织 API
  - 目标推送: 模拟实现, 真实环境对接 OA HTTP API
  - 失败可重试, 由 pipeline 引擎统一处理
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.types import AdapterResult
from app.ucp.oa_sync_service import diff_org_trees, OaSyncError

logger = logging.getLogger("ucp.oa_sync_adapters")


# ===== 源系统拉取（北森组织架构） =====


async def oa_org_pull_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """从北森拉取组织架构列表。

    params 应包含:
      - include_inactive: 是否包含已删除部门 (默认 false)
    secrets 应包含:
      - app_key / app_secret (北森)

    返回: AdapterResult
      status: success
      data: [{org_code, org_name, parent_org_code, path, status}, ...]
    """
    include_inactive = bool(params.get("include_inactive", False))

    # 当前为占位实现: 从本地数据库读取 hr_pending_employee_full 派生部门信息
    # 真实环境调用北森组织架构 API (BEISEN_API_ORG_URL)
    try:
        from sqlalchemy import text
        sql = text("""
            SELECT DISTINCT department_name
            FROM hr_pending_employee_full
            WHERE department_name IS NOT NULL
        """)
        result = await db.execute(sql)
        rows = result.fetchall()
    except Exception as e:
        # 表可能不存在 (测试环境) - 返回空数据
        logger.warning("[ucp] oa_org_pull: read db failed: %s", e)
        rows = []

    orgs = []
    for idx, row in enumerate(rows):
        dept_name = row[0] if row else None
        if not dept_name:
            continue
        org_code = f"DEPT-{hashlib.md5(dept_name.encode()).hexdigest()[:8].upper()}"
        orgs.append({
            "org_code": org_code,
            "org_name": dept_name,
            "parent_org_code": None,  # 占位: 真实环境从北森部门树获取
            "path": dept_name,
            "status": "ACTIVE",
        })

    if include_inactive:
        # 真实环境查询已删除部门
        pass

    return AdapterResult(
        status="success",
        data=orgs,
        row_count=len(orgs),
        success_count=len(orgs),
        extra={"source": "BEISEN", "include_inactive": include_inactive},
    )


# ===== 目标系统拉取（OA 当前组织） =====


async def oa_target_pull_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """从 OA 系统拉取当前组织列表。

    真实环境调用 OA HTTP API。
    当前为占位实现: 返回空列表, 配合 oa_org_diff_adapter 使用可识别全部为 CREATED。
    """
    base_url = secrets.get("base_url", "https://oa.example.com")
    # 占位实现: 不实际拉取
    return AdapterResult(
        status="success",
        data=[],
        row_count=0,
        success_count=0,
        extra={"source": "OA", "base_url": base_url, "simulated": True},
    )


# ===== Diff 计算 Adapter =====


async def oa_org_diff_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """计算源 (params.source) 与目标 (params.target) 组织架构的 diff。

    params:
      - source: 源组织列表 (上一环节 data)
      - target: 目标组织列表 (上一环节 data)
      - run_id: OaSyncRun.id, 必填

    返回: AdapterResult.data 为 diff 列表
    """
    source = params.get("source", [])
    target = params.get("target", [])
    run_id = params.get("run_id")

    if not run_id:
        return AdapterResult(
            status="failed",
            error_code="MISSING_RUN_ID",
            error_message="缺少 run_id 参数",
        )

    diffs = diff_org_trees(source, target)

    # 保存到 oa_sync_record
    from app.ucp.oa_sync_service import get_run, save_run_results

    run = await get_run(db, run_id)
    if not run:
        return AdapterResult(
            status="failed",
            error_code="RUN_NOT_FOUND",
            error_message=f"OaSyncRun {run_id} 不存在",
        )

    try:
        await save_run_results(db, run, diffs)
    except Exception as e:
        logger.exception("[ucp] oa diff save failed: %s", e)
        return AdapterResult(
            status="failed",
            error_code="SAVE_FAILED",
            error_message=str(e)[:500],
        )

    return AdapterResult(
        status="success",
        data=diffs,
        row_count=len(diffs),
        success_count=len(diffs),
        extra={
            "run_id": run_id,
            "diff_summary": {
                "created": sum(1 for d in diffs if d["diff_type"] == "CREATED"),
                "updated": sum(1 for d in diffs if d["diff_type"] == "UPDATED"),
                "deleted": sum(1 for d in diffs if d["diff_type"] == "DELETED"),
                "moved": sum(1 for d in diffs if d["diff_type"] == "MOVED"),
                "unchanged": sum(1 for d in diffs if d["diff_type"] == "UNCHANGED"),
            },
        },
    )


# ===== 目标系统推送（OA 更新/创建） =====


async def oa_org_push_adapter(
    params: dict,
    secrets: dict,
    db: AsyncSession,
) -> AdapterResult:
    """将 diff 推送到 OA 系统。

    params:
      - action: CREATE / UPDATE / MOVE / DELETE
      - org_code: 组织 code
      - org_name: 组织名称
      - parent_org_code: 父组织 (MOVE 时使用)
    secrets:
      - base_url / access_token (OA 系统认证)

    当前为占位实现, 真实环境对接 OA HTTP API。
    """
    action = (params.get("action") or "").upper()
    org_code = params.get("org_code", "")
    org_name = params.get("org_name", "")
    parent_org_code = params.get("parent_org_code")

    if not org_code or action not in {"CREATE", "UPDATE", "MOVE", "DELETE"}:
        return AdapterResult(
            status="failed",
            error_code="INVALID_PARAMS",
            error_message="缺少 org_code 或 action 无效",
        )

    # 真实环境: 调用 OA HTTP API
    # current: 占位实现, 返回模拟成功
    return AdapterResult(
        status="success",
        data=[{
            "org_code": org_code,
            "action": action,
            "oa_org_id": f"oa_{hashlib.md5(org_code.encode()).hexdigest()[:12]}",
        }],
        row_count=1,
        success_count=1,
        extra={"action": action, "simulated": True},
    )


def register_oa_sync_adapters() -> None:
    """注册到 ADAPTER_REGISTRY。"""
    from app.ucp.adapters import ADAPTER_REGISTRY
    ADAPTER_REGISTRY["OA_ORG_PULL_ADAPTER"] = oa_org_pull_adapter
    ADAPTER_REGISTRY["OA_TARGET_PULL_ADAPTER"] = oa_target_pull_adapter
    ADAPTER_REGISTRY["OA_ORG_DIFF_ADAPTER"] = oa_org_diff_adapter
    ADAPTER_REGISTRY["OA_ORG_PUSH_ADAPTER"] = oa_org_push_adapter
