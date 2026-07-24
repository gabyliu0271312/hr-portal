from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.ucp.routers import pipeline_templates


@pytest.mark.asyncio
async def test_duplicate_template_create_returns_conflict(monkeypatch):
    async def existing_template(*_args, **_kwargs):
        return object()

    monkeypatch.setattr(pipeline_templates, "get_template", existing_template)
    payload = pipeline_templates.TemplateCreatePayload(
        template_code="PENDING_HIRE_OFFER_ENRICHMENT",
        name="Pending hire offer enrichment",
        nodes=[],
        edges=[],
    )

    with pytest.raises(HTTPException) as error:
        await pipeline_templates.route_create_template(
            payload,
            db=object(),
            user=SimpleNamespace(id=1),
        )

    assert error.value.status_code == 409
