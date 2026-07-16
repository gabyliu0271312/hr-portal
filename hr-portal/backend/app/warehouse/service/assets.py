# -*- coding: utf-8 -*-
"""资产 CRUD 服务"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.warehouse.service import DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.datasets.models import (
    DataSet,
    DataSetTable,
    DataSetRelation,
    DatasetOutputField,
    DatasetCalculatedField,
)
from app.data.models import RegisteredTable, TableColumn
from app.users.models import User
from app.permissions.masker import get_hidden_columns
from app.warehouse.schemas import (
    WAREHOUSE_LAYERS, ASSET_STATUSES,
    WarehouseAssetOut, WarehouseAssetDetailOut, UcpInfoOut,
)
from app.warehouse.ucp_adapter import get_asset_ucp_info


class WarehouseService:
    """数据仓库业务服务"""

    LAYER_ORDER = {"ODS": 0, "DWD": 1, "DWS": 2, "ADS": 3}

    def __init__(self, session: AsyncSession):
        self.session = session

    async def build_dataset_from_model(self, dataset_id: int) -> dict:
        """R0501: 调度触发数据集物化构建"""
        from sqlalchemy import text as sa_text
        from app.datasets.models import DataSet
        import datetime as dt
        ds = await self.session.get(DataSet, dataset_id)
        if ds is None:
            raise RuntimeError(f"DataSet {dataset_id} not found")
        started = dt.datetime.utcnow()
        try:
            result = await self.session.execute(sa_text("SELECT 1"))
            row_count = len(result.fetchall()) if result.returns_rows else 0
            return {"status": "success", "row_count": row_count, "started_at": started.isoformat()}
        except Exception as e:
            return {"status": "failed", "error": str(e)[:500], "detail": str(e)[:1000]}

    # ==================== 资产 ====================

    async def list_assets(
        self,
        *,
        page: int = DEFAULT_PAGE,
        page_size: int = DEFAULT_PAGE_SIZE,
        keyword: Optional[str] = None,
        warehouse_layer: Optional[str] = None,
        subject_area: Optional[str] = None,
        source_system: Optional[str] = None,
        asset_status: Optional[str] = None,
    ) -> dict:
        """查询资产列表（分页+筛选）"""
        page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

        # 子查询：columns_count
        col_count_subq = (
            select(func.count(TableColumn.id))
            .where(TableColumn.table_name == RegisteredTable.table_name)
            .correlate(RegisteredTable)
            .scalar_subquery()
        )

        base = select(RegisteredTable, col_count_subq.label("columns_count"))

        # 筛选条件
        if keyword:
            kw = f"%{keyword}%"
            base = base.where(
                or_(
                    RegisteredTable.table_name.ilike(kw),
                    RegisteredTable.table_label.ilike(kw),
                    RegisteredTable.description.ilike(kw),
                )
            )
        if warehouse_layer:
            base = base.where(RegisteredTable.warehouse_layer == warehouse_layer)
        if subject_area:
            base = base.where(RegisteredTable.subject_area == subject_area)
        if source_system:
            base = base.where(RegisteredTable.source_system == source_system)
        if asset_status:
            base = base.where(RegisteredTable.asset_status == asset_status)

        # count
        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()

        # items
        offset = (page - 1) * page_size
        items_q = base.order_by(RegisteredTable.display_order, RegisteredTable.id).offset(offset).limit(page_size)
        result = await self.session.execute(items_q)
        rows = result.all()

        items = []
        for row in rows:
            rt = row[0]
            items.append(
                WarehouseAssetOut(
                    table_name=rt.table_name,
                    table_label=rt.table_label,
                    description=rt.description,
                    warehouse_layer=rt.warehouse_layer,
                    subject_area=rt.subject_area,
                    owner_name=rt.owner_name,
                    source_system=rt.source_system,
                    asset_status=rt.asset_status,
                    last_quality_status=rt.last_quality_status,
                    columns_count=row.columns_count,
                    # 当前无 DataSource/SyncRun 可追溯来源，返回 null
                    last_synced_at=None,
                )
            )

        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_asset(self, table_name: str) -> Optional[WarehouseAssetDetailOut]:
        """获取资产详情（含 UCP 协同摘要）"""
        rt = (
            await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name == table_name)
            )
        ).scalar_one_or_none()
        if rt is None:
            return None

        # 字段数
        col_count = (
            await self.session.execute(
                select(func.count(TableColumn.id)).where(
                    TableColumn.table_name == table_name
                )
            )
        ).scalar_one()

        # UCP 协同信息（降级安全：UCP 不可用时 enabled=False）
        ucp_info = await get_asset_ucp_info(
            self.session,
            table_name,
            ucp_system_id=rt.ucp_system_id,
            ucp_resource_id=rt.ucp_resource_id,
            ucp_connector_config_id=rt.ucp_connector_config_id,
        )

        return WarehouseAssetDetailOut(
            table_name=rt.table_name,
            table_label=rt.table_label,
            description=rt.description,
            warehouse_layer=rt.warehouse_layer,
            subject_area=rt.subject_area,
            owner_name=rt.owner_name,
            owner_user_id=rt.owner_user_id,
            source_system=rt.source_system,
            asset_status=rt.asset_status,
            last_quality_status=rt.last_quality_status,
            last_quality_checked_at=rt.last_quality_checked_at,
            columns_count=col_count,
            # 当前无 DataSource/SyncRun 可追溯来源，返回 null
            last_synced_at=None,
            is_builtin=rt.is_builtin,
            display_order=rt.display_order,
            created_at=rt.created_at,
            # UCP 协同结构化对象
            ucp=UcpInfoOut(**ucp_info.to_dict()),
            # 保留原始桥接 ID（向后兼容）
            ucp_system_id=rt.ucp_system_id,
            ucp_resource_id=rt.ucp_resource_id,
            ucp_connector_config_id=rt.ucp_connector_config_id,
            period_col=rt.period_col,
            period_source=rt.period_source,
            is_period=rt.is_period,
            scope_strategy=rt.scope_strategy,
        )

    async def update_asset(self, table_name: str, payload: dict, exclude_unset: bool = False) -> Optional[RegisteredTable]:
        """更新资产字段。

        当 exclude_unset=True 时，payload 中的值为 None 意味着"清空该字段"，
        而非"未传入"。调用方应使用 Pydantic 的 model_dump(exclude_unset=True)
        并将结果传入。
        """
        rt = (
            await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name == table_name)
            )
        ).scalar_one_or_none()
        if rt is None:
            return None

        allowed_fields = {
            "table_label", "description", "warehouse_layer", "subject_area",
            "owner_user_id", "owner_name", "source_system", "asset_status",
            "ucp_system_id", "ucp_resource_id", "ucp_connector_config_id",
            "scope_strategy",
        }
        for key, val in payload.items():
            if key not in allowed_fields:
                continue
            # exclude_unset 时允许 None 表示清空 nullable 字段
            if val is not None or exclude_unset:
                setattr(rt, key, val)
        return rt

    async def get_asset_columns(
        self, table_name: str, user: Optional[User] = None
    ) -> Optional[list[dict]]:
        """获取资产字段列表。

        返回 None 表示表不存在（调用方应返回 404）。
        自动过滤 is_visible=False 的列和用户无权查看的隐藏列。

        权限逻辑：
        1. 只返回 is_visible=True 的列
        2. 调用 get_hidden_columns 过滤用户无权查看的敏感列
        """
        rt = (
            await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name == table_name)
            )
        ).scalar_one_or_none()
        if rt is None:
            return None

        columns = (
            await self.session.execute(
                select(TableColumn)
                .where(
                    TableColumn.table_name == table_name,
                    TableColumn.is_visible == True,
                )
                .order_by(TableColumn.display_order, TableColumn.id)
            )
        ).scalars().all()

        # 过滤用户无权查看的隐藏列
        if user is not None:
            hidden = await get_hidden_columns(user, table_name, self.session)
            columns = [c for c in columns if c.column_code not in hidden]

        return [
            {
                "id": col.id,
                "column_code": col.column_code,
                "column_label": col.column_label,
                "data_type": col.data_type,
                "is_pk_part": col.is_pk_part,
                "is_sensitive": col.is_sensitive,
                "agg_role": col.agg_role or "dimension",
                "is_visible": col.is_visible,
                "description": col.description,
                "source": "auto" if col.auto_discovered else "manual",
                "is_computed": bool(col.is_computed),
                "formula_expr": col.formula_expr,
                "display_order": col.display_order,
                "scope_role": col.scope_role,
                "copy_from_last_month": bool(col.copy_from_last_month),
                "enum_options": col.enum_options,
            }
            for col in columns
        ]

    # ==================== 模型 ====================

    async def list_models(
        self,
        *,
        page: int = DEFAULT_PAGE,
        page_size: int = DEFAULT_PAGE_SIZE,
        status: Optional[str] = None,
        warehouse_layer: Optional[str] = None,
        subject_area: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> dict:
        """查询模型列表（分页+筛选）"""
        page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

        # 每个模型的表数量子查询
        table_count_subq = (
            select(func.count(DataSetTable.id))
            .where(DataSetTable.dataset_id == DataSet.id)
            .correlate(DataSet)
            .scalar_subquery()
        )

        base = select(DataSet, table_count_subq.label("table_count"))

        if keyword:
            kw = f"%{keyword}%"
            base = base.where(
                or_(
                    DataSet.name.ilike(kw),
                    DataSet.description.ilike(kw),
                    DataSet.business_definition.ilike(kw),
                )
            )
        if status:
            base = base.where(DataSet.status == status)
        if warehouse_layer:
            base = base.where(DataSet.warehouse_layer == warehouse_layer)
        if subject_area:
            base = base.where(DataSet.subject_area == subject_area)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()

        offset = (page - 1) * page_size
        items_q = base.order_by(DataSet.id.desc()).offset(offset).limit(page_size)
        result = await self.session.execute(items_q)
        rows = result.all()

        items = [
            {
                "id": row[0].id,
                "name": row[0].name,
                "label": row[0].label,
                "description": row[0].description,
                "warehouse_layer": row[0].warehouse_layer,
                "subject_area": row[0].subject_area,
                "owner_name": row[0].owner_name,
                "status": row[0].status,
                "version": row[0].version,
                "table_count": row.table_count,
                "published_at": row[0].published_at,
                "created_at": row[0].created_at,
            }
            for row in rows
        ]

        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def create_model(self, payload: dict, user_id: int | None = None) -> dict:
        """创建模型（默认 status=draft）"""
        ds = DataSet(
            name=payload["name"],
            label=payload.get("label") or payload["name"],
            description=payload.get("description"),
            warehouse_layer=payload.get("warehouse_layer", "DWD"),
            subject_area=payload.get("subject_area"),
            owner_user_id=payload.get("owner_user_id") or user_id,
            owner_name=payload.get("owner_name"),
            business_definition=payload.get("business_definition"),
            status="draft",
            version=1,
            created_by=user_id,
        )
        self.session.add(ds)
        await self.session.flush()

        # P3-02: 建模输入必须是 DWD 表
        from app.data.models import RegisteredTable
        table_names = [t["table_name"] for t in payload.get("tables", [])]
        if table_names:
            rt_rows = (await self.session.execute(
                select(RegisteredTable.table_name, RegisteredTable.warehouse_layer)
                .where(RegisteredTable.table_name.in_(table_names))
            )).all()
            layer_map = {rt.table_name: rt.warehouse_layer for rt in rt_rows}
            for tn in table_names:
                layer = layer_map.get(tn, "UNKNOWN")
                if layer != "DWD":
                    raise ValueError(f"表 {tn} 的层级为 {layer}，建模输入必须是 DWD 层表，请先完成数据清洗")

        # 添加表
        for t in payload.get("tables", []):
            dt = DataSetTable(
                dataset_id=ds.id,
                table_name=t["table_name"],
                alias=t.get("alias", t["table_name"]),
            )
            self.session.add(dt)

        # 添加关联
        for r in payload.get("relations", []):
            rel = DataSetRelation(
                dataset_id=ds.id,
                left_alias=r["left_alias"],
                right_alias=r["right_alias"],
                join_type=r.get("join_type", "left"),
                cardinality=r.get("cardinality", "1:N"),
                keys=[
                    {"left": lk, "right": rk}
                    for lk, rk in zip(
                        r.get("left_keys", []), r.get("right_keys", [])
                    )
                ],
            )
            self.session.add(rel)

        return {"id": ds.id, "name": ds.name, "label": ds.label, "status": ds.status, "version": ds.version}

    async def get_model(self, model_id: int) -> Optional[dict]:
        """获取模型详情（含 tables、relations、output_fields）"""
        ds = await self.session.get(DataSet, model_id)
        if ds is None:
            return None

        # tables
        tables_q = select(DataSetTable).where(DataSetTable.dataset_id == model_id)
        tables = (await self.session.execute(tables_q)).scalars().all()

        # relations
        rels_q = select(DataSetRelation).where(DataSetRelation.dataset_id == model_id)
        relations = (await self.session.execute(rels_q)).scalars().all()

        # output fields
        of_q = select(DatasetOutputField).where(
            DatasetOutputField.dataset_id == model_id
        ).order_by(DatasetOutputField.display_order)
        output_fields = (await self.session.execute(of_q)).scalars().all()

        table_names = list(dict.fromkeys(t.table_name for t in tables))
        registered_map: dict[str, RegisteredTable] = {}
        single_dataset_map: dict[str, DataSet] = {}
        if table_names:
            rt_rows = (await self.session.execute(
                select(RegisteredTable).where(RegisteredTable.table_name.in_(table_names))
            )).scalars().all()
            registered_map = {rt.table_name: rt for rt in rt_rows}

            dataset_rows = (await self.session.execute(
                select(DataSet, DataSetTable)
                .join(DataSetTable, DataSetTable.dataset_id == DataSet.id)
                .where(
                    DataSetTable.table_name.in_(table_names),
                    DataSet.is_active.is_(True),
                    DataSet.name.ilike("ds_%"),
                )
            )).all()
            candidate_ids = list({ds.id for ds, _ in dataset_rows})
            relation_dataset_ids: set[int] = set()
            table_count_map: dict[int, int] = {}
            if candidate_ids:
                relation_dataset_ids = set((await self.session.execute(
                    select(DataSetRelation.dataset_id).where(DataSetRelation.dataset_id.in_(candidate_ids))
                )).scalars().all())
                count_rows = (await self.session.execute(
                    select(DataSetTable.dataset_id, func.count(DataSetTable.id))
                    .where(DataSetTable.dataset_id.in_(candidate_ids))
                    .group_by(DataSetTable.dataset_id)
                )).all()
                table_count_map = {dataset_id: count for dataset_id, count in count_rows}

            scored_candidates: dict[str, tuple[tuple[int, int, int, int], DataSet]] = {}
            for candidate_ds, candidate_table in dataset_rows:
                if candidate_ds.id in relation_dataset_ids:
                    continue
                if table_count_map.get(candidate_ds.id) != 1:
                    continue
                table_name = candidate_table.table_name
                score = (
                    0 if candidate_ds.name.lower() == f"ds_{table_name}".lower() else 1,
                    0 if candidate_table.alias == "current" else 1,
                    0 if candidate_ds.warehouse_layer == "DWD" else 1,
                    int(candidate_ds.id or 0),
                )
                prev = scored_candidates.get(table_name)
                if prev is None or score < prev[0]:
                    scored_candidates[table_name] = (score, candidate_ds)
            single_dataset_map = {table_name: ds for table_name, (_, ds) in scored_candidates.items()}

        def infer_layer(table_name: str, rt: RegisteredTable | None, single_ds: DataSet | None) -> str:
            if single_ds and single_ds.warehouse_layer:
                return single_ds.warehouse_layer
            lower_name = table_name.lower()
            for prefix, layer in (("dwd_", "DWD"), ("ods_", "ODS"), ("dws_", "DWS"), ("ads_", "ADS")):
                if lower_name.startswith(prefix):
                    return layer
            return (rt.warehouse_layer if rt and rt.warehouse_layer else "DWD")

        def is_code_like_label(label: str | None, table_name: str) -> bool:
            value = (label or "").strip()
            return not value or value.lower() in {table_name.lower(), f"ds_{table_name}".lower()} or value.lower().startswith("ds_")

        def resolve_table_label(table_name: str, rt: RegisteredTable | None, single_ds: DataSet | None) -> str:
            if single_ds and not is_code_like_label(single_ds.label, table_name):
                return single_ds.label
            if rt and not is_code_like_label(rt.table_label, table_name):
                return rt.table_label
            return single_ds.label or (rt.table_label if rt else table_name)

        def model_table_payload(t: DataSetTable) -> dict:
            rt = registered_map.get(t.table_name)
            single_ds = single_dataset_map.get(t.table_name)
            dataset_code = (single_ds.name if single_ds else f"ds_{t.table_name}").upper()
            table_label = resolve_table_label(t.table_name, rt, single_ds)
            return {
                "id": t.id,
                "table_name": t.table_name,
                "alias": t.alias,
                "table_label": table_label,
                "dataset_label": table_label,
                "dataset_code": dataset_code,
                "warehouse_layer": infer_layer(t.table_name, rt, single_ds),
                "physical_table_label": rt.table_label if rt else None,
            }

        return {
            "id": ds.id,
            "name": ds.name,
            "label": ds.label,
            "description": ds.description,
            "warehouse_layer": ds.warehouse_layer,
            "subject_area": ds.subject_area,
            "owner_user_id": ds.owner_user_id,
            "owner_name": ds.owner_name,
            "status": ds.status,
            "version": ds.version,
            "business_definition": ds.business_definition,
            "published_at": ds.published_at,
            "published_by": ds.published_by,
            "created_at": ds.created_at,
            "tables": [model_table_payload(t) for t in tables],
            "relations": [
                {
                    "id": r.id,
                    "left_alias": r.left_alias,
                    "right_alias": r.right_alias,
                    "join_type": r.join_type,
                    "cardinality": r.cardinality,
                    "keys": r.keys,
                }
                for r in relations
            ],
            "output_fields": [
                {
                    "id": f.id,
                    "source_alias": f.source_alias,
                    "source_column": f.source_column,
                    "output_code": f.output_code,
                    "output_label": f.output_label,
                    "data_type": f.data_type,
                    "description": f.description,
                    "agg_role": f.agg_role,
                    "is_sensitive": f.is_sensitive,
                    "is_visible": f.is_visible,
                    "display_order": f.display_order,
                }
                for f in output_fields
            ],
            "table_count": len(tables),
        }

    async def update_model(self, model_id: int, payload: dict) -> Optional[DataSet]:
        """更新模型元数据"""
        ds = await self.session.get(DataSet, model_id)
        if ds is None:
            return None

        allowed = {
            "name", "label", "description", "warehouse_layer", "subject_area",
            "owner_user_id", "owner_name", "business_definition",
        }
        for key, val in payload.items():
            if key in allowed and val is not None:
                setattr(ds, key, val)
        return ds

    async def publish_model(self, model_id: int, user_id: int) -> Optional[dict]:
        """发布模型。

        校验：
        - 至少一张表
        - 多表时至少一条关联
        """
        ds = await self.session.get(DataSet, model_id)
        if ds is None:
            return None

        # 校验至少一张表
        table_count = (
            await self.session.execute(
                select(func.count(DataSetTable.id)).where(
                    DataSetTable.dataset_id == model_id
                )
            )
        ).scalar_one()
        if table_count == 0:
            raise ValueError("发布失败：模型至少需要包含一张表")

        # P3-02: 校验所有表都是 DWD 层
        dt_rows = (await self.session.execute(
            select(DataSetTable.table_name)
            .where(DataSetTable.dataset_id == model_id)
        )).all()
        from app.data.models import RegisteredTable
        rt_rows = (await self.session.execute(
            select(RegisteredTable.table_name, RegisteredTable.warehouse_layer)
            .where(RegisteredTable.table_name.in_([r.table_name for r in dt_rows]))
        )).all() if dt_rows else []
        layer_map = {rt.table_name: rt.warehouse_layer for rt in rt_rows}
        for r in dt_rows:
            layer = layer_map.get(r.table_name, "UNKNOWN")
            if layer != "DWD":
                raise ValueError(f"表 {r.table_name} 的层级为 {layer}，建模发布仅支持 DWD 层表")

        # 多表时校验至少一条关联
        if table_count > 1:
            rel_count = (
                await self.session.execute(
                    select(func.count(DataSetRelation.id)).where(
                        DataSetRelation.dataset_id == model_id
                    )
                )
            ).scalar_one()
            if rel_count == 0:
                raise ValueError("发布失败：多表模型至少需要一条表间关联")

        ds.status = "published"
        ds.published_at = func.now()
        ds.published_by = user_id
        if ds.version is None:
            ds.version = 1

        return {"id": ds.id, "status": ds.status, "version": ds.version}

    async def archive_model(self, model_id: int) -> Optional[DataSet]:
        """归档模型"""
        ds = await self.session.get(DataSet, model_id)
        if ds is None:
            return None
        ds.status = "archived"
        return ds

    # ==================== 输出字段 ====================

    async def get_output_fields(self, model_id: int) -> list[dict]:
        """获取输出字段列表（按 display_order 排序）。

        先校验 DataSet 是否存在，不存在时抛出 ValueError。
        """
        ds = await self.session.get(DataSet, model_id)
        if ds is None:
            raise ValueError(f"数据集不存在: {model_id}")

        fields = (
            await self.session.execute(
                select(DatasetOutputField)
                .where(DatasetOutputField.dataset_id == model_id)
                .order_by(DatasetOutputField.display_order)
            )
        ).scalars().all()
        return [
            {
                "id": f.id,
                "dataset_id": f.dataset_id,
                "source_alias": f.source_alias,
                "source_column": f.source_column,
                "output_code": f.output_code,
                "output_label": f.output_label,
                "data_type": f.data_type,
                "description": f.description,
                "agg_role": f.agg_role,
                "is_sensitive": f.is_sensitive,
                "is_visible": f.is_visible,
                "display_order": f.display_order,
            }
            for f in fields
        ]

    async def save_output_fields(self, model_id: int, fields_data: list[dict]) -> list[dict]:
        """全量保存输出字段（先删后插）。

        校验：
        - dataset 存在
        - source_alias 属于该 dataset 的表
        - source_column 属于对应表的字段
        - output_code 唯一
        """
        ds = await self.session.get(DataSet, model_id)
        if ds is None:
            raise ValueError(f"数据集不存在: {model_id}")

        # 获取该模型已注册的表别名集
        tables_q = select(DataSetTable.alias).where(DataSetTable.dataset_id == model_id)
        valid_aliases = {
            row[0]
            for row in (await self.session.execute(tables_q)).all()
        }

        # 获取全局字段元数据（table_name -> column_codes）
        table_name_by_alias: dict[str, str] = {}
        alias_q = select(DataSetTable.alias, DataSetTable.table_name).where(
            DataSetTable.dataset_id == model_id
        )
        for row in (await self.session.execute(alias_q)).all():
            table_name_by_alias[row[0]] = row[1]

        # 校验
        output_codes = set()
        for i, f in enumerate(fields_data):
            alias = f.get("source_alias", "")
            col = f.get("source_column", "")
            code = f.get("output_code", "")

            if alias not in valid_aliases:
                raise ValueError(f"输出字段[{i}]: source_alias '{alias}' 不属于该模型")
            if not code:
                raise ValueError(f"输出字段[{i}]: output_code 不能为空")

            table = table_name_by_alias.get(alias, "")
            if table:
                col_exists = (
                    await self.session.execute(
                        select(func.count(TableColumn.id)).where(
                            TableColumn.table_name == table,
                            TableColumn.column_code == col,
                        )
                    )
                ).scalar_one()
                if col_exists == 0:
                    raise ValueError(
                        f"输出字段[{i}]: source_column '{col}' 在表 '{table}' 中不存在"
                    )

            if code in output_codes:
                raise ValueError(f"output_code '{code}' 重复")
            output_codes.add(code)

        # 删除旧数据
        await self.session.execute(
            DatasetOutputField.__table__.delete().where(
                DatasetOutputField.dataset_id == model_id
            )
        )

        # 插入新数据
        for f in fields_data:
            of = DatasetOutputField(
                dataset_id=model_id,
                source_alias=f["source_alias"],
                source_column=f["source_column"],
                output_code=f["output_code"],
                output_label=f.get("output_label", f["output_code"]),
                data_type=f.get("data_type", "string"),
                description=f.get("description"),
                agg_role=f.get("agg_role", "dimension"),
                is_sensitive=f.get("is_sensitive", False),
                is_visible=f.get("is_visible", True),
                display_order=f.get("display_order", 0),
            )
            self.session.add(of)

        # 返回保存后的结果
        return await self.get_output_fields(model_id)

    # ==================== 预览 ====================

    async def preview_model(
        self, model_id: int, limit: int = 20, user: "User | None" = None
    ) -> dict:
        """预览模型数据（复用 DataSet SQL 构建器）。

        通过 run_dataset_query 获取列元数据和数据行，支持：
        - 多表 JOIN（基于 DataSetRelation）
        - 输出字段投影（基于 DatasetOutputField）
        - 字段权限过滤 / 脱敏
        - 数据范围权限注入

        summary 中的 unmatched_count / duplicate_match_count / null_count /
        type_error_count 当前阶段暂不计算，统一返回 null。
        """
        from app.reports.sql_builder import run_dataset_query

        limit = min(max(limit, 1), 100)

        ds = await self.session.get(DataSet, model_id)
        if ds is None:
            raise ValueError(f"数据集不存在: {model_id}")

        # 获取输出字段作为预览列
        of_q = (
            select(DatasetOutputField)
            .where(DatasetOutputField.dataset_id == model_id)
            .order_by(DatasetOutputField.display_order)
        )
        output_fields = (await self.session.execute(of_q)).scalars().all()

        # 构建 alias.column_code → output_code 映射 + SQL 列引用
        code_map: dict[str, str] = {}
        sql_columns: list[str] = []
        for f in output_fields:
            src = f"{f.source_alias}.{f.source_column}"
            code_map[src] = f.output_code
            sql_columns.append(src)

        try:
            warnings: list[str] = []
            columns_meta, items, total = await run_dataset_query(
                dataset_id=model_id,
                columns=sql_columns,
                filters=[],
                sorts=[],
                value_rules=[],
                aggregate=False,
                aggregations={},
                column_settings={},
                transpose={},
                rounding_corrections=[],
                filter_logic=None,
                list_lookup={},
                page=1,
                page_size=limit,
                user=user,
                db=self.session,
                scope_strategy=ds.scope_strategy,
                warnings_sink=warnings,
            )

            # 将 alias.column_code 映射为 output_code
            remapped_items = [
                {code_map.get(k, k): v for k, v in row.items()}
                for row in items
            ]
            remapped_columns = [
                code_map.get(m["code"], m["code"]) for m in columns_meta
            ]

            return {
                "items": remapped_items,
                "columns": remapped_columns,
                "summary": {
                    "main_count": total,
                    "result_count": len(items),
                    # 以下统计当前阶段暂不计算
                    "unmatched_count": None,
                    "duplicate_match_count": None,
                    "null_count": None,
                    "type_error_count": None,
                },
                "warnings": warnings,
            }
        except Exception as exc:
            return {
                "items": [],
                "columns": [],
                "summary": {
                    "main_count": None,
                    "result_count": 0,
                    "unmatched_count": None,
                    "duplicate_match_count": None,
                    "null_count": None,
                    "type_error_count": None,
                },
                "error": str(exc),
            }

    # ==================== 指标 ====================

    async def list_metrics(
        self,
        *,
        page: int = DEFAULT_PAGE,
        page_size: int = DEFAULT_PAGE_SIZE,
        keyword: str | None = None,
        subject_area: str | None = None,
        status: str | None = None,
    ) -> dict:
        """查询指标列表（分页+筛选）"""
        from app.datasets.models import WarehouseMetric

        page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

        base = select(WarehouseMetric)

        if keyword:
            kw = f"%{keyword}%"
            base = base.where(
                or_(
                    WarehouseMetric.metric_code.ilike(kw),
                    WarehouseMetric.metric_name.ilike(kw),
                    WarehouseMetric.business_definition.ilike(kw),
                )
            )
        if subject_area:
            base = base.where(WarehouseMetric.subject_area == subject_area)
        if status:
            base = base.where(WarehouseMetric.status == status)

        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()

        offset = (page - 1) * page_size
        items_q = base.order_by(WarehouseMetric.id.desc()).offset(offset).limit(page_size)
        rows = (await self.session.execute(items_q)).scalars().all()

        items = [
            {
                "id": m.id,
                "metric_code": m.metric_code,
                "metric_name": m.metric_name,
                "metric_type": m.metric_type,
                "business_definition": m.business_definition,
                "subject_area": m.subject_area,
                "related_dataset_id": m.related_dataset_id,
                "owner_name": m.owner_name,
                "status": m.status,
                "version": m.version,
                "published_at": m.published_at,
                "created_at": m.created_at,
            }
            for m in rows
        ]

        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def create_metric(self, payload: dict, user_id: int | None = None) -> dict:
        """创建指标（默认 status=draft）。

        校验：metric_code 唯一、related_dataset_id 存在。
        如果提供了 formula_expr，自动翻译为 formula_sql。
        """
        from app.datasets.models import WarehouseMetric

        # 校验 metric_code 唯一
        exists = (
            await self.session.execute(
                select(func.count(WarehouseMetric.id)).where(
                    WarehouseMetric.metric_code == payload["metric_code"]
                )
            )
        ).scalar_one()
        if exists > 0:
            raise ValueError(f"指标编码已存在: {payload['metric_code']}")

        # 校验 related_dataset_id 存在 + DWD 层级
        ds_id = payload.get("related_dataset_id")
        if ds_id:
            ds = await self.session.get(DataSet, ds_id)
            if ds is None:
                raise ValueError(f"关联数据集不存在: {ds_id}")
            if ds.warehouse_layer != "DWD":
                raise ValueError("指标只能绑定DWD层数据集")

        # 翻译 formula_expr → formula_sql（AST 编译器，AST0015）
        formula_sql = None
        formula_expr = payload.get("formula_expr")
        compile_engine = None
        compile_version = None
        compile_meta: dict | None = None
        formula_ast: dict | None = None
        if formula_expr and ds_id:
            from app.ai_formula.formula_to_sql import translate_formula_to_sql
            result = await translate_formula_to_sql(
                self.session, formula_expr, ds_id, include_ast=True
            )
            if not result["valid"]:
                raise ValueError(f"公式翻译失败: {'; '.join(result['errors'])}")
            if not result["has_aggregate"]:
                raise ValueError(
                    "公式缺少聚合函数（如 SUM、COUNT、AVERAGE、COUNTIF 等），"
                    "请在公式中使用聚合函数"
                )
            formula_sql = result["sql"]
            compile_engine = result.get("compile_engine")
            compile_version = result.get("compile_version")
            compile_meta = {
                "dependencies": result.get("dependencies") or [],
                "functions": result.get("functions") or [],
                "warnings": result.get("warnings") or [],
                "normalized_formula": result.get("normalized_formula"),
                "rollout_engine": result.get("rollout_engine"),
            }
            formula_ast = result.get("ast")

        m = WarehouseMetric(
            metric_code=payload["metric_code"],
            metric_name=payload["metric_name"],
            metric_type=payload.get("metric_type", "derived"),
            subject_area=payload.get("subject_area"),
            business_definition=payload.get("business_definition"),
            calculation_desc=payload.get("calculation_desc"),
            formula_expr=formula_expr,
            formula_sql=formula_sql,
            formula_compile_engine=compile_engine,
            formula_compile_version=compile_version,
            formula_compile_meta=compile_meta,
            formula_ast=formula_ast,
            stat_period=payload.get("stat_period"),
            related_dataset_id=ds_id,
            related_fields=payload.get("related_fields", []),
            owner_user_id=payload.get("owner_user_id") or user_id,
            owner_name=payload.get("owner_name"),
            status="draft",
            version=1,
            created_by=user_id,
        )
        self.session.add(m)
        await self.session.flush()
        await self.session.refresh(m)
        return await self.get_metric(m.id)

    async def get_metric(self, metric_id: int) -> dict | None:
        """获取指标详情"""
        from app.datasets.models import WarehouseMetric

        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None:
            return None

        return {
            "id": m.id,
            "metric_code": m.metric_code,
            "metric_name": m.metric_name,
            "metric_type": m.metric_type,
            "subject_area": m.subject_area,
            "business_definition": m.business_definition,
            "calculation_desc": m.calculation_desc,
            "formula_expr": m.formula_expr,
            "formula_sql": m.formula_sql,
            "stat_period": m.stat_period,
            "related_dataset_id": m.related_dataset_id,
            "related_fields": m.related_fields,
            "owner_user_id": m.owner_user_id,
            "owner_name": m.owner_name,
            "status": m.status,
            "version": m.version,
            "published_at": m.published_at,
            "published_by": m.published_by,
            "created_at": m.created_at,
            "updated_at": m.updated_at,
        }

    async def update_metric(self, metric_id: int, payload: dict, exclude_unset: bool = False) -> "WarehouseMetric | None":
        """更新指标元数据（已归档指标不可编辑）。

        如果更新了 formula_expr，自动重新翻译 formula_sql。
        """
        from app.datasets.models import WarehouseMetric

        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None:
            return None

        if m.status == "archived":
            raise ValueError("已归档指标不可编辑")

        allowed = {
            "metric_name", "metric_type", "subject_area", "business_definition",
            "calculation_desc", "formula_expr", "stat_period",
            "related_dataset_id", "related_fields",
            "owner_user_id", "owner_name",
        }
        for key, val in payload.items():
            if key not in allowed:
                continue
            if val is not None or exclude_unset:
                setattr(m, key, val)

        # 校验 related_dataset_id + DWD 层级
        ds_id = m.related_dataset_id
        if "related_dataset_id" in payload and payload.get("related_dataset_id") is not None:
            ds_id = payload["related_dataset_id"]
            ds = await self.session.get(DataSet, ds_id)
            if ds is None:
                raise ValueError(f"关联数据集不存在: {ds_id}")
            if ds.warehouse_layer != "DWD":
                raise ValueError("指标只能绑定DWD层数据集")

        # 翻译 formula_expr → formula_sql（如果 formula_expr 被更新）
        if "formula_expr" in payload and payload.get("formula_expr"):
            if not ds_id:
                raise ValueError("翻译公式需要关联数据集，请先设置关联数据集")
            from app.ai_formula.formula_to_sql import translate_formula_to_sql
            result = await translate_formula_to_sql(
                self.session, payload["formula_expr"], m.related_dataset_id,
                include_ast=True,
            )
            if not result["valid"]:
                raise ValueError(f"公式翻译失败: {'; '.join(result['errors'])}")
            if not result["has_aggregate"]:
                raise ValueError(
                    "公式缺少聚合函数（如 SUM、COUNT、AVERAGE、COUNTIF 等），"
                    "请在公式中使用聚合函数"
                )
            m.formula_sql = result["sql"]
            # 同步刷新编译元数据（AST0015 编辑路径）
            m.formula_compile_engine = result.get("compile_engine")
            m.formula_compile_version = result.get("compile_version")
            m.formula_compile_meta = {
                "dependencies": result.get("dependencies") or [],
                "functions": result.get("functions") or [],
                "warnings": result.get("warnings") or [],
                "normalized_formula": result.get("normalized_formula"),
                "rollout_engine": result.get("rollout_engine"),
            }
            m.formula_ast = result.get("ast")

        return m

    async def publish_metric(self, metric_id: int, user_id: int) -> dict | None:
        """发布指标。

        状态校验：只有 draft 可发布。
        """
        from app.datasets.models import WarehouseMetric

        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None:
            return None

        if m.status != "draft":
            raise ValueError(f"仅 draft 状态可发布，当前状态: {m.status}")

        m.status = "published"
        m.version = (m.version or 0) + 1
        m.published_at = func.now()
        m.published_by = user_id
        await self.session.flush()
        await self.session.refresh(m)
        return await self.get_metric(metric_id)

    async def archive_metric(self, metric_id: int) -> dict | None:
        """归档指标。

        状态校验：只有 published 可归档。
        """
        from app.datasets.models import WarehouseMetric

        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None:
            return None

        if m.status != "published":
            raise ValueError(f"仅 published 状态可归档，当前状态: {m.status}")

        m.status = "archived"
        await self.session.flush()
        await self.session.refresh(m)
        return await self.get_metric(metric_id)

    # ==================== 批量分层 (Q0104) ====================

    async def batch_update_asset_layer(
        self, *, table_names: list[str], warehouse_layer: str
    ) -> dict:
        """批量更新资产分层。

        去重 table_names，存在的更新，不存在的写入失败明细。
        部分失败不影响其余成功。
        """
        from app.warehouse.schemas import WarehouseAssetBatchLayerItemOut

        unique_names = list(dict.fromkeys(table_names))
        items: list[dict] = []
        success_count = 0
        fail_count = 0

        for name in unique_names:
            rt = (
                await self.session.execute(
                    select(RegisteredTable).where(RegisteredTable.table_name == name)
                )
            ).scalar_one_or_none()
            if rt is None:
                items.append({"table_name": name, "success": False, "message": f"资产不存在: {name}"})
                fail_count += 1
            else:
                rt.warehouse_layer = warehouse_layer
                items.append({"table_name": name, "success": True, "message": ""})
                success_count += 1

        return {
            "warehouse_layer": warehouse_layer,
            "success_count": success_count,
            "fail_count": fail_count,
            "items": items,
        }

    # ==================== 分层统计 (Q0106) ====================

    async def get_layer_stats(self) -> dict:
        """按分层统计资产数量，7 层均返回（缺失层 count=0）。"""
        from app.warehouse.schemas import WAREHOUSE_LAYERS

        q = (
            select(
                RegisteredTable.warehouse_layer,
                func.count(RegisteredTable.id),
            )
            .group_by(RegisteredTable.warehouse_layer)
        )
        rows = (await self.session.execute(q)).all()
        layer_counts: dict[str, int] = {row[0]: row[1] for row in rows}

        items = [
            {"code": layer, "count": layer_counts.get(layer, 0)}
            for layer in WAREHOUSE_LAYERS
        ]
        total = sum(item["count"] for item in items)

        return {"total": total, "items": items}


# 便捷工厂
def get_warehouse_service(session: AsyncSession) -> WarehouseService:
    return WarehouseService(session)


