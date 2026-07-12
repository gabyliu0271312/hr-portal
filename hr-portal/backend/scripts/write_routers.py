"""Generate remaining sub-router files."""
import os

r = r'd:\AI项目\HR提效工具搭建\hr-portal\backend\app\ucp\routers'

admin_code = """\"\"\"UCP admin routes.\"\"\"
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.system.models import SystemLog
from app.users.models import User
router=APIRouter()

class BatchToggleRequest(BaseModel):
    target_type:str=Field(...,description="system / pipeline / credential")
    target_ids:list[int]=Field(...)
    new_status:int=Field(...,description="1=enable 2=disable")

async def _audit(db,user,category,action,detail,metadata=None):
    db.add(SystemLog(category=category,action=action,status="success",user_id=user.id,request_summary=detail,metadata_json=metadata or {}))
    await db.flush()

def _serialize_system(r):
    return {"id":r.id,"system_code":r.system_code,"system_name":r.system_name,"adapter_type":r.adapter_type,"direction":r.direction,"status":r.status,"owner":r.owner}

@router.post("/config/batch-toggle",dependencies=[Depends(require_op("ucp.admin","U"))])
async def batch_toggle(payload:BatchToggleRequest,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.config_service import toggle_system_config, toggle_pipeline
    from app.ucp.credential_service import toggle_credential
    ok=0;failed=[]
    for tid in payload.target_ids:
        try:
            if payload.target_type=="system":await toggle_system_config(db,tid,payload.new_status)
            elif payload.target_type=="pipeline":await toggle_pipeline(db,tid,payload.new_status)
            elif payload.target_type=="credential":await toggle_credential(db,tid,bool(payload.new_status==1))
            ok+=1
        except Exception as e:failed.append({"id":tid,"reason":str(e)})
    await _audit(db,_user,"ucp_config","batch_toggle",f"batch {payload.target_type} x{len(payload.target_ids)}")
    await db.commit()
    return {"success_count":ok,"failed_count":len(failed),"new_status":payload.new_status,"failed_details":failed}

@router.get("/config/stats",dependencies=[Depends(require_op("ucp.admin","V"))])
async def config_stats(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.models import UcpSystemConfig, UcpPipelineConfig, UcpCredential
    sc=(await db.execute(select(func.count(UcpSystemConfig.id)))).scalar() or 0
    sa=(await db.execute(select(func.count(UcpSystemConfig.id)).where(UcpSystemConfig.status==1))).scalar() or 0
    pc=(await db.execute(select(func.count(UcpPipelineConfig.id)))).scalar() or 0
    cc=(await db.execute(select(func.count(UcpCredential.id)))).scalar() or 0
    ca=(await db.execute(select(func.count(UcpCredential.id)).where(UcpCredential.is_active==1))).scalar() or 0
    return {"systems":{"total":sc,"enabled":sa},"pipelines":{"total":pc},"credentials":{"total":cc,"active":ca}}

@router.get("/config/search",dependencies=[Depends(require_op("ucp.admin","V"))])
async def config_search(keyword:str=Query(default=""),target_type:str=Query(default="all"),limit:int=Query(default=20),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    result={"systems":[],"pipelines":[],"credentials":[]}
    if not keyword:return result
    from app.ucp.models import UcpSystemConfig, UcpPipelineConfig, UcpCredential
    kw=f"%{keyword}%"
    if target_type in ("all","system"):
        rows=(await db.execute(select(UcpSystemConfig).where(UcpSystemConfig.system_name.ilike(kw)).limit(limit))).scalars().all()
        result["systems"]=[{"id":r.id,"system_code":r.system_code,"system_name":r.system_name} for r in rows]
    if target_type in ("all","pipeline"):
        rows=(await db.execute(select(UcpPipelineConfig).where(UcpPipelineConfig.pipeline_name.ilike(kw)).limit(limit))).scalars().all()
        result["pipelines"]=[{"id":r.id,"pipeline_code":r.pipeline_code,"pipeline_name":r.pipeline_name} for r in rows]
    return result

@router.get("/config/export",dependencies=[Depends(require_op("ucp.admin","V"))])
async def config_export(target_type:str=Query(default="all"),frmt:str=Query(default="json",alias="format"),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.models import UcpSystemConfig, UcpPipelineConfig, UcpCredential
    out={"systems":[],"pipelines":[],"credentials":[]}
    if target_type in ("all","system"):
        rows=(await db.execute(select(UcpSystemConfig))).scalars().all()
        out["systems"]=[_serialize_system(r) for r in rows]
    if target_type in ("all","pipeline"):
        rows=(await db.execute(select(UcpPipelineConfig))).scalars().all()
        out["pipelines"]=[{"pipeline_code":r.pipeline_code,"pipeline_name":r.pipeline_name,"trigger_type":r.trigger_type,"status":r.status} for r in rows]
    return {"format":frmt,"content":out}

@router.post("/config/import",dependencies=[Depends(require_op("ucp.admin","C"))])
async def config_import(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    result={"systems":{"created":0,"skipped":0,"errors":[]},"pipelines":{"created":0,"skipped":0,"errors":[]}}
    content=payload.get("content") or {}
    if payload.get("target_type") in ("all","system") and "systems" in content:
        from app.ucp.config_service import upsert_system_config
        for item in (content.get("systems") or []):
            if not isinstance(item,dict) or "system_code" not in item:continue
            try:
                await upsert_system_config(db,item["system_code"],item.get("system_name",item["system_code"]),adapter_type=item.get("adapter_type","CUSTOM"))
                result["systems"]["created"]+=1
            except:result["systems"]["skipped"]+=1
    await db.commit()
    return result

@router.post("/excel/upload",dependencies=[Depends(require_op("ucp.admin","C"))])
async def excel_upload(file:UploadFile=File(...),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.excel_service import upload_excel
    return await upload_excel(db,file)

@router.post("/excel/import",dependencies=[Depends(require_op("ucp.admin","C"))])
async def excel_import(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.excel_service import import_excel
    return await import_excel(db,payload)

@router.get("/circuits",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def list_circuits(_user=Depends(current_user))->dict:
    from app.ucp.circuit_breaker import list_circuits as _list
    return {"circuits":_list()}

@router.get("/circuits/{resource_code}",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def get_circuit(resource_code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.circuit_breaker import get_circuit_state
    from app.ucp.models import UcpSystemConfig
    state=get_circuit_state(resource_code)
    conn=(await db.execute(select(UcpSystemConfig).where(UcpSystemConfig.system_code==resource_code))).scalar_one_or_none()
    return {"resource_code":resource_code,"config":(conn.circuit_breaker_config or {}) if conn else {},"state":state}

@router.post("/circuits/{resource_code}/reset",dependencies=[Depends(require_op("ucp.monitor","U"))])
async def reset_circuit(resource_code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.circuit_breaker import reset_circuit as _reset
    state=_reset(resource_code)
    await _audit(db,_user,"ucp_circuit","reset",f"reset {resource_code}")
    await db.commit()
    return {"resource_code":resource_code,"state":state}

@router.patch("/circuits/{resource_code}/config",dependencies=[Depends(require_op("ucp.monitor","U"))])
async def update_circuit_config(resource_code:str,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.models import UcpSystemConfig
    conn=(await db.execute(select(UcpSystemConfig).where(UcpSystemConfig.system_code==resource_code))).scalar_one_or_none()
    if not conn:raise HTTPException(404,f"not found")
    allowed={"enabled","failure_threshold","open_duration_seconds","half_open_max_calls","success_threshold"}
    cfg={k:v for k,v in (payload or {}).items() if k in allowed}
    conn.circuit_breaker_config=cfg
    await db.commit()
    await _audit(db,_user,"ucp_circuit","update_config",f"update {resource_code}")
    return {"resource_code":resource_code,"config":cfg}

@router.get("/rate-limits",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def list_rate_limits()->dict:
    from app.ucp.rate_limiter import list_buckets
    return {"buckets":list_buckets()}

@router.post("/rate-limits/{key:path}/reset",dependencies=[Depends(require_op("ucp.monitor","U"))])
async def reset_rate_limit(key:str,_user=Depends(current_user))->dict:
    from app.ucp.rate_limiter import reset_bucket
    reset_bucket(key)
    return {"key":key,"reset":True}

# Notification templates
@router.get("/notification-templates",dependencies=[Depends(require_op("ucp.pipelines","V"))])
async def list_nt(trigger_scene:str|None=None,limit:int=Query(default=50),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import list_templates
    items=await list_templates(db,trigger_scene=trigger_scene,limit=limit)
    return {"items":items,"total":len(items)}

@router.get("/notification-templates/{template_id}",dependencies=[Depends(require_op("ucp.pipelines","V"))])
async def get_nt(template_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import get_template
    return await get_template(db,template_id)

@router.post("/notification-templates",dependencies=[Depends(require_op("ucp.pipelines","C"))])
async def create_nt(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import create_template
    return await create_template(db,payload)

@router.patch("/notification-templates/{template_id}",dependencies=[Depends(require_op("ucp.pipelines","U"))])
async def update_nt(template_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import update_template
    return await update_template(db,template_id,payload)

@router.patch("/notification-templates/{template_id}/toggle",dependencies=[Depends(require_op("ucp.pipelines","U"))])
async def toggle_nt(template_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import toggle_template
    return await toggle_template(db,template_id)

@router.delete("/notification-templates/{template_id}",dependencies=[Depends(require_op("ucp.pipelines","D"))])
async def delete_nt(template_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import delete_template
    return await delete_template(db,template_id)

@router.post("/notification-templates/{template_id}/preview",dependencies=[Depends(require_op("ucp.pipelines","V"))])
async def preview_nt(template_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import preview_template
    return await preview_template(db,template_id,payload.get("mock_vars"))

@router.post("/notification-templates/{template_id}/apply",dependencies=[Depends(require_op("ucp.pipelines","U"))])
async def apply_nt(template_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.notification_template import apply_template
    return await apply_template(db,template_id,payload)

# Adapter registry
@router.get("/adapter-registry",dependencies=[Depends(require_op("ucp.admin","V"))])
async def list_adapters(adapter_type:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.adapter_registry import list_adapters as _list
    items=await _list(db,adapter_type=adapter_type,limit=limit,offset=offset)
    return {"total":len(items),"items":items}

@router.get("/adapter-registry/{code}",dependencies=[Depends(require_op("ucp.admin","V"))])
async def get_adapter(code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.adapter_registry import get_adapter as _get
    return await _get(db,code)

@router.get("/adapter-registry/{code}/schema",dependencies=[Depends(require_op("ucp.admin","V"))])
async def get_adapter_schema(code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.adapter_schema import get_schema
    return await get_schema(db,code)

@router.post("/adapter-registry",dependencies=[Depends(require_op("ucp.admin","C"))])
async def register_adapter(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.adapter_registry import register_adapter
    return await register_adapter(db,payload)

@router.post("/adapter-registry/{code}/activate",dependencies=[Depends(require_op("ucp.admin","U"))])
async def activate_adapter(code:str,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.adapter_registry import activate_adapter
    return await activate_adapter(db,code,payload.get("is_active",True))

@router.delete("/adapter-registry/{code}",dependencies=[Depends(require_op("ucp.admin","D"))])
async def remove_adapter(code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.adapter_registry import remove_adapter
    return await remove_adapter(db,code)

# API templates
@router.get("/api-templates",dependencies=[Depends(require_op("ucp.admin","V"))])
async def list_api_templates(category:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import list_templates as _list
    items=await _list(db,category=category,limit=limit,offset=offset)
    return {"total":len(items),"items":items}

@router.get("/api-templates/{code}",dependencies=[Depends(require_op("ucp.admin","V"))])
async def get_api_template(code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import get_template as _get
    return await _get(db,code)

@router.post("/api-templates",dependencies=[Depends(require_op("ucp.admin","C"))])
async def create_api_template(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import create_template
    return await create_template(db,payload)

@router.patch("/api-templates/{code}",dependencies=[Depends(require_op("ucp.admin","U"))])
async def update_api_template(code:str,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import update_template
    return await update_template(db,code,payload)

@router.post("/api-templates/{source_code}/copy",dependencies=[Depends(require_op("ucp.admin","C"))])
async def copy_api_template(source_code:str,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import copy_template
    return await copy_template(db,source_code,payload.get("new_code",""),payload.get("new_name",""))

@router.delete("/api-templates/{code}",dependencies=[Depends(require_op("ucp.admin","D"))])
async def delete_api_template(code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import delete_template
    return await delete_template(db,code)

@router.get("/api-templates/{code}/versions",dependencies=[Depends(require_op("ucp.admin","V"))])
async def api_template_versions(code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import list_versions
    return {"items":await list_versions(db,code)}

@router.post("/api-templates/{code}/rollback",dependencies=[Depends(require_op("ucp.admin","U"))])
async def rollback_api_template(code:str,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import rollback_template
    return await rollback_template(db,code,payload.get("version_id"))

@router.post("/api-templates/import",dependencies=[Depends(require_op("ucp.admin","C"))])
async def import_api_template(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import import_template
    return await import_template(db,payload)

@router.get("/api-templates/{code}/export",dependencies=[Depends(require_op("ucp.admin","V"))])
async def export_api_template(code:str,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.api_template_service import export_template
    return await export_template(db,code)

@router.post("/template-engine/test",dependencies=[Depends(require_op("ucp.admin","U"))])
async def test_template_engine(payload:dict,_user=Depends(current_user))->dict:
    from app.ucp.template_engine import test_engine
    return await test_engine(payload)

@router.get("/security/ssrf-rules",dependencies=[Depends(require_op("ucp.admin","V"))])
async def ssrf_rules()->dict:
    from app.ucp.ssrf_guard import BLOCKED_IPV4_NETWORKS, BLOCKED_HOST_PATTERNS
    return {"blocked_networks":[str(n) for n in BLOCKED_IPV4_NETWORKS],"blocked_host_patterns":[p.pattern for p in BLOCKED_HOST_PATTERNS]}

@router.get("/changes",dependencies=[Depends(require_op("ucp.admin","V"))])
async def list_changes(status:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.change_service import list_changes as _list
    return {"items":await _list(db,status=status,limit=limit,offset=offset)}

@router.post("/changes",dependencies=[Depends(require_op("ucp.admin","C"))])
async def create_change(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.change_service import create_change
    return await create_change(db,payload)

@router.post("/changes/{change_id}/publish",dependencies=[Depends(require_op("ucp.admin","U"))])
async def publish_change(change_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.change_service import publish_change
    return await publish_change(db,change_id)

@router.post("/changes/{change_id}/rollback",dependencies=[Depends(require_op("ucp.admin","U"))])
async def rollback_change(change_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.change_service import rollback_change
    return await rollback_change(db,change_id)
"""

