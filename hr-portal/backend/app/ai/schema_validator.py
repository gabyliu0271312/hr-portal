from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ValidationError


class AiSchemaValidationError(ValueError):
    pass


def schema_from_model(model: type[BaseModel]) -> dict[str, Any]:
    return model.model_json_schema()


def validate_model_payload(
    model: type[BaseModel],
    payload: Any,
    *,
    label: str,
) -> BaseModel:
    try:
        if isinstance(payload, BaseModel):
            data = payload.model_dump()
        elif isinstance(payload, dict):
            data = payload
        else:
            data = dict(payload)
        return model.model_validate(data)
    except (TypeError, ValidationError) as exc:
        raise AiSchemaValidationError(f"{label} schema 校验失败: {exc}") from exc
