"""UCP 通知闭环服务

复用飞书通知服务实现 UCP 级通知闭环。

职责：
  1. 流水线执行完成后发送结果通知
  2. 支持 SUCCESS / FAILED / PARTIAL_SUCCESS 三种状态通知
  3. 通知变量注入（pipeline 统计、步骤统计等）
  4. 通知去重（dedup_key）
  5. 通知日志记录到 ucp_notification_log

Phase 1A 简化版：
  - 不做 pipeline 级通知策略配置，只支持 pipeline 配置中的 notification_config
  - NOTIFY 步骤直接调用飞书通知服务
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.feishu.notification_service import send_notification
from app.integrations.feishu.schemas import (
    MessageConfig,
    NotificationConfig,
    ReceiverRule,
)
from app.ucp.masking import mask_dict, mask_value
from app.ucp.models import UcpNotificationLog

logger = logging.getLogger("ucp.notifier")


async def send_pipeline_notification(
    db: AsyncSession,
    trace_id: str,
    pipeline_run_id: str,
    notify_config: dict | None,
    ctx: Any,
    overall_status: str | None = None,
    partial_severity: dict | None = None,
) -> dict:
    """发送流水线执行结果通知。

    notify_config 格式参照 spec §12.2 中的 notification_config。
    Phase 1A 支持：
      - on_success / on_failure / on_partial_success 三种触发条件
      - receivers: ["config_owner", "custom:open_id_xxx"]
      - template: 使用飞书通知模板或简单 markdown

    Phase 2-3 增强：
      - partial_severity：携带 PARTIAL 严重度信息，渲染到通知内容
      - 严重度为 CRITICAL 时自动追加 escalation_chat_ids
    """
    if not notify_config:
        return {"status": "skipped"}

    # 确定触发条件
    status = overall_status or "unknown"
    trigger_key = None
    if status == "SUCCESS":
        trigger_key = "on_success"
    elif status == "FAILED":
        trigger_key = "on_failure"
    elif status == "PARTIAL_SUCCESS":
        trigger_key = "on_partial_success"

    if not trigger_key:
        return {"status": "skipped", "reason": "no matching trigger"}

    condition_config = notify_config.get(trigger_key, {})
    if not condition_config or not condition_config.get("enabled"):
        return {"status": "skipped", "reason": f"{trigger_key} not enabled"}

    # Phase 2-3：CRITICAL 严重度升级接收人
    if (
        partial_severity
        and partial_severity.get("severity") == "CRITICAL"
    ):
        escalation = notify_config.get("escalation_chat_ids") or []
        if escalation:
            # 在保留原 receivers 的同时追加升级接收人（去重）
            original_receivers = list(condition_config.get("receivers", []))
            extra = [f"custom:{cid}" for cid in escalation if f"custom:{cid}" not in original_receivers]
            if extra:
                condition_config = dict(condition_config)
                condition_config["receivers"] = original_receivers + extra
                logger.warning(
                    "[ucp] PARTIAL CRITICAL escalation: pipeline=%s added_receivers=%s",
                    pipeline_run_id, extra,
                )

    # 去重检查
    dedup_key = _build_dedup_key(trace_id, trigger_key, condition_config.get("receivers", []))
    existing = (
        await db.execute(
            select(UcpNotificationLog).where(
                UcpNotificationLog.dedup_key == dedup_key,
                UcpNotificationLog.send_status != "dedup_skipped",
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        logger.info("[ucp] notification dedup skipped: dedup_key=%s", dedup_key)
        # 写一条 dedup_skipped 日志
        await _write_notification_log(
            db, trace_id, pipeline_run_id, dedup_key, "dedup_skipped",
            condition_config, "notification dedup: already sent",
        )
        return {"status": "dedup_skipped"}

    # 构建通知上下文变量
    context_vars = _build_context_vars(ctx, overall_status, partial_severity)

    # 构建消息内容（脱敏后）
    message_content = _render_notification_message(status, context_vars, condition_config, partial_severity)
    masked_content = mask_dict(message_content)

    # 构建飞书 NotificationConfig
    feishu_config = _build_feishu_notification_config(condition_config, message_content)

    # 发送通知
    try:
        send_result = await send_notification(
            feishu_config,
            context_vars,
            db,
            biz_type="ucp_pipeline",
            biz_id=pipeline_run_id,
            triggered_by=None,
        )

        # 写通知日志
        await _write_notification_log(
            db, trace_id, pipeline_run_id, dedup_key,
            send_result.status,
            condition_config,
            None,
            send_result=send_result,
            masked_content=masked_content,
        )

        return {
            "status": send_result.status,
            "success_count": send_result.success_count,
            "failed_count": send_result.failed_count,
            "log_id": send_result.log_id,
        }
    except Exception as e:
        logger.exception("[ucp] notification send failed: %s", e)
        await _write_notification_log(
            db, trace_id, pipeline_run_id, dedup_key, "failed",
            condition_config, str(e)[:500],
            masked_content=masked_content,
        )
        return {"status": "failed", "error": str(e)[:500]}


def _build_dedup_key(trace_id: str, trigger_key: str, receivers: list) -> str:
    """构建通知去重键：trace_id + trigger_key + receivers hash。"""
    material = f"{trace_id}|{trigger_key}|{json.dumps(sorted(str(r) for r in receivers), ensure_ascii=False)}"
    return hashlib.sha256(material.encode()).hexdigest()[:64]


def _build_context_vars(ctx: Any, overall_status: str, partial_severity: dict | None = None) -> dict:
    """从 PipelineContext 构建通知可用的变量 dict。"""
    vars_dict: dict[str, Any] = {
        "execution_status": overall_status,
        "execution_pipeline_code": "",
        "execution_trace_id": "",
        "execution_duration": "",
    }

    # Phase 2-3：PARTIAL 严重度变量
    if partial_severity:
        vars_dict["partial_severity"] = partial_severity.get("severity", "NONE")
        vars_dict["partial_severity_label"] = partial_severity.get("label", "")
        vars_dict["partial_total_failed"] = partial_severity.get("total_failed", 0)
        vars_dict["partial_total_not_found"] = partial_severity.get("total_not_found", 0)
        vars_dict["partial_total"] = partial_severity.get("total", 0)
        # 步骤级严重度
        for idx, step_sev in enumerate(partial_severity.get("step_severities", [])):
            vars_dict[f"partial_step_{idx}_severity"] = step_sev.get("severity", "NONE")
            vars_dict[f"partial_step_{idx}_label"] = step_sev.get("label", "")

    # 从 context 填充
    execution_info = ctx.get("execution") or {}
    if isinstance(execution_info, dict):
        vars_dict["execution_pipeline_code"] = execution_info.get("pipeline_code", "")
        vars_dict["execution_trace_id"] = execution_info.get("trace_id", "")
        vars_dict["execution_run_id"] = execution_info.get("pipeline_run_id", "")

    # 从 stats 填充
    for step_id, stats in ctx.stats.items():
        for key, value in stats.items():
            # 脱敏
            if key in ("error", "error_message"):
                vars_dict[f"{step_id}_{key}"] = mask_value(str(value), key)
            else:
                vars_dict[f"{step_id}_{key}"] = value

    # 特殊变量：Offer 同步统计
    vars_dict["pending_count"] = vars_dict.get("pull_pending_list_row_count", 0)
    vars_dict["offer_success_count"] = vars_dict.get("pull_offer_detail_success_count", 0)
    vars_dict["offer_failed_count"] = vars_dict.get("pull_offer_detail_failed_count", 0)
    vars_dict["merged_count"] = vars_dict.get("merge_and_write_row_count", 0)

    return vars_dict


def _render_notification_message(
    status: str,
    context_vars: dict,
    config: dict,
    partial_severity: dict | None = None,
) -> dict:
    """渲染通知消息内容。

    Phase 2-3 增强：
      - PARTIAL_SUCCESS 时附带严重度标识（⚠️ WARNING / 🚨 CRITICAL）
      - 严重度信息行展示
    """
    template = config.get("template", "pipeline_result")
    custom_title = config.get("title", "")
    custom_content = config.get("content", "")

    if custom_title and custom_content:
        # 自定义模板，变量替换
        title = _replace_vars(custom_title, context_vars)
        content = _replace_vars(custom_content, context_vars)
    else:
        # 默认模板
        title_map = {
            "SUCCESS": "✅ 流水线执行成功",
            "FAILED": "❌ 流水线执行失败",
        }
        # Phase 2-3：PARTIAL 标题按严重度区分
        if status == "PARTIAL_SUCCESS" and partial_severity:
            sev = partial_severity.get("severity", "WARNING")
            if sev == "CRITICAL":
                title = "🚨 流水线严重部分失败"
            else:
                title = "⚠️ 流水线部分成功（请关注）"
        else:
            title = title_map.get(status, f"流水线执行结果: {status}")

        content_parts = [
            f"**流水线**: {context_vars.get('execution_pipeline_code', 'N/A')}",
            f"**Trace ID**: {context_vars.get('execution_trace_id', 'N/A')}",
            f"**状态**: {status}",
        ]

        # Phase 2-3：PARTIAL 严重度信息行
        if status == "PARTIAL_SUCCESS" and partial_severity:
            content_parts.append(f"**严重度**: {partial_severity.get('label', 'N/A')}")
            content_parts.append(
                f"**统计**: 总数 {partial_severity.get('total', 0)}, "
                f"失败 {partial_severity.get('total_failed', 0)}, "
                f"未找到 {partial_severity.get('total_not_found', 0)}"
            )

        # 添加 Offer 同步统计（如果存在）
        if "pending_count" in context_vars:
            content_parts.extend([
                "---",
                f"**待入职人数**: {context_vars.get('pending_count', 0)}",
                f"**Offer 成功数**: {context_vars.get('offer_success_count', 0)}",
                f"**Offer 失败数**: {context_vars.get('offer_failed_count', 0)}",
                f"**合并写入数**: {context_vars.get('merged_count', 0)}",
            ])

        content = "\n".join(content_parts)

    return {"title": title, "content": content}


def _replace_vars(template: str, vars_dict: dict) -> str:
    """简单变量替换：{{var_name}} → value。"""
    import re
    def replacer(match):
        var_name = match.group(1)
        value = vars_dict.get(var_name, match.group(0))
        return str(value)
    return re.sub(r"\{\{(\w+)\}\}", replacer, template)


def _build_feishu_notification_config(condition_config: dict, message_content: dict) -> NotificationConfig:
    """将 UCP 通知配置转换为飞书 NotificationConfig。"""
    receivers_config = condition_config.get("receivers", [])
    receiver_rules = []
    for r in receivers_config:
        if r == "config_owner":
            receiver_rules.append(ReceiverRule(rule_type="config_owner", params={}))
        elif r == "view_owner":
            receiver_rules.append(ReceiverRule(rule_type="view_owner", params={}))
        elif r == "it_oncall":
            receiver_rules.append(ReceiverRule(rule_type="it_oncall", params={}))
        elif r == "pipeline_owner":
            receiver_rules.append(ReceiverRule(rule_type="pipeline_owner", params={}))
        elif str(r).startswith("custom:"):
            open_id = str(r).split(":", 1)[1]
            receiver_rules.append(ReceiverRule(rule_type="custom", params={"open_id": open_id}))
        else:
            receiver_rules.append(ReceiverRule(rule_type="custom", params={"open_id": str(r)}))

    message_type = condition_config.get("message_type", "feishu")

    return NotificationConfig(
        enabled=True,
        receivers=receiver_rules,
        message=MessageConfig(
            message_format="markdown",
            title_template=message_content.get("title", "通知"),
            content_template=message_content.get("content", ""),
            resources=[],
        ),
    )


async def _write_notification_log(
    db: AsyncSession,
    trace_id: str,
    pipeline_run_id: str,
    dedup_key: str | None,
    send_status: str,
    config: dict,
    error_message: str | None = None,
    send_result: Any | None = None,
    masked_content: dict | None = None,
) -> UcpNotificationLog:
    """写 UCP 通知日志。"""
    log = UcpNotificationLog(
        trace_id=trace_id,
        pipeline_run_id=pipeline_run_id,
        message_type=config.get("message_type", "feishu"),
        receivers=config.get("receivers", []),
        template_name=config.get("template", "pipeline_result"),
        message_content_masked=masked_content or {},
        send_status=send_status,
        dedup_key=dedup_key,
        error_message=error_message,
    )
    if send_result:
        log.send_result = {
            "success_count": getattr(send_result, "success_count", 0),
            "failed_count": getattr(send_result, "failed_count", 0),
            "log_id": getattr(send_result, "log_id", None),
        }
    db.add(log)
    await db.flush()
    return log