with open(os.path.join(r, 'admin.py'), 'w', encoding='utf-8') as f:
    f.write(admin_code)
print(f'admin.py: {len(admin_code.splitlines())} lines')
"""

# monitor.py
monitor_code = '''"""UCP monitor routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
router=APIRouter()

@router.get("/monitor/summary",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def monitor_summary(hours:int=Query(default=24),system_id:int|None=None,resource_id:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import get_summary
    return await get_summary(db,hours=hours,system_id=system_id,resource_id=resource_id)

@router.get("/monitor/trend",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def monitor_trend(hours:int=Query(default=24),bucket:str=Query(default="hour"),system_id:int|None=None,resource_id:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import get_trend
    items=await get_trend(db,hours=hours,bucket=bucket,system_id=system_id,resource_id=resource_id)
    return {"items":items,"bucket":bucket,"window_hours":hours}

@router.get("/monitor/status-distribution",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def monitor_status_dist(hours:int=Query(default=24),system_id:int|None=None,resource_id:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import get_status_distribution
    return {"distribution":await get_status_distribution(db,hours=hours,system_id=system_id,resource_id=resource_id)}

@router.get("/monitor/recent-runs",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def monitor_recent_runs(limit:int=Query(default=20),system_id:int|None=None,resource_id:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import get_recent_runs
    return {"items":await get_recent_runs(db,limit=limit,system_id=system_id,resource_id=resource_id)}

@router.get("/monitor/alerts",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def monitor_alerts(limit:int=Query(default=50),system_id:int|None=None,resource_id:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import get_alerts
    return {"items":await get_alerts(db,limit=limit,system_id=system_id,resource_id=resource_id)}

@router.get("/monitor/pipeline-stats",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def monitor_pipeline_stats(hours:int=Query(default=24),limit:int=Query(default=10),system_id:int|None=None,resource_id:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import get_pipeline_stats
    return {"items":await get_pipeline_stats(db,hours=hours,limit=limit,system_id=system_id,resource_id=resource_id)}

@router.get("/alert-rules",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def list_alert_rules(rule_type:str|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import list_alert_rules
    items=await list_alert_rules(db,rule_type=rule_type)
    return {"items":items,"total":len(items)}
@router.post("/alert-rules",dependencies=[Depends(require_op("ucp.monitor","C"))])
async def create_alert_rule(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import create_alert_rule
    return await create_alert_rule(db,payload)
@router.patch("/alert-rules/{rule_id}",dependencies=[Depends(require_op("ucp.monitor","U"))])
async def update_alert_rule(rule_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import update_alert_rule
    return await update_alert_rule(db,rule_id,payload)
@router.delete("/alert-rules/{rule_id}",dependencies=[Depends(require_op("ucp.monitor","D"))])
async def delete_alert_rule(rule_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import delete_alert_rule
    return await delete_alert_rule(db,rule_id)
@router.get("/alert-logs",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def alert_logs(limit:int=Query(default=50),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.monitor_service import list_alert_logs
    items=await list_alert_logs(db,limit=limit)
    return {"items":items,"total":len(items)}

@router.get("/sla/configs",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def list_sla_configs(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.sla_service import list_configs
    return {"items":await list_configs(db)}
@router.post("/sla/configs",dependencies=[Depends(require_op("ucp.monitor","C"))])
async def create_sla_config(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.sla_service import create_config
    return await create_config(db,payload)
@router.patch("/sla/configs/{sla_id}",dependencies=[Depends(require_op("ucp.monitor","U"))])
async def update_sla_config(sla_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.sla_service import update_config
    return await update_config(db,sla_id,payload)
@router.delete("/sla/configs/{sla_id}",dependencies=[Depends(require_op("ucp.monitor","D"))])
async def delete_sla_config(sla_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.sla_service import delete_config
    return await delete_config(db,sla_id)
@router.post("/sla/configs/{sla_id}/calculate",dependencies=[Depends(require_op("ucp.monitor","U"))])
async def calculate_sla(sla_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.sla_service import calculate
    return await calculate(db,sla_id)
@router.get("/sla/configs/{sla_id}/records",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def sla_records(sla_id:int,limit:int=Query(default=50),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.sla_service import list_records
    return {"items":await list_records(db,sla_id,limit)}
@router.get("/sla/dashboard",dependencies=[Depends(require_op("ucp.monitor","V"))])
async def sla_dashboard(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.sla_service import get_dashboard
    return await get_dashboard(db)
'''

with open(os.path.join(r, 'monitor.py'), 'w', encoding='utf-8') as f:
    f.write(monitor_code)
print(f'monitor.py: {len(monitor_code.splitlines())} lines')

# assets.py
assets_code = '''"""UCP assets routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
router=APIRouter()

@router.get("/assets/catalog",dependencies=[Depends(require_op("ucp.assets","V"))])
async def asset_catalog(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.asset_catalog_service import get_asset_catalog
    return await get_asset_catalog(db)

@router.get("/assets",dependencies=[Depends(require_op("ucp.assets","V"))])
async def list_assets(asset_type:str=Query(...),domain:str|None=None,keyword:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.asset_catalog_service import list_assets as _list
    items=await _list(db,asset_type=asset_type,domain=domain,keyword=keyword,limit=limit,offset=offset)
    return {"total":len(items),"items":items}

@router.post("/assets/tags",dependencies=[Depends(require_op("ucp.assets","U"))])
async def set_asset_tag(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.asset_catalog_service import set_asset_tag
    return await set_asset_tag(db,payload)

@router.delete("/assets/tags",dependencies=[Depends(require_op("ucp.assets","U"))])
async def remove_asset_tag(asset_type:str=Query(...),asset_id:int=Query(...),tag_key:str=Query(...),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.asset_catalog_service import remove_asset_tag
    return await remove_asset_tag(db,asset_type,asset_id,tag_key)

@router.get("/topology",dependencies=[Depends(require_op("ucp.assets","V"))])
async def topology(system_id:int|None=None,resource_id:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.topology_service import get_topology
    return await get_topology(db,system_id=system_id,resource_id=resource_id)

@router.get("/topology/impact",dependencies=[Depends(require_op("ucp.assets","V"))])
async def topology_impact(target_type:str=Query(...),target_id:int=Query(...),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.topology_service import get_impact
    return await get_impact(db,target_type,target_id)
'''

with open(os.path.join(r, 'assets.py'), 'w', encoding='utf-8') as f:
    f.write(assets_code)
print(f'assets.py: {len(assets_code.splitlines())} lines')

# governance.py
governance_code = '''"""UCP governance routes."""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.deps import current_user, require_op
from app.core.db import get_session
from app.users.models import User
router=APIRouter()

# Diff jobs
@router.get("/diff/jobs",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_diff_jobs(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.diff_engine import list_diff_jobs as _list
    return {"items":await _list(db)}
@router.post("/diff/jobs",dependencies=[Depends(require_op("ucp.governance","C"))])
async def create_diff_job(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.diff_engine import create_diff_job as _create
    try:
        job=await _create(db,job_code=payload["job_code"],job_name=payload["job_name"],
            source_system=payload["source_system"],target_system=payload["target_system"],
            object_type=payload["object_type"],compare_fields=payload.get("compare_fields"),
            key_field=payload.get("key_field","id"),source_resource_id=payload.get("source_resource_id"),
            target_resource_id=payload.get("target_resource_id"),cron_expression=payload.get("cron_expression"),
            created_by=_user.username if hasattr(_user,"username") else str(_user.id))
    except ValueError as e:raise HTTPException(400,str(e))
    return job
@router.patch("/diff/jobs/{job_id}",dependencies=[Depends(require_op("ucp.governance","U"))])
async def update_diff_job(job_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.diff_engine import update_diff_job as _update
    return await _update(db,job_id,**payload)
@router.delete("/diff/jobs/{job_id}",dependencies=[Depends(require_op("ucp.governance","D"))])
async def delete_diff_job(job_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.diff_engine import delete_diff_job
    return await delete_diff_job(db,job_id)
@router.post("/diff/jobs/{job_id}/run",dependencies=[Depends(require_op("ucp.governance","C"))])
async def run_diff_job(job_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.diff_engine import run_diff_job as _run
    try:return await _run(db,job_id)
    except ValueError as e:raise HTTPException(400,str(e))
@router.get("/diff/records",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_diff_records(job_id:int|None=None,run_code:str|None=None,diff_type:str|None=None,
    limit:int=Query(default=100),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.diff_engine import list_diff_records as _list
    items=await _list(db,job_id=job_id,run_code=run_code,diff_type=diff_type,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.get("/diff/trend",dependencies=[Depends(require_op("ucp.governance","V"))])
async def diff_trend(days:int=Query(default=30),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.diff_engine import get_diff_trend
    return {"items":await get_diff_trend(db,days)}

# Quality rules
@router.get("/quality/rules",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_quality_rules(rule_type:str|None=None,object_type:str|None=None,limit:int=Query(default=100),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.quality_rule_service import list_quality_rules as _list
    items=await _list(db,rule_type=rule_type,object_type=object_type,limit=limit)
    return {"total":len(items),"items":items}
@router.post("/quality/rules",dependencies=[Depends(require_op("ucp.governance","C"))])
async def create_quality_rule(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.quality_rule_service import create_quality_rule as _create
    try:
        return await _create(db,rule_code=payload["rule_code"],rule_name=payload["rule_name"],
            object_type=payload["object_type"],rule_type=payload["rule_type"],
            system_code=payload.get("system_code"),field_name=payload.get("field_name"),
            resource_id=payload.get("resource_id"),rule_config=payload.get("rule_config"),
            severity=payload.get("severity","WARN"),cron_expression=payload.get("cron_expression"),
            description=payload.get("description"),created_by=_user.username if hasattr(_user,"username") else str(_user.id))
    except ValueError as e:raise HTTPException(400,str(e))
@router.patch("/quality/rules/{rule_id}",dependencies=[Depends(require_op("ucp.governance","U"))])
async def update_quality_rule(rule_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.quality_rule_service import update_quality_rule
    return await update_quality_rule(db,rule_id,**payload)
@router.delete("/quality/rules/{rule_id}",dependencies=[Depends(require_op("ucp.governance","D"))])
async def delete_quality_rule(rule_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.quality_rule_service import delete_quality_rule
    return await delete_quality_rule(db,rule_id)
@router.post("/quality/rules/{rule_id}/scan",dependencies=[Depends(require_op("ucp.governance","C"))])
async def scan_quality(rule_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.quality_rule_service import scan_quality as _scan
    try:return await _scan(db,rule_id)
    except ValueError as e:raise HTTPException(400,str(e))
@router.get("/quality/issues",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_quality_issues(rule_id:int|None=None,scan_run_code:str|None=None,limit:int=Query(default=100),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.quality_rule_service import list_quality_issues as _list
    items=await _list(db,rule_id=rule_id,scan_run_code=scan_run_code,limit=limit)
    return {"total":len(items),"items":items}

# Master data
@router.get("/master-data/objects",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_md_objects(object_type:str|None=None,system_code:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import list_master_data_objects as _list
    items=await _list(db,object_type=object_type,system_code=system_code,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.post("/master-data/objects",dependencies=[Depends(require_op("ucp.governance","C"))])
async def create_md_object(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import create_master_data_object
    return await create_master_data_object(db,payload)
@router.patch("/master-data/objects/{code}",dependencies=[Depends(require_op("ucp.governance","U"))])
async def update_md_object(code:str,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import update_master_data_object
    return await update_master_data_object(db,code,payload)

@router.get("/master-data/mappings",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_id_mappings(object_type:str|None=None,external_system:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import list_id_mappings as _list
    items=await _list(db,object_type=object_type,external_system=external_system,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.post("/master-data/mappings",dependencies=[Depends(require_op("ucp.governance","C"))])
async def create_id_mapping(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import create_id_mapping
    return await create_id_mapping(db,payload)
@router.patch("/master-data/mappings/{mapping_id}",dependencies=[Depends(require_op("ucp.governance","U"))])
async def update_id_mapping(mapping_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import update_id_mapping
    return await update_id_mapping(db,mapping_id,payload)
@router.delete("/master-data/mappings/{mapping_id}",dependencies=[Depends(require_op("ucp.governance","D"))])
async def delete_id_mapping(mapping_id:int,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import delete_id_mapping
    return await delete_id_mapping(db,mapping_id)
@router.post("/master-data/mappings/check-conflicts",dependencies=[Depends(require_op("ucp.governance","U"))])
async def check_mapping_conflicts(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.master_data_service import check_mapping_conflicts
    return await check_mapping_conflicts(db)

# Conflicts + Governance
@router.get("/conflicts",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_conflicts(source_type:str|None=None,status:str|None=None,limit:int=Query(default=100),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.conflict_governance_service import list_conflicts as _list
    items=await _list(db,source_type=source_type,status=status,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.post("/conflicts/{conflict_id}/resolve",dependencies=[Depends(require_op("ucp.governance","U"))])
async def resolve_conflict(conflict_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.conflict_governance_service import resolve_conflict
    return await resolve_conflict(db,conflict_id,payload)
@router.post("/conflicts/sync",dependencies=[Depends(require_op("ucp.governance","C"))])
async def sync_conflicts(db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.conflict_governance_service import sync_conflicts_from_sources
    return await sync_conflicts_from_sources(db)

@router.post("/governance/scores/calculate",dependencies=[Depends(require_op("ucp.governance","U"))])
async def calc_governance_scores(asset_type:str|None=None,window_hours:int|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.governance_score_service import calculate_scores
    return await calculate_scores(db,asset_type=asset_type,window_hours=window_hours)
@router.get("/governance/scores",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_governance_scores(asset_type:str|None=None,limit:int=Query(default=50),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.governance_score_service import list_scores
    return {"items":await list_scores(db,asset_type=asset_type,limit=limit)}

@router.get("/governance/tasks",dependencies=[Depends(require_op("ucp.governance","V"))])
async def list_gov_tasks(status:str|None=None,assigned_to:str|None=None,limit:int=Query(default=50),offset:int=Query(default=0),db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.conflict_governance_service import list_governance_tasks as _list
    items=await _list(db,status=status,assigned_to=assigned_to,limit=limit,offset=offset)
    return {"total":len(items),"items":items}
@router.post("/governance/tasks",dependencies=[Depends(require_op("ucp.governance","C"))])
async def create_gov_task(payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.conflict_governance_service import create_governance_task
    return await create_governance_task(db,payload)
@router.patch("/governance/tasks/{task_id}",dependencies=[Depends(require_op("ucp.governance","U"))])
async def update_gov_task(task_id:int,payload:dict,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.conflict_governance_service import update_governance_task_status
    return await update_governance_task_status(db,task_id,payload)
@router.post("/governance/reports/generate",dependencies=[Depends(require_op("ucp.governance","C"))])
async def generate_gov_report(payload:dict|None=None,db:AsyncSession=Depends(get_session),_user=Depends(current_user))->dict:
    from app.ucp.conflict_governance_service import generate_governance_report
    period=(payload or {}).get("report_period","monthly")
    return await generate_governance_report(db,period)
'''

with open(os.path.join(r, 'governance.py'), 'w', encoding='utf-8') as f:
    f.write(governance_code)
print(f'governance.py: {len(governance_code.splitlines())} lines')

print('All sub-routers written.')
"""

# Write the script content
with open(r'd:\AI项目\HR提效工具搭建\hr-portal\backend\scripts\write_routers.py', 'w', encoding='utf-8') as f:
    f.write(script_content)
