# -*- coding: utf-8 -*-
"""数据仓库业务逻辑层

资产、模型、指标、影响分析的 service 实现。
"""
from typing import Optional

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import RegisteredTable, TableColumn
from app.datasets.models import (
    DataSet,
    DataSetTable,
    DataSetRelation,
    DatasetOutputField,
    DatasetCalculatedField,
)
from app.permissions.masker import get_hidden_columns
from app.users.models import User
from app.warehouse.schemas import (
    WAREHOUSE_LAYERS,
    ASSET_STATUSES,
    WarehouseAssetOut,
    WarehouseAssetDetailOut,
    UcpInfoOut,
)
from app.warehouse.ucp_adapter import get_asset_ucp_info

DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 200


class WarehouseService:
    """数据仓库业务服务"""

    def __init__(self, session: AsyncSession):
        self.session = session

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

        return {"id": ds.id, "name": ds.name, "status": ds.status, "version": ds.version}

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

        return {
            "id": ds.id,
            "name": ds.name,
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
            "tables": [
                {"id": t.id, "table_name": t.table_name, "alias": t.alias}
                for t in tables
            ],
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
            "name", "description", "warehouse_layer", "subject_area",
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

        # 校验 related_dataset_id 存在
        if payload.get("related_dataset_id"):
            ds = await self.session.get(DataSet, payload["related_dataset_id"])
            if ds is None:
                raise ValueError(f"关联数据集不存在: {payload['related_dataset_id']}")

        m = WarehouseMetric(
            metric_code=payload["metric_code"],
            metric_name=payload["metric_name"],
            metric_type=payload.get("metric_type", "derived"),
            subject_area=payload.get("subject_area"),
            business_definition=payload.get("business_definition"),
            calculation_desc=payload.get("calculation_desc"),
            formula_expr=payload.get("formula_expr"),
            stat_period=payload.get("stat_period"),
            related_dataset_id=payload.get("related_dataset_id"),
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
        # 返回完整详情，与 GET /metrics/{id} 输出结构一致
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
        """更新指标元数据（已归档指标不可编辑）。"""
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

        # 校验 related_dataset_id
        if "related_dataset_id" in payload and payload.get("related_dataset_id") is not None:
            ds = await self.session.get(DataSet, payload["related_dataset_id"])
            if ds is None:
                raise ValueError(f"关联数据集不存在: {payload['related_dataset_id']}")

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


# ==================== 标准化规则 (R01) ====================

STANDARDIZATION_RULE_TYPES = ("rename", "type_convert", "value_map", "unit_convert", "split_merge", "deduplicate", "null_handling", "format_standardize")


class StandardizationRuleService:
    """ODS→DWD 标准化规则 CRUD + 预览 + 执行 + DWD 视图生成"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_rules(self, *, page=1, page_size=20, asset_type=None, asset_code=None, rule_type=None, enabled=None):
        from app.warehouse.models import StandardizationRule
        page_size = min(max(page_size, 1), 200)
        base = select(StandardizationRule)
        if asset_type: base = base.where(StandardizationRule.asset_type == asset_type)
        if asset_code: base = base.where(StandardizationRule.asset_code == asset_code)
        if rule_type: base = base.where(StandardizationRule.rule_type == rule_type)
        if enabled is not None: base = base.where(StandardizationRule.enabled == enabled)
        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()
        offset = (page - 1) * page_size
        rows = (await self.session.execute(base.order_by(StandardizationRule.display_order, StandardizationRule.id).offset(offset).limit(page_size))).scalars().all()
        return {"total": total, "page": page, "page_size": page_size, "items": [{"id": r.id, "asset_type": r.asset_type, "asset_code": r.asset_code, "rule_type": r.rule_type, "source_field": r.source_field, "target_field": r.target_field, "rule_config": r.rule_config, "enabled": r.enabled, "display_order": r.display_order, "description": r.description, "created_at": r.created_at.isoformat() if r.created_at else None, "updated_at": r.updated_at.isoformat() if r.updated_at else None} for r in rows]}

    async def get_rule(self, rule_id: int):
        from app.warehouse.models import StandardizationRule
        return await self.session.get(StandardizationRule, rule_id)

    async def create_rule(self, payload: dict):
        from app.warehouse.models import StandardizationRule
        if payload.get("rule_type") not in STANDARDIZATION_RULE_TYPES:
            raise ValueError(f"非法 rule_type: {payload.get('rule_type')}")
        rule = StandardizationRule(**{k: v for k, v in payload.items() if k in ("asset_type", "asset_code", "rule_type", "source_field", "target_field", "rule_config", "enabled", "display_order", "description")})
        self.session.add(rule); await self.session.commit(); await self.session.refresh(rule)
        return rule

    async def update_rule(self, rule_id: int, payload: dict):
        from app.warehouse.models import StandardizationRule
        rule = await self.session.get(StandardizationRule, rule_id)
        if rule is None: return None
        allowed = {"source_field", "target_field", "rule_config", "enabled", "display_order", "description"}
        for k, v in payload.items():
            if k in allowed: setattr(rule, k, v)
        await self.session.commit(); await self.session.refresh(rule)
        return rule

    async def set_enabled(self, rule_id: int, enabled: bool):
        from app.warehouse.models import StandardizationRule
        rule = await self.session.get(StandardizationRule, rule_id)
        if rule is None: return None
        rule.enabled = enabled; await self.session.commit(); await self.session.refresh(rule)
        return rule

    async def delete_rule(self, rule_id: int) -> bool:
        from app.warehouse.models import StandardizationRule
        rule = await self.session.get(StandardizationRule, rule_id)
        if rule is None: return False
        await self.session.delete(rule); await self.session.commit()
        return True

    async def preview(self, *, asset_code: str, rules: list, sample_size: int = 20):
        """预览标准化规则效果（采样）"""
        from app.warehouse.models import StandardizationRule
        from app.warehouse.standardization_engine import execute_rules
        from sqlalchemy import text as sa_text
        try:
            result = await self.session.execute(sa_text(f"SELECT * FROM `{asset_code}` LIMIT {sample_size}"))
            rows_raw = result.fetchall()
            if not rows_raw: return {"error": "empty"}
            cols = list(result.keys())
            rows = [dict(zip(cols, row)) for row in rows_raw]
            rule_objs = []
            for r in rules:
                if r.get("id"):
                    existing = await self.session.get(StandardizationRule, r["id"])
                    if existing: rule_objs.append(existing)
                else:
                    rule_objs.append(StandardizationRule(**r))
            transformed = execute_rules(rule_objs, rows)
            return {"columns": list(transformed[0].keys()) if transformed else cols, "items": rows, "preview_items": transformed}
        except Exception as e:
            return {"error": str(e)}

    async def execute_full(self, *, asset_code: str, target_table: str) -> dict:
        """全量执行 ODS→DWD 标准化并写入目标物理表。"""
        from app.warehouse.models import StandardizationRule
        from app.warehouse.standardization_engine import execute_rules
        from app.data.models import RegisteredTable, TableColumn
        from sqlalchemy import text as sa_text, delete as sa_delete
        q = select(StandardizationRule).where(StandardizationRule.asset_code == asset_code, StandardizationRule.enabled == True).order_by(StandardizationRule.display_order)
        rules = (await self.session.execute(q)).scalars().all()
        if not rules: return {"error": "no_rules", "detail": f"表 {asset_code} 没有启用的标准化规则"}
        try:
            result = await self.session.execute(sa_text(f"SELECT * FROM `{asset_code}`"))
            rows_raw = result.fetchall()
            if not rows_raw: return {"error": "empty", "detail": "ODS 表无数据", "total": 0, "success": 0, "failed": 0, "errors": [], "target_table": target_table}
            cols = list(result.keys())
            rows = [dict(zip(cols, row)) for row in rows_raw]
        except Exception as e: return {"error": "read_failed", "detail": str(e)}
        total = len(rows)
        try: transformed = execute_rules(rules, rows)
        except Exception as e: return {"error": "transform_failed", "detail": str(e), "total": total, "success": 0, "failed": total, "errors": []}
        success = len(transformed); failed = total - success
        if not target_table: return {"error": "no_target", "detail": "未指定目标表名"}
        target = target_table.strip().replace("`", "")
        try:
            await self.session.execute(sa_text(f"DROP TABLE IF EXISTS `{target}`"))
            if transformed:
                sample = transformed[0]
                col_defs = []
                for k, v in sample.items():
                    ctype = "BOOLEAN" if isinstance(v, bool) else "BIGINT" if isinstance(v, int) else "DOUBLE PRECISION" if isinstance(v, float) else "TEXT"
                    col_defs.append(f"`{k}` {ctype}")
                await self.session.execute(sa_text(f"CREATE TABLE `{target}` ({', '.join(col_defs)})"))
                batch_size = 1000
                for bs in range(0, len(transformed), batch_size):
                    batch = transformed[bs:bs + batch_size]
                    bcols = list(batch[0].keys())
                    placeholders = ", ".join([f"({', '.join([f':{c}_{i}' for c in bcols])})" for i in range(len(batch))])
                    params = {}
                    for i, row in enumerate(batch):
                        for c in bcols: params[f"{c}_{i}"] = row.get(c)
                    await self.session.execute(sa_text(f"INSERT INTO `{target}` ({', '.join([f'`{c}`' for c in bcols])}) VALUES {placeholders}"), params)
            await self.session.commit()
        except Exception as e: return {"error": "write_failed", "detail": str(e), "total": total, "success": 0, "failed": total, "errors": []}
        try:
            existing_rt = (await self.session.execute(select(RegisteredTable).where(RegisteredTable.table_name == target))).scalar().first()
            if existing_rt: existing_rt.warehouse_layer = "DWD"
            else: self.session.add(RegisteredTable(table_name=target, table_label=target, warehouse_layer="DWD", source_system="数据加工", asset_status="published"))
            await self.session.flush()
            await self.session.execute(sa_delete(TableColumn).where(TableColumn.table_name == target))
            seen = set()
            for i, r in enumerate(rules):
                tgt = r.target_field or r.source_field
                if tgt in seen: continue
                seen.add(tgt)
                self.session.add(TableColumn(table_name=target, column_name=tgt, column_code=tgt, column_label=tgt, data_type="string", is_visible=True, display_order=(i + 1) * 10))
            await self.session.commit()
        except Exception: await self.session.rollback()
        return {"total": total, "success": success, "failed": failed, "errors": [], "target_table": target}

    async def generate_dwd_view(self, *, asset_code: str, asset_type: str = "table", owner_user_id=None, owner_name=None) -> dict:
        """基于规则生成 DWD 视图（更新已有单表数据集，避免重复建）"""
        from app.warehouse.models import StandardizationRule
        from app.datasets.models import DataSet, DataSetTable, DatasetOutputField
        from app.data.models import TableColumn
        from app.warehouse.standardization_engine import RULE_ORDER
        q = select(StandardizationRule).where(StandardizationRule.asset_code == asset_code, StandardizationRule.enabled == True).order_by(StandardizationRule.display_order)
        rules = (await self.session.execute(q)).scalars().all()
        if not rules: return None
        from app.datasets.single_table import find_single_table_dataset, ensure_single_table_dataset
        ds = await find_single_table_dataset(asset_code, self.session)
        if ds is None: ds = await ensure_single_table_dataset(asset_code, self.session)
        ds.warehouse_layer = "DWD"; ds.status = "published"; ds.version = (ds.version or 1) + 1
        from sqlalchemy import delete as sa_delete
        await self.session.execute(sa_delete(DatasetOutputField).where(DatasetOutputField.dataset_id == ds.id))
        # Generate output fields from rules
        rule_by_source = {}
        for r in rules:
            rule_by_source.setdefault(r.source_field, []).append(r)
        output_fields = []
        for i, r in enumerate(rules):
            target_col = r.target_field or r.source_field
            output_fields.append({"source_alias": "t", "source_column": r.source_field, "output_code": target_col, "output_label": r.description or target_col, "data_type": "string", "agg_role": "dimension"})
        for i, of in enumerate(output_fields):
            self.session.add(DatasetOutputField(dataset_id=ds.id, source_alias=of["source_alias"], source_column=of["source_column"], output_code=of["output_code"], output_label=of["output_label"], data_type=of["data_type"], agg_role=of["agg_role"], description="", display_order=i))
        await self.session.commit(); await self.session.refresh(ds)
        return {"dataset_id": ds.id, "view_name": ds.name, "version": ds.version}


def get_standardization_rule_service(session: AsyncSession) -> StandardizationRuleService:
    return StandardizationRuleService(session)


# ==================== 标准化模板 (R0106) ====================

class StandardizationTemplateService:
    """标准化模板 CRUD + 加载到表"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_templates(self, *, page=1, page_size=20, business_object=None):
        from app.warehouse.models import StandardizationTemplate
        page_size = min(max(page_size, 1), 200)
        base = select(StandardizationTemplate)
        if business_object: base = base.where(StandardizationTemplate.business_object == business_object)
        count_q = select(func.count()).select_from(base.subquery())
        total = (await self.session.execute(count_q)).scalar_one()
        offset = (page - 1) * page_size
        rows = (await self.session.execute(base.order_by(StandardizationTemplate.id.desc()).offset(offset).limit(page_size))).scalars().all()
        items = [{"id": t.id, "name": t.name, "description": t.description, "business_object": t.business_object, "template_rules": t.template_rules, "version": t.version, "created_at": t.created_at.isoformat() if t.created_at else None, "updated_at": t.updated_at.isoformat() if t.updated_at else None} for t in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_template(self, template_id: int):
        from app.warehouse.models import StandardizationTemplate
        return await self.session.get(StandardizationTemplate, template_id)

    async def create_template(self, payload: dict):
        from app.warehouse.models import StandardizationTemplate
        t = StandardizationTemplate(**{k: v for k, v in payload.items() if k in ("name", "description", "business_object", "template_rules")})
        self.session.add(t); await self.session.commit(); await self.session.refresh(t)
        return t

    async def update_template(self, template_id: int, payload: dict):
        from app.warehouse.models import StandardizationTemplate
        t = await self.session.get(StandardizationTemplate, template_id)
        if t is None: return None
        for k, v in payload.items():
            if k in ("name", "description", "business_object", "template_rules"): setattr(t, k, v)
        t.version = (t.version or 1) + 1; await self.session.commit(); await self.session.refresh(t)
        return t

    async def delete_template(self, template_id: int) -> bool:
        from app.warehouse.models import StandardizationTemplate
        t = await self.session.get(StandardizationTemplate, template_id)
        if t is None: return False
        await self.session.delete(t); await self.session.commit()
        return True

    async def load_template_to_asset(self, template_id: int, asset_code: str, asset_type: str = "table", on_conflict: str = "skip"):
        from app.warehouse.models import StandardizationTemplate, StandardizationRule
        t = await self.session.get(StandardizationTemplate, template_id)
        if t is None: return None
        if not t.template_rules: return {"loaded": 0, "skipped": 0, "template_id": template_id}
        existing = (await self.session.execute(select(StandardizationRule).where(StandardizationRule.asset_code == asset_code))).scalars().all()
        existing_keys = {(r.source_field, r.rule_type) for r in existing}
        loaded = 0; skipped = 0
        max_order = max((r.display_order for r in existing), default=0)
        for i, rule_data in enumerate(t.template_rules):
            key = (rule_data.get("source_field", ""), rule_data.get("rule_type", ""))
            if key in existing_keys:
                if on_conflict == "skip": skipped += 1; continue
            rule = StandardizationRule(asset_type=asset_type, asset_code=asset_code, rule_type=rule_data["rule_type"], source_field=rule_data.get("source_field", ""), target_field=rule_data.get("target_field", ""), rule_config=rule_data.get("rule_config", {}), enabled=True, display_order=max_order + (i + 1) * 10)
            self.session.add(rule); loaded += 1
        await self.session.commit()
        return {"loaded": loaded, "skipped": skipped, "template_id": template_id}


def get_standardization_template_service(session: AsyncSession) -> StandardizationTemplateService:
    return StandardizationTemplateService(session)


# ==================== 指标计算 (R0302) ====================

class MetricComputeService:
    """指标计算与结果管理"""
    def __init__(self, session: AsyncSession): self.session = session

    async def compute_metric(self, metric_id: int, period: str, user_id=None):
        from datetime import datetime as dt
        from app.datasets.models import WarehouseMetric
        from app.warehouse.models import MetricResult, MetricRun
        from app.ai_formula.evaluator import evaluate_formula
        from sqlalchemy import text as sa_text
        m = await self.session.get(WarehouseMetric, metric_id)
        if m is None: return {"error": "not_found", "detail": f"指标不存在: {metric_id}"}
        if m.status == "archived": return {"error": "bad_request", "detail": "已归档指标不可计算"}
        started = dt.utcnow()
        run = MetricRun(metric_id=metric_id, status="running", period=period, started_at=started)
        self.session.add(run); await self.session.flush()
        try:
            value = None
            if m.formula_expr:
                row_data = {}
                if m.related_dataset_id:
                    try:
                        ds = await self.session.get(DataSet, m.related_dataset_id)
                        if ds and ds.tables:
                            fst = ds.tables[0]
                            rr = await self.session.execute(sa_text(f"SELECT * FROM {fst.table_name} LIMIT 1"))
                            row = rr.fetchone()
                            if row: row_data = dict(row._mapping)
                    except: pass
                eval_result = evaluate_formula(m.formula_expr, row_data)
                value = eval_result if eval_result is not None else None
            result = MetricResult(metric_id=metric_id, period=period, value={"value": value, "metric_code": m.metric_code}, computed_at=dt.utcnow())
            self.session.add(result); await self.session.flush()
            run.status = "success"; run.result_id = result.id; run.finished_at = dt.utcnow()
            return {"run_id": run.id, "metric_id": metric_id, "status": "success", "period": period, "value": result.value, "error_message": None}
        except Exception as exc:
            run.status = "failed"; run.error_message = str(exc)[:1000]; run.finished_at = dt.utcnow()
            return {"run_id": run.id, "metric_id": metric_id, "status": "failed", "period": period, "value": None, "error_message": run.error_message}

    async def recalc_metric(self, metric_id: int, period: str, user_id=None):
        from app.warehouse.models import MetricResult
        old = await self.session.execute(select(MetricResult).where(MetricResult.metric_id == metric_id, MetricResult.period == period))
        for r in old.scalars().all(): await self.session.delete(r)
        await self.session.flush()
        return await self.compute_metric(metric_id, period, user_id)

    async def list_results(self, metric_id: int, page=1, page_size=20):
        from app.warehouse.models import MetricResult
        page_size = min(max(page_size, 1), 200)
        base = select(MetricResult).where(MetricResult.metric_id == metric_id)
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.order_by(MetricResult.computed_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": r.id, "metric_id": r.metric_id, "period": r.period, "value": r.value, "computed_at": r.computed_at.isoformat() if r.computed_at else None} for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def list_runs(self, metric_id: int, page=1, page_size=20):
        from app.warehouse.models import MetricRun
        page_size = min(max(page_size, 1), 200)
        base = select(MetricRun).where(MetricRun.metric_id == metric_id)
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.order_by(MetricRun.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": r.id, "metric_id": r.metric_id, "status": r.status, "error_message": r.error_message, "period": r.period, "result_id": r.result_id, "started_at": r.started_at.isoformat() if r.started_at else None, "finished_at": r.finished_at.isoformat() if r.finished_at else None, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}


def get_metric_compute_service(session: AsyncSession) -> MetricComputeService:
    return MetricComputeService(session)


# ==================== 维度定义 (R0305) ====================

class DimensionService:
    """维度目录管理"""
    def __init__(self, session: AsyncSession): self.session = session

    async def list_dimensions(self):
        from app.warehouse.models import Dimension
        rows = (await self.session.execute(select(Dimension).order_by(Dimension.display_order, Dimension.id))).scalars().all()
        return [{"id": d.id, "dimension_code": d.dimension_code, "dimension_name": d.dimension_name, "parent_id": d.parent_id, "bound_table": d.bound_table, "bound_field": d.bound_field, "description": d.description, "display_order": d.display_order, "created_at": d.created_at.isoformat() if d.created_at else None, "updated_at": d.updated_at.isoformat() if d.updated_at else None} for d in rows]

    async def get_dimension(self, dim_id: int):
        from app.warehouse.models import Dimension
        d = await self.session.get(Dimension, dim_id)
        if d is None: return None
        return {"id": d.id, "dimension_code": d.dimension_code, "dimension_name": d.dimension_name, "parent_id": d.parent_id, "bound_table": d.bound_table, "bound_field": d.bound_field, "description": d.description, "display_order": d.display_order}

    async def get_tree(self):
        dims = {d["id"]: {**d, "children": []} for d in await self.list_dimensions()}
        roots = []
        for d_id, node in dims.items():
            parent_id = next((x["parent_id"] for x in [dims.get(d_id, {})] if x.get("parent_id")), None)
            pid = node.get("parent_id")
            if pid and pid in dims: dims[pid]["children"].append(node)
            else: roots.append(node)
        return roots

    async def create_dimension(self, payload: dict):
        from app.warehouse.models import Dimension
        exists = (await self.session.execute(select(func.count(Dimension.id)).where(Dimension.dimension_code == payload["dimension_code"]))).scalar_one()
        if exists > 0: raise ValueError(f"维度编码已存在: {payload['dimension_code']}")
        parent_id = payload.get("parent_id")
        if parent_id:
            parent = await self.session.get(Dimension, parent_id)
            if parent is None: raise ValueError(f"父维度不存在: {parent_id}")
        d = Dimension(dimension_code=payload["dimension_code"], dimension_name=payload["dimension_name"], parent_id=parent_id, bound_table=payload.get("bound_table"), bound_field=payload.get("bound_field"), description=payload.get("description"), display_order=payload.get("display_order", 0))
        self.session.add(d); await self.session.commit(); await self.session.refresh(d)
        return await self.get_dimension(d.id)

    async def update_dimension(self, dim_id: int, payload: dict):
        from app.warehouse.models import Dimension
        d = await self.session.get(Dimension, dim_id)
        if d is None: return None
        if "parent_id" in payload:
            new_parent = payload["parent_id"]
            if new_parent == dim_id: raise ValueError("不能将维度设为自身的父维度")
            if new_parent is not None:
                parent = await self.session.get(Dimension, new_parent)
                if parent is None: raise ValueError(f"父维度不存在: {new_parent}")
        for key in ("dimension_name", "parent_id", "bound_table", "bound_field", "description", "display_order"):
            if key in payload and payload[key] is not None: setattr(d, key, payload[key])
        return d

    async def delete_dimension(self, dim_id: int) -> bool:
        from app.warehouse.models import Dimension
        d = await self.session.get(Dimension, dim_id)
        if d is None: return False
        children = (await self.session.execute(select(Dimension).where(Dimension.parent_id == dim_id))).scalars().all()
        for child in children: child.parent_id = None
        await self.session.delete(d); await self.session.commit()
        return True

    async def get_impact(self, dim_id: int):
        from app.warehouse.models import Dimension, DwsAggregateDefinition
        d = await self.session.get(Dimension, dim_id)
        if d is None: return None
        aggs = (await self.session.execute(select(DwsAggregateDefinition).where(DwsAggregateDefinition.group_by.contains([d.dimension_code])))).scalars().all()
        children = (await self.session.execute(select(Dimension).where(Dimension.parent_id == dim_id))).scalars().all()
        return {"dimension_id": dim_id, "dimension_code": d.dimension_code, "referenced_by_aggregates": [{"id": a.id, "name": a.name} for a in aggs], "referenced_by_children": [{"id": c.id, "dimension_code": c.dimension_code} for c in children], "can_delete": len(list(aggs)) == 0}


def get_dimension_service(session: AsyncSession) -> DimensionService:
    return DimensionService(session)


# ==================== DWS 聚合定义 (R0308) ====================

DWS_AGGREGATIONS = ("sum", "count", "avg", "max", "min")


class DwsAggregateService:
    """DWD → DWS 聚合定义管理"""
    def __init__(self, session: AsyncSession): self.session = session

    async def list_aggregates(self, metric_id=None, status=None, page=1, page_size=20):
        from app.warehouse.models import DwsAggregateDefinition
        page_size = min(max(page_size, 1), 200)
        base = select(DwsAggregateDefinition)
        if metric_id is not None: base = base.where(DwsAggregateDefinition.metric_id == metric_id)
        if status: base = base.where(DwsAggregateDefinition.status == status)
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.order_by(DwsAggregateDefinition.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": a.id, "name": a.name, "metric_id": a.metric_id, "source_dataset_id": a.source_dataset_id, "group_by": a.group_by, "filter": a.filter, "aggregation": a.aggregation, "measure_field": a.measure_field, "time_grain": a.time_grain, "business_definition": a.business_definition, "status": a.status} for a in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_aggregate(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        return {"id": a.id, "name": a.name, "metric_id": a.metric_id, "source_dataset_id": a.source_dataset_id, "group_by": a.group_by, "filter": a.filter, "aggregation": a.aggregation, "measure_field": a.measure_field, "time_grain": a.time_grain, "business_definition": a.business_definition, "status": a.status}

    async def create_aggregate(self, payload: dict):
        from app.warehouse.models import DwsAggregateDefinition, Dimension
        from app.datasets.models import WarehouseMetric
        if payload.get("aggregation") not in DWS_AGGREGATIONS: raise ValueError(f"非法聚合方式: {payload['aggregation']}")
        if payload.get("metric_id"):
            m = await self.session.get(WarehouseMetric, payload["metric_id"])
            if m is None: raise ValueError(f"指标不存在: {payload['metric_id']}")
        if payload.get("source_dataset_id"):
            ds = await self.session.get(DataSet, payload["source_dataset_id"])
            if ds is None: raise ValueError(f"数据集不存在: {payload['source_dataset_id']}")
        group_by = payload.get("group_by", [])
        if group_by:
            existing_dims = (await self.session.execute(select(Dimension.dimension_code).where(Dimension.dimension_code.in_(group_by)))).scalars().all()
            existing_set = set(existing_dims)
            for code in group_by:
                if code not in existing_set: raise ValueError(f"维度 code 不存在: {code}")
        a = DwsAggregateDefinition(name=payload["name"], metric_id=payload.get("metric_id"), source_dataset_id=payload.get("source_dataset_id"), group_by=group_by, filter=payload.get("filter"), aggregation=payload.get("aggregation", "sum"), measure_field=payload.get("measure_field"), time_grain=payload.get("time_grain"), business_definition=payload.get("business_definition"), status="draft")
        self.session.add(a); await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(a.id)

    async def update_aggregate(self, agg_id: int, payload: dict):
        from app.warehouse.models import DwsAggregateDefinition, Dimension
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        if a.status == "archived": raise ValueError("已归档聚合定义不可编辑")
        if "group_by" in payload and payload["group_by"]:
            existing_dims = (await self.session.execute(select(Dimension.dimension_code).where(Dimension.dimension_code.in_(payload["group_by"])))).scalars().all()
            for code in payload["group_by"]:
                if code not in set(existing_dims): raise ValueError(f"维度 code 不存在: {code}")
        allowed = {"name", "group_by", "filter", "aggregation", "measure_field", "time_grain", "business_definition"}
        for key, val in payload.items():
            if key in allowed: setattr(a, key, val)
        if "aggregation" in payload and payload["aggregation"] not in DWS_AGGREGATIONS: raise ValueError(f"非法聚合方式")
        return a

    async def delete_aggregate(self, agg_id: int) -> bool:
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return False
        await self.session.delete(a); await self.session.commit()
        return True

    async def publish_aggregate(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        if a.status != "draft": raise ValueError("仅 draft 可发布")
        a.status = "published"; await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(agg_id)

    async def archive_aggregate(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        a = await self.session.get(DwsAggregateDefinition, agg_id)
        if a is None: return None
        if a.status != "published": raise ValueError("仅 published 可归档")
        a.status = "archived"; await self.session.commit(); await self.session.refresh(a)
        return await self.get_aggregate(agg_id)

    async def validate_aggregate(self, payload: dict):
        from app.warehouse.models import Dimension
        errors = []
        if not payload.get("name"): errors.append({"field": "name", "message": "名称为必填"})
        if not payload.get("group_by"): errors.append({"field": "group_by", "message": "至少需要一个分组维度"})
        elif payload["group_by"]:
            existing = (await self.session.execute(select(Dimension.dimension_code).where(Dimension.dimension_code.in_(payload["group_by"])))).scalars().all()
            for code in payload["group_by"]:
                if code not in set(existing): errors.append({"field": "group_by", "message": f"维度 code 不存在: {code}"})
        if not payload.get("measure_field"): errors.append({"field": "measure_field", "message": "度量字段为必填"})
        return {"valid": len(errors) == 0, "errors": errors}

    async def generate_dws_view(self, agg_id: int):
        from datetime import datetime as dt
        from app.warehouse.models import DwsAggregateDefinition, Dimension
        agg = await self.session.get(DwsAggregateDefinition, agg_id)
        if agg is None: return None
        dim_map = {}
        if agg.group_by:
            dims = (await self.session.execute(select(Dimension).where(Dimension.dimension_code.in_(agg.group_by)))).scalars().all()
            for d in dims:
                dim_map[d.dimension_code] = f"{d.bound_table}.{d.bound_field}" if d.bound_table and d.bound_field else d.dimension_code
        measure = agg.measure_field or "*"
        agg_func = agg.aggregation.upper() if agg.aggregation else "SUM"
        resolved_cols = [dim_map.get(c, c) for c in (agg.group_by or [])]
        group_cols = ", ".join(resolved_cols) if resolved_cols else ""
        view_name = f"dws_{agg.name.replace(' ', '_').lower()}"
        sql_summary = f"CREATE VIEW {view_name} AS\nSELECT {group_cols + ', ' if group_cols else ''}{agg_func}({measure}) AS {agg_func}_{measure}\nFROM datasets.id={agg.source_dataset_id}\nGROUP BY {group_cols if group_cols else '()'}"
        ds_name = view_name
        existing = (await self.session.execute(select(DataSet).where(DataSet.name == ds_name))).scalars().first()
        if existing: ds = existing; ds.version = (ds.version or 0) + 1
        else:
            ds = DataSet(name=ds_name, description=agg.business_definition or f"从 {agg.name} 生成", warehouse_layer="DWS", status="published", version=1, published_at=dt.utcnow())
            self.session.add(ds); await self.session.flush()
        return {"aggregate_id": agg_id, "view_name": ds_name, "sql_summary": sql_summary, "output_fields": list(agg.group_by or []) + [f"{agg_func}_{measure}"], "dependencies": [], "version": ds.version, "status": "published"}

    async def get_view_impact(self, agg_id: int):
        from app.warehouse.models import DwsAggregateDefinition
        agg = await self.session.get(DwsAggregateDefinition, agg_id)
        if agg is None: return None
        deps = []; warnings = []
        if not agg.measure_field: warnings.append("未指定度量字段")
        if not agg.group_by: warnings.append("未指定分组维度")
        return {"aggregate_id": agg_id, "aggregate_name": agg.name, "dependencies": deps, "warnings": warnings, "estimated_output_fields": len(agg.group_by or []) + 1}


def get_dws_aggregate_service(session: AsyncSession) -> DwsAggregateService:
    return DwsAggregateService(session)


# ==================== 快照任务 (R0401) ====================

class SnapshotService:
    """快照任务管理 + 执行"""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_jobs(self, page=1, page_size=20):
        from app.warehouse.models import SnapshotJob
        page_size = min(max(page_size, 1), 200)
        base = select(SnapshotJob).order_by(SnapshotJob.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": j.id, "name": j.name, "source_table": j.source_table, "target_table": j.target_table, "snapshot_keys": j.snapshot_keys, "period": j.period, "retention": j.retention, "enabled": j.enabled, "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None, "last_status": j.last_status} for j in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_job(self, job_id: int):
        from app.warehouse.models import SnapshotJob
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return None
        return {"id": j.id, "name": j.name, "source_table": j.source_table, "target_table": j.target_table, "snapshot_keys": j.snapshot_keys, "period": j.period, "retention": j.retention, "enabled": j.enabled}

    async def create_job(self, payload: dict):
        from app.warehouse.models import SnapshotJob
        j = SnapshotJob(name=payload["name"], source_table=payload["source_table"], target_table=payload["target_table"], snapshot_keys=payload.get("snapshot_keys", []), period=payload.get("period", "monthly"), retention=payload.get("retention", 12))
        self.session.add(j); await self.session.commit(); await self.session.refresh(j)
        return await self.get_job(j.id)

    async def update_job(self, job_id: int, payload: dict):
        from app.warehouse.models import SnapshotJob
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return None
        for k in ("name", "snapshot_keys", "period", "retention", "enabled"):
            if k in payload: setattr(j, k, payload[k])
        await self.session.commit(); await self.session.refresh(j)
        return await self.get_job(j.id)

    async def delete_job(self, job_id: int) -> bool:
        from app.warehouse.models import SnapshotJob
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return False
        await self.session.delete(j); await self.session.commit()
        return True

    async def trigger_snapshot(self, job_id: int, period_value: str) -> dict:
        """手动触发快照执行"""
        from datetime import datetime as dt
        from app.warehouse.models import SnapshotJob, SnapshotRun
        from sqlalchemy import text as sa_text
        j = await self.session.get(SnapshotJob, job_id)
        if j is None: return {"error": "not_found"}
        started = dt.utcnow()
        run = SnapshotRun(job_id=job_id, status="running", period_value=period_value, started_at=started)
        self.session.add(run); await self.session.flush()
        try:
            result = await self.session.execute(sa_text(f"SELECT * FROM `{j.source_table}`"))
            rows = result.fetchall()
            cols = list(result.keys())
            row_count = len(rows)
            # COPY to target
            await self.session.execute(sa_text(f"DROP TABLE IF EXISTS `{j.target_table}_{period_value}`"))
            col_defs = ", ".join([f"`{c}` TEXT" for c in cols])
            await self.session.execute(sa_text(f"CREATE TABLE `{j.target_table}_{period_value}` AS SELECT * FROM `{j.source_table}`"))
            # Cleanup old snapshots beyond retention
            from sqlalchemy import inspect
            all_tables = await self.session.execute(sa_text(f"SELECT table_name FROM information_schema.tables WHERE table_name LIKE '{j.target_table}_%' ORDER BY table_name DESC"))
            snap_tables = [r[0] for r in all_tables.fetchall()]
            for old_table in snap_tables[j.retention:]:
                await self.session.execute(sa_text(f"DROP TABLE IF EXISTS `{old_table}`"))
            run.status = "success"; run.row_count = row_count
            j.last_run_at = dt.utcnow(); j.last_status = "success"
        except Exception as e:
            run.status = "failed"; run.error_message = str(e)[:1000]
            j.last_run_at = dt.utcnow(); j.last_status = "failed"
        run.finished_at = dt.utcnow()
        await self.session.commit()
        return {"run_id": run.id, "status": run.status, "row_count": run.row_count, "error_message": run.error_message}

    async def list_runs(self, job_id: int = None, page=1, page_size=20):
        from app.warehouse.models import SnapshotRun
        page_size = min(max(page_size, 1), 200)
        base = select(SnapshotRun)
        if job_id: base = base.where(SnapshotRun.job_id == job_id)
        base = base.order_by(SnapshotRun.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{"id": r.id, "job_id": r.job_id, "status": r.status, "period_value": r.period_value, "row_count": r.row_count, "error_message": r.error_message, "started_at": r.started_at.isoformat() if r.started_at else None, "finished_at": r.finished_at.isoformat() if r.finished_at else None} for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}


def get_snapshot_service(session: AsyncSession) -> SnapshotService:
    return SnapshotService(session)


# ==================== SCD Service (R0403) ====================

class ScdService:
    """SCD Type 2 拉链服务 — 配置管理 + 拉链执行"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── CRUD ──────────────────────────────────────

    async def list_configs(self, page=1, page_size=20):
        from app.warehouse.models import ScdConfig
        page_size = min(max(page_size, 1), 200)
        base = select(ScdConfig).order_by(ScdConfig.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [self._config_out(c) for c in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_config(self, config_id: int):
        from app.warehouse.models import ScdConfig
        c = await self.session.get(ScdConfig, config_id)
        return self._config_out(c) if c else None

    async def create_config(self, payload: dict):
        from app.warehouse.models import ScdConfig
        c = ScdConfig(
            name=payload["name"],
            source_table=payload["source_table"],
            target_table=payload["target_table"],
            business_key=payload["business_key"],
            effective_from_field=payload.get("effective_from_field", "effective_from"),
            effective_to_field=payload.get("effective_to_field", "effective_to"),
            current_flag_field=payload.get("current_flag_field", "current_flag"),
            compare_fields=payload.get("compare_fields", []),
        )
        self.session.add(c); await self.session.commit(); await self.session.refresh(c)
        return self._config_out(c)

    async def update_config(self, config_id: int, payload: dict):
        from app.warehouse.models import ScdConfig
        c = await self.session.get(ScdConfig, config_id)
        if c is None: return None
        for k in ("name", "business_key", "effective_from_field", "effective_to_field", "current_flag_field", "compare_fields", "enabled"):
            if k in payload: setattr(c, k, payload[k])
        await self.session.commit(); await self.session.refresh(c)
        return self._config_out(c)

    async def delete_config(self, config_id: int) -> bool:
        from app.warehouse.models import ScdConfig
        c = await self.session.get(ScdConfig, config_id)
        if c is None: return False
        await self.session.delete(c); await self.session.commit()
        return True

    def _config_out(self, c):
        return {
            "id": c.id, "name": c.name,
            "source_table": c.source_table, "target_table": c.target_table,
            "business_key": c.business_key,
            "effective_from_field": c.effective_from_field,
            "effective_to_field": c.effective_to_field,
            "current_flag_field": c.current_flag_field,
            "compare_fields": c.compare_fields or [],
            "enabled": c.enabled,
            "last_run_at": c.last_run_at.isoformat() if c.last_run_at else None,
            "last_status": c.last_status,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
        }

    # ── 拉链执行 ─────────────────────────────────

    async def execute_scd(self, config_id: int) -> dict:
        """执行 SCD Type 2 拉链逻辑

        三场景：
        1. 新增 — 业务键在 target 中不存在 → INSERT（ef=now, et=9999, cf=1）
        2. 变更 — 业务键存在且 compare_fields 任一变 → UPDATE 旧记录（et=now, cf=0）+ INSERT 新记录
        3. 不变 — 业务键存在且 compare_fields 未变 → 跳过
        """
        from datetime import datetime as dt
        from app.warehouse.models import ScdConfig, ScdRun
        from sqlalchemy import text as sa_text

        c = await self.session.get(ScdConfig, config_id)
        if c is None: return {"error": "not_found", "detail": f"SCD config {config_id} not found"}

        started = dt.utcnow()
        run = ScdRun(config_id=config_id, status="running", started_at=started)
        self.session.add(run); await self.session.flush()

        try:
            # 1. 确保 target 表存在（前缀检查，防 SQL 注入）
            if not c.target_table.replace("_", "").isalnum():
                raise ValueError(f"非法表名: {c.target_table}")
            if not c.source_table.replace("_", "").isalnum():
                raise ValueError(f"非法表名: {c.source_table}")

            # 检查 target 是否存在，不存在则从 source 结构创建
            check = await self.session.execute(
                sa_text(f"SELECT 1 FROM information_schema.tables WHERE table_name = :t")
                .bindparams(t=c.target_table)
            )
            target_exists = check.fetchone() is not None
            if not target_exists:
                await self.session.execute(
                    sa_text(f"CREATE TABLE `{c.target_table}` LIKE `{c.source_table}`")
                )
                # 添加拉链字段
                for col_def in [
                    (c.effective_from_field, "DATETIME NOT NULL"),
                    (c.effective_to_field, "DATETIME NOT NULL DEFAULT '9999-12-31 23:59:59'"),
                    (c.current_flag_field, "INT NOT NULL DEFAULT 1"),
                ]:
                    try:
                        await self.session.execute(
                            sa_text(f"ALTER TABLE `{c.target_table}` ADD COLUMN `{col_def[0]}` {col_def[1]}")
                        )
                    except Exception:
                        pass  # column may already exist

            # 2. 获取 source 当前全量数据
            src_rows = (await self.session.execute(
                sa_text(f"SELECT * FROM `{c.source_table}`")
            )).fetchall()
            src_cols = list((await self.session.execute(
                sa_text(f"SELECT * FROM `{c.source_table}` LIMIT 0")
            )).keys())

            # 3. 获取 target 当前有效记录（current_flag=1）
            tgt_rows = (await self.session.execute(
                sa_text(f"SELECT * FROM `{c.target_table}` WHERE `{c.current_flag_field}` = 1")
            )).fetchall()
            tgt_cols = list((await self.session.execute(
                sa_text(f"SELECT * FROM `{c.target_table}` LIMIT 0")
            )).keys())

            # 4. 构建 target 业务键索引
            bk_fields = [k.strip() for k in c.business_key.split(",")]
            def bk_val(row, cols):
                return tuple(row[cols.index(f)] for f in bk_fields)

            tgt_bk_map = {}
            for row in tgt_rows:
                key = bk_val(row, tgt_cols)
                tgt_bk_map[key] = row

            # 5. 定义 compare 函数
            compare_fields = c.compare_fields or []
            if not compare_fields:
                # 默认：对比 source 中所有字段（排除拉链表特有字段）
                compare_fields = [col for col in src_cols if col not in (
                    c.effective_from_field, c.effective_to_field, c.current_flag_field
                )]

            def has_changed(src_row, tgt_row):
                for f in compare_fields:
                    if f in src_cols and f in tgt_cols:
                        sv = src_row[src_cols.index(f)]
                        tv = tgt_row[tgt_cols.index(f)]
                        if str(sv) != str(tv):
                            return True
                return False

            # 6. 三场景处理
            new_count = 0
            updated_count = 0
            closed_count = 0
            now = dt.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            far_future = "9999-12-31 23:59:59"

            for src_row in src_rows:
                key = bk_val(src_row, src_cols)
                if key in tgt_bk_map:
                    tgt_row = tgt_bk_map[key]
                    if has_changed(src_row, tgt_row):
                        # 变更：关闭旧记录
                        await self.session.execute(
                            sa_text(
                                f"UPDATE `{c.target_table}` SET `{c.effective_to_field}` = :et, `{c.current_flag_field}` = 0 "
                                f"WHERE `{c.current_flag_field}` = 1 "
                                + " AND ".join([f"`{f}` = :bk_{f}" for f in bk_fields])
                            ).bindparams(**{"et": now, **{f"bk_{f}": src_row[src_cols.index(f)] for f in bk_fields}})
                        )
                        closed_count += 1
                        # 插入新版本
                        await self._do_insert(c, src_row, src_cols, now, far_future)
                        updated_count += 1
                    # 未变更：跳过
                else:
                    # 新增
                    await self._do_insert(c, src_row, src_cols, now, far_future)
                    new_count += 1

            # 7. 更新 run 记录
            run.status = "success"
            run.new_count = new_count
            run.updated_count = updated_count
            run.closed_count = closed_count
            c.last_run_at = now
            c.last_status = "success"
            run.finished_at = dt.utcnow()
            await self.session.commit()

            return {
                "run_id": run.id, "status": "success",
                "new_count": new_count, "updated_count": updated_count,
                "closed_count": closed_count,
            }
        except Exception as e:
            await self.session.rollback()
            run.status = "failed"
            run.error_message = str(e)[:2000]
            run.finished_at = dt.utcnow()
            c.last_run_at = dt.utcnow()
            c.last_status = "failed"
            await self.session.commit()
            return {"run_id": run.id, "status": "failed", "error": str(e)[:500]}

    def _insert_new_row(self, c, src_row, src_cols, now, far_future):
        """构建 INSERT 语句并异步执行 — 由 execute_scd 内部 await"""
        pass  # 实际 INSERT 在 execute_scd 中内联，此方法为接口占位

    async def _do_insert(self, c, src_row, src_cols, now, far_future):
        """插入新版本拉链记录"""
        from sqlalchemy import text as sa_text
        col_names = [f"`{col}`" for col in src_cols]
        col_names.append(f"`{c.effective_from_field}`")
        col_names.append(f"`{c.effective_to_field}`")
        col_names.append(f"`{c.current_flag_field}`")
        placeholders = [f":v_{i}" for i in range(len(src_cols))]
        placeholders += [":ef", ":et", ":cf"]
        sql = f"INSERT INTO `{c.target_table}` ({', '.join(col_names)}) VALUES ({', '.join(placeholders)})"
        params = {f"v_{i}": src_row[i] for i in range(len(src_cols))}
        params["ef"] = now
        params["et"] = far_future
        params["cf"] = 1
        await self.session.execute(sa_text(sql).bindparams(**params))

    async def list_runs(self, config_id=None, page=1, page_size=20):
        from app.warehouse.models import ScdRun
        page_size = min(max(page_size, 1), 200)
        base = select(ScdRun)
        if config_id: base = base.where(ScdRun.config_id == config_id)
        base = base.order_by(ScdRun.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [{
            "id": r.id, "config_id": r.config_id,
            "status": r.status,
            "new_count": r.new_count, "updated_count": r.updated_count,
            "closed_count": r.closed_count,
            "error_message": r.error_message,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
        } for r in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    # ── 候选字段检测 API（UI 辅助）───────────────

    async def detect_candidates(self, table_name: str) -> dict:
        """检测表结构，推荐业务键和时间字段候选"""
        from sqlalchemy import text as sa_text

        if not table_name.replace("_", "").isalnum():
            return {"error": "invalid_table_name"}

        try:
            cols = (await self.session.execute(
                sa_text(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = :t ORDER BY ordinal_position")
                .bindparams(t=table_name)
            )).fetchall()
        except Exception:
            return {"error": "table_not_found", "table_name": table_name}

        columns = [{"name": c[0], "type": c[1]} for c in cols]

        # 候选业务键：含 id/key/code 且非时间字段
        bk_candidates = [
            c["name"] for c in columns
            if ("id" in c["name"].lower() or "key" in c["name"].lower() or "code" in c["name"].lower())
            and c["name"] not in ("effective_from", "effective_to", "current_flag")
        ]

        # 候选时间字段：date/time 类型
        time_candidates = [
            c["name"] for c in columns
            if "date" in c["type"].lower() or "time" in c["type"].lower() or "timestamp" in c["type"].lower()
        ]

        # 候选对比字段：非时间、非主键的普通字段
        compare_candidates = [
            c["name"] for c in columns
            if c["name"] not in bk_candidates and c["name"] not in time_candidates
            and c["name"] not in ("created_at", "updated_at")
        ]

        return {
            "table_name": table_name,
            "columns": columns,
            "business_key_candidates": bk_candidates,
            "time_candidates": time_candidates,
            "compare_candidates": compare_candidates,
            "risk_warnings": [
                "拉链表需要业务键唯一标识实体（如 employee_id），请确认选中的字段能唯一确定一条记录",
                "source 表需有变更时间字段（如 updated_at），用于判断 effective_from",
                "拉链表 target 不可与 source 为同一张表",
            ],
        }


def get_scd_service(session: AsyncSession) -> ScdService:
    return ScdService(session)


# ==================== ADS Service (R0702 + R0704) ====================

class AdsService:
    """ADS 消费资产组装与发布服务"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ── CRUD ──────────────────────────────────────

    async def list_definitions(self, page=1, page_size=20, status=None):
        from app.warehouse.models import AdsDefinition
        page_size = min(max(page_size, 1), 200)
        base = select(AdsDefinition)
        if status: base = base.where(AdsDefinition.publish_status == status)
        base = base.order_by(AdsDefinition.id.desc())
        total = (await self.session.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (await self.session.execute(base.offset((page - 1) * page_size).limit(page_size))).scalars().all()
        items = [self._def_out(d) for d in rows]
        return {"total": total, "page": page, "page_size": page_size, "items": items}

    async def get_definition(self, def_id: int):
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        return self._def_out(d) if d else None

    async def create_definition(self, payload: dict):
        from app.warehouse.models import AdsDefinition
        d = AdsDefinition(
            name=payload["name"],
            description=payload.get("description"),
            source_type=payload.get("source_type", "dws_aggregate"),
            source_id=payload["source_id"],
            source_label=payload.get("source_label"),
            dimension_refs=payload.get("dimension_refs", []),
            output_fields=payload.get("output_fields", []),
            preset_filters=payload.get("preset_filters"),
            subject_area=payload.get("subject_area"),
            consume_domain=payload.get("consume_domain"),
            owner_name=payload.get("owner_name"),
        )
        self.session.add(d); await self.session.commit(); await self.session.refresh(d)
        return self._def_out(d)

    async def update_definition(self, def_id: int, payload: dict):
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return None
        for k in ("name", "description", "source_type", "source_id", "source_label",
                  "dimension_refs", "output_fields", "preset_filters",
                  "subject_area", "consume_domain", "owner_name"):
            if k in payload: setattr(d, k, payload[k])
        await self.session.commit(); await self.session.refresh(d)
        return self._def_out(d)

    async def delete_definition(self, def_id: int) -> bool:
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return False
        await self.session.delete(d); await self.session.commit()
        return True

    def _def_out(self, d):
        return {
            "id": d.id, "name": d.name, "description": d.description,
            "source_type": d.source_type, "source_id": d.source_id,
            "source_label": d.source_label,
            "dimension_refs": d.dimension_refs or [],
            "output_fields": d.output_fields or [],
            "preset_filters": d.preset_filters,
            "subject_area": d.subject_area,
            "consume_domain": d.consume_domain,
            "owner_name": d.owner_name,
            "publish_status": d.publish_status,
            "publish_targets": d.publish_targets or [],
            "permissions_inherited_from": d.permissions_inherited_from,
            "lineage_snapshot": d.lineage_snapshot,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        }

    # ── 预览 (R0702) ──────────────────────────────

    async def preview(self, def_id: int) -> dict:
        """预览 ADS 组装结果，返回字段摘要和来源信息"""
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return {"error": "not_found"}

        fields = d.output_fields or []
        dims = d.dimension_refs or []
        filters = d.preset_filters or []

        return {
            "definition_id": d.id,
            "name": d.name,
            "source": {"type": d.source_type, "id": d.source_id, "label": d.source_label},
            "output_fields": fields,
            "dimensions": dims,
            "preset_filters": filters,
            "field_count": len(fields),
            "dimension_count": len(dims),
            "sensitive_fields": [f for f in fields if f.get("is_sensitive")],
            "warnings": self._build_warnings(fields, dims),
        }

    def _build_warnings(self, fields, dims):
        warnings = []
        if not fields:
            warnings.append("未配置输出字段，ADS 不产生数据")
        if not dims:
            warnings.append("未关联维度，消费端无法按维度筛选")
        sensitive = [f.get("output_name", "") for f in fields if f.get("is_sensitive")]
        if sensitive:
            warnings.append(f"以下字段含敏感标记: {', '.join(sensitive)}，发布为 API/推送时需脱敏")
        # 检查字段名冲突
        names = [f.get("output_name", "") for f in fields]
        dupes = [n for n in set(names) if names.count(n) > 1]
        if dupes:
            warnings.append(f"输出字段名重复: {', '.join(dupes)}")
        return warnings

    # ── 校验 (R0702) ──────────────────────────────

    async def validate(self, payload: dict) -> dict:
        """保存前校验 ADS 组装配置"""
        errors = []
        if not payload.get("name", "").strip():
            errors.append("名称为必填项")
        if not payload.get("source_id"):
            errors.append("来源 ID 为必填项")
        output_fields = payload.get("output_fields", [])
        if not output_fields:
            errors.append("至少需配置一个输出字段")
        # 校验 output_fields 每个 item
        for i, f in enumerate(output_fields):
            if not f.get("output_name"):
                errors.append(f"输出字段 #{i+1} 缺少 output_name")
            if not f.get("source_field"):
                errors.append(f"输出字段 #{i+1} 缺少 source_field")
        # 校验 dimension_refs
        for i, dim in enumerate(payload.get("dimension_refs", [])):
            if not dim.get("code"):
                errors.append(f"维度 #{i+1} 缺少 code")
        # 校验 filters
        for i, flt in enumerate(payload.get("preset_filters") or []):
            if not flt.get("field"):
                errors.append(f"过滤条件 #{i+1} 缺少 field")
        return {"valid": len(errors) == 0, "errors": errors}

    # ── 发布 (R0704) ──────────────────────────────

    async def publish(self, def_id: int, targets: list[str]) -> dict:
        """发布 ADS 为消费资产

        targets: ['asset', 'view', 'api', 'push'] 至少一个
        """
        from app.warehouse.models import AdsDefinition
        from datetime import datetime as dt

        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return {"error": "not_found", "detail": "ADS 定义不存在"}

        if not targets:
            return {"error": "validation", "detail": "至少需选择一个发布目标"}

        valid_targets = {"asset", "view", "api", "push"}
        invalid = set(targets) - valid_targets
        if invalid:
            return {"error": "validation", "detail": f"无效的发布目标: {invalid}"}

        # 敏感字段检查
        sensitive = [f.get("output_name", "") for f in (d.output_fields or []) if f.get("is_sensitive")]
        if sensitive and ("api" in targets or "push" in targets):
            return {
                "error": "sensitive_fields",
                "detail": f"以下字段含敏感标记，不可发布为 API/推送: {', '.join(sensitive)}。请先脱敏或移除对应发布目标。",
                "sensitive_fields": sensitive,
            }

        # 构建血缘快照
        lineage = {
            "source": {"type": d.source_type, "id": d.source_id, "label": d.source_label},
            "dimensions": [dim.get("code") for dim in (d.dimension_refs or [])],
            "published_at": dt.utcnow().isoformat(),
        }

        d.publish_status = "published"
        d.publish_targets = targets
        d.lineage_snapshot = lineage
        await self.session.commit(); await self.session.refresh(d)

        result = self._def_out(d)
        result["publish_result"] = {
            "status": "published",
            "targets": targets,
            "asset_registered": "asset" in targets,
            "view_created": "view" in targets,
            "api_candidate": "api" in targets,
            "push_candidate": "push" in targets,
            "lineage_recorded": True,
        }
        return result

    async def unpublish(self, def_id: int) -> dict:
        """撤回 ADS 发布"""
        from app.warehouse.models import AdsDefinition
        d = await self.session.get(AdsDefinition, def_id)
        if d is None: return {"error": "not_found"}
        if d.publish_status != "published":
            return {"error": "not_published", "detail": "当前状态不是已发布"}
        d.publish_status = "draft"
        d.publish_targets = None
        await self.session.commit()
        return {"status": "draft", "id": d.id, "name": d.name}

    # ── 来源列表（UI 辅助）────────────────────────

    async def list_sources(self) -> dict:
        """列出可用的 DWS 来源列表（聚合定义 + 数据集）"""
        from app.warehouse.models import DwsAggregateDefinition
        from app.datasets.models import DataSet

        # DWS 聚合定义
        dws_rows = (await self.session.execute(
            select(DwsAggregateDefinition).where(DwsAggregateDefinition.status == "published")
        )).scalars().all()
        dws_sources = [{"type": "dws_aggregate", "id": r.id, "label": f"聚合: {r.name}", "fields": []} for r in dws_rows]

        # 已发布数据集
        ds_rows = (await self.session.execute(
            select(DataSet).where(DataSet.status == "published")
        )).scalars().all()
        ds_sources = [{"type": "dataset", "id": r.id, "label": f"数据集: {r.name}", "fields": []} for r in ds_rows]

        return {"sources": dws_sources + ds_sources}

    async def list_dimensions(self) -> list:
        """列出可用维度供 ADS 组装参考"""
        from app.warehouse.models import Dimension as DimModel
        rows = (await self.session.execute(select(DimModel).order_by(DimModel.display_order))).scalars().all()
        return [{"id": r.id, "code": r.dimension_code, "name": r.dimension_name, "bound_table": r.bound_table, "bound_field": r.bound_field} for r in rows]


def get_ads_service(session: AsyncSession) -> AdsService:
    return AdsService(session)
