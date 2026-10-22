from __future__ import annotations

from copy import deepcopy
from html import escape, unescape
from html.parser import HTMLParser
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.performance.models import PerformanceReviewQuestion, PerformanceReviewRule


def _option(value: dict, index: int) -> dict:
    label = str(value.get("label") or value.get("name") or value.get("code") or "")
    return {
        "id": str(value.get("id") or value.get("value") or index),
        "label": label,
        **({"code": value["code"]} if "code" in value else {}),
        "color": value.get("color"),
        "placeholder": value.get("placeholder") or value.get("content") or value.get("prompt") or "",
        "required": bool(value.get("required", False)),
    }


def _inline_options(content: dict, item: dict | None = None) -> list[dict]:
    if item is not None and "options" in item:
        raw = item.get("options")
    else:
        raw = content.get("options") or content.get("defaultFields") or content.get("default_fields")
    options: list[dict] = []
    seen_ids: set[str] = set()
    for index, value in enumerate(raw or []):
        if not isinstance(value, dict):
            continue
        option = _option(value, index)
        base_id = option["id"]
        option_id = base_id
        suffix = 1
        while option_id in seen_ids:
            option_id = f"{base_id}-{suffix}"
            suffix += 1
        option["id"] = option_id
        seen_ids.add(option_id)
        options.append(option)
    return options


def _rating_reference(content: dict) -> str:
    items = content.get("items") or []
    return str(content.get("ratingOptionId") or (items[-1].get("id") if items else ""))


def _normalize_rating_item(content: dict) -> None:
    if content.get("type") != "rating":
        return
    items = content.get("items") or []
    reference = _rating_reference(content)
    selected = next((item for item in items if str(item.get("id")) == reference), None)
    if selected is None and items:
        selected = items[-1]
        reference = str(selected.get("id") or "")
    content["items"] = [selected] if selected else []
    if reference:
        content["ratingOptionId"] = reference


async def hydrate_self_summary_template(template: dict, db: AsyncSession) -> dict:
    hydrated = deepcopy(template)
    contents = hydrated.get("content") or []
    for content in contents:
        _normalize_rating_item(content)
    rating_references = {
        id(content): _rating_reference(content)
        for content in contents
        if content.get("type") == "rating" and (
            not content.get("options") or content.get("ratingDisplayMode") not in {"标签样式", "下拉样式"}
            or _rating_reference(content).isdigit()
        )
    }
    question_ids = {int(value) for value in rating_references.values() if value.isdigit()}
    questions: dict[int, tuple[PerformanceReviewQuestion, PerformanceReviewRule]] = {}
    if question_ids:
        rows = (
            await db.execute(
                select(PerformanceReviewQuestion, PerformanceReviewRule)
                .join(PerformanceReviewRule, PerformanceReviewRule.id == PerformanceReviewQuestion.rule_id)
                .where(PerformanceReviewQuestion.id.in_(question_ids))
            )
        ).all()
        questions = {question.id: (question, rule) for question, rule in rows}

    for content in contents:
        if content.get("type") == "rating":
            raw_id = rating_references.get(id(content), "")
            pair = questions.get(int(raw_id)) if raw_id.isdigit() else None
            if pair:
                question, rule = pair
                if content.get("options") is None:
                    content["options"] = [
                        _option(level, index)
                        for index, level in enumerate((rule.config or {}).get("levels") or [])
                        if isinstance(level, dict)
                    ]
                else:
                    levels_by_id = {
                        str(level.get("id")): level
                        for level in ((rule.config or {}).get("levels") or [])
                        if isinstance(level, dict) and level.get("id") is not None
                    }
                    for option in content["options"]:
                        level = levels_by_id.get(str(option.get("id")))
                        if not level:
                            continue
                        defaults = _option(level, 0)
                        for key, value in defaults.items():
                            if key not in option:
                                option[key] = value
                if "ratingDisplayMode" not in content or not content["ratingDisplayMode"]:
                    content["ratingDisplayMode"] = question.display_mode or "标签样式"
                if content.get("description") is None:
                    content["description"] = question.description or ""
        elif content.get("type") == "custom" and content.get("questionType") == "tag" and not content.get("options"):
            content["options"] = _inline_options(content)
    return hydrated


def build_self_summary_schema(template: dict) -> list[dict]:
    sections: list[dict] = []
    for content_index, content in enumerate(template.get("content") or []):
        if (content.get("content_slot") or "fill") != "fill":
            continue
        content = deepcopy(content)
        _normalize_rating_item(content)
        section_id = str(content.get("content_id") or content.get("id") or content_index)
        fields: list[dict] = []
        seen_field_ids: set[str] = set()
        for item_index, item in enumerate(content.get("items") or []):
            item_settings = item.get("settings") or {}
            if item_settings.get("mode") == "hidden":
                continue
            content_type = content.get("type")
            question_type = (
                item.get("questionType")
                or content.get("questionType")
                or "text"
            ) if content_type == "custom" else None
            field_type = "rating" if content_type == "rating" else (
                "tag_with_followup" if content_type == "custom" and question_type == "tag" else "rich_text"
            )
            options = _inline_options(content, item) if field_type in {"rating", "tag_with_followup"} else []
            base_field_id = str(item.get("id") or f"{section_id}-{item_index}")
            field_id = base_field_id
            suffix = 1
            while field_id in seen_field_ids:
                field_id = f"{base_field_id}-{suffix}"
                suffix += 1
            seen_field_ids.add(field_id)
            field = {
                "id": field_id,
                "type": field_type,
                "label": item.get("label") or content.get("name") or "填写题",
                "required": bool(item_settings.get("required", (content.get("settings") or {}).get("required", False))),
                "placeholder": item.get("hint") or "提示",
                "options": options,
            }
            if field_type == "rating":
                field["display_mode"] = content.get("ratingDisplayMode") or "标签样式"
                field["hide_name"] = bool(item_settings.get("hideName", False))
                field["allow_unknown"] = (content.get("settings") or {}).get("allowUnknown") is True
            elif content_type == "custom" and question_type == "text":
                field["hide_name"] = bool(item_settings.get("hideName", False))
            elif content_type == "custom" and question_type == "tag":
                field["hide_name"] = bool(item_settings.get("hideName", False))
                field["description"] = item.get("hint") or ""
                field["hide_description"] = bool(item_settings.get("hideDescription", False))
                field["default_all"] = bool(item.get("defaultAll", content.get("defaultAll", False)))
            fields.append(field)
        if fields:
            settings = content.get("settings") or {}
            sections.append({
                "id": section_id,
                "name": content.get("name") or "填写内容",
                "description": "" if settings.get("hideDescription") else content.get("description") or "",
                "allow_multiple": bool(settings.get("allowMultiple", False)),
                "fields": fields,
            })
    return sections


def _content_identity(content: dict) -> str:
    return str(content.get("content_id") or content.get("id") or "")


def _task_attribute(task: object, name: str, default: object = None) -> object:
    if isinstance(task, dict):
        return task.get(name, default)
    return getattr(task, name, default)


def _view_override_item(content: dict, field_id: str) -> dict | None:
    return next(
        (item for item in content.get("items") or [] if str(item.get("id") or "") == field_id),
        None,
    )


def _view_bool_setting(view_item: dict | None, source_item: dict | None, key: str, default: bool = False) -> bool:
    for item in (view_item, source_item):
        settings = item.get("settings") if isinstance(item, dict) else None
        if isinstance(settings, dict) and key in settings:
            return bool(settings[key])
    return default


def _project_result_view_schema(final_template: dict, view_contents: list[dict]) -> list[dict]:
    source_contents = [
        content for content in final_template.get("content") or []
        if isinstance(content, dict) and (content.get("content_slot") or "fill") == "fill"
        and _content_identity(content) in {_content_identity(item) for item in view_contents}
    ]
    source_by_id = {_content_identity(content): content for content in source_contents}
    view_by_id = {_content_identity(content): content for content in view_contents}
    source_schema = build_self_summary_schema({"content": source_contents})
    projected: list[dict] = []
    for section in source_schema:
        content_id = str(section.get("id") or "")
        source = source_by_id.get(content_id)
        view = view_by_id.get(content_id)
        if source is None:
            continue
        source_settings = source.get("settings") or {}
        view_settings = (view or {}).get("settings") or {}
        hide_name = bool(view_settings.get("hideName", source_settings.get("hideName", False)))
        hide_description = bool(view_settings.get("hideDescription", source_settings.get("hideDescription", False)))
        section["hide_name"] = hide_name
        section["hide_description"] = hide_description
        if hide_name:
            section["name"] = ""
        if hide_description:
            section["description"] = ""
        source_items = {
            str(item.get("id") or ""): item
            for item in source.get("items") or []
            if isinstance(item, dict)
        }
        fields = []
        for field in section.get("fields") or []:
            if field.get("type") != "tag_with_followup":
                continue
            source_item = source_items.get(field["id"])
            view_item = _view_override_item(view or {}, field["id"]) if view else None
            if not _view_bool_setting(view_item, source_item, "allowView", True):
                continue
            field = deepcopy(field)
            field_hide_name = _view_bool_setting(view_item, source_item, "hideName", field.get("hide_name", False))
            field_hide_description = _view_bool_setting(view_item, source_item, "hideDescription", field.get("hide_description", False))
            field["hide_name"] = field_hide_name
            if field.get("type") == "tag_with_followup":
                field["hide_description"] = field_hide_description
            if field_hide_name:
                field["label"] = ""
            if field_hide_description:
                field["placeholder"] = ""
                if "description" in field:
                    field["description"] = ""
            fields.append(field)
        section["fields"] = fields
        if fields:
            projected.append(section)
    return projected


def _project_result_view_answer(field: dict, value: object) -> object:
    if field.get("type") == "rich_text":
        if isinstance(value, list):
            return [sanitize_rich_text(item) for item in value]
        return sanitize_rich_text(value) if value is not None else value
    option_ids = {str(option.get("id")) for option in field.get("options") or []}
    if field.get("type") == "rating":
        candidate = value
        if isinstance(candidate, dict):
            candidate = candidate.get("id") or candidate.get("value") or candidate.get("option_id")
        if candidate is None or str(candidate) not in option_ids:
            return None
        return str(candidate)
    if field.get("type") == "tag_with_followup":
        if not isinstance(value, dict):
            if isinstance(value, list):
                return {"tags": [str(item) for item in value if str(item) in option_ids]}
            return None
        tags = [str(item) for item in value.get("tags") or [] if str(item) in option_ids]
        projected = {"tags": tags}
        if isinstance(value.get("notes"), dict):
            projected["notes"] = {
                option_id: sanitize_rich_text(value["notes"].get(option_id))
                for option_id in tags
                if value["notes"].get(option_id) is not None
            }
        elif "note" in value:
            projected["note"] = sanitize_rich_text(value.get("note"))
        return projected
    return None


def project_result_view_contents(
    view_template: dict,
    final_template: dict,
    completed_tasks: list[object],
    *,
    employee_no: str | None = None,
) -> list[dict]:
    """Project published result content from immutable final-node snapshot data."""
    source_ids = {
        _content_identity(content)
        for content in final_template.get("content") or []
        if isinstance(content, dict) and (content.get("content_slot") or "fill") == "fill"
    }
    view_contents: list[dict] = []
    seen_ids: set[str] = set()
    for content in view_template.get("content") or []:
        if not isinstance(content, dict) or content.get("content_slot") != "view":
            continue
        content_id = _content_identity(content)
        if content_id in source_ids and content_id not in seen_ids:
            view_contents.append(deepcopy(content))
            seen_ids.add(content_id)
    for content_id in (view_template.get("content_bindings") or {}).get("view") or []:
        content_id = str(content_id)
        if content_id not in source_ids or content_id in seen_ids:
            continue
        source = next(
            content for content in final_template.get("content") or []
            if isinstance(content, dict) and _content_identity(content) == content_id
            and (content.get("content_slot") or "fill") == "fill"
        )
        view_contents.append(deepcopy(source))
        seen_ids.add(content_id)
    schema = _project_result_view_schema(final_template, view_contents)
    if not schema:
        return []
    field_ids = {field["id"]: field for section in schema for field in section.get("fields") or []}
    contents = []
    for task in completed_tasks:
        if employee_no is not None and str(_task_attribute(task, "target_employee_no")) != str(employee_no):
            continue
        if _task_attribute(task, "status") != "completed" or _task_attribute(task, "submitted_at") is None:
            continue
        raw_answers = _task_attribute(task, "answers") or {}
        answers = {
            field_id: projected
            for field_id, field in field_ids.items()
            for projected in [_project_result_view_answer(field, raw_answers.get(field_id))]
            if projected is not None
        }
        contents.append({"task_id": _task_attribute(task, "id"), "form_schema": deepcopy(schema), "answers": answers})
    return contents


def iter_self_summary_fields(schema: list[dict]):
    for section in schema:
        yield from section.get("fields") or []


class _RichTextSanitizer(HTMLParser):
    allowed = {"b", "strong", "i", "em", "u", "ol", "ul", "li", "a", "p", "div", "br", "span"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.suppressed = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        if tag in {"script", "style", "iframe", "object", "embed"}:
            self.suppressed += 1
            return
        if self.suppressed or tag not in self.allowed:
            return
        rendered_attrs = ""
        if tag == "a":
            href = next((value or "" for name, value in attrs if name == "href"), "")
            if urlparse(href).scheme.lower() in {"http", "https", "mailto"}:
                rendered_attrs = f' href="{escape(href, quote=True)}" rel="noopener noreferrer"'
        self.parts.append(f"<{tag}{rendered_attrs}>")

    def handle_endtag(self, tag: str):
        if tag in {"script", "style", "iframe", "object", "embed"} and self.suppressed:
            self.suppressed -= 1
            return
        if not self.suppressed and tag in self.allowed and tag != "br":
            self.parts.append(f"</{tag}>")

    def handle_data(self, data: str):
        if not self.suppressed:
            self.parts.append(escape(data))


def sanitize_rich_text(value: object) -> str:
    sanitizer = _RichTextSanitizer()
    sanitizer.feed(str(value or ""))
    sanitizer.close()
    return "".join(sanitizer.parts)


def _repeatable_values(section: dict, field: dict, value: object) -> list[object]:
    if not section.get("allow_multiple"):
        return [value]
    if field.get("type") == "tag_with_followup" and isinstance(value, list) and all(isinstance(item, str) for item in value):
        return [value]
    return value if isinstance(value, list) else [value]


def self_summary_instance_count(section: dict, answers: dict) -> int:
    if not section.get("allow_multiple"):
        return 1
    return max((len(_repeatable_values(section, field, answers.get(field["id"]))) for field in section.get("fields") or []), default=1)


def self_summary_field_value(section: dict, field: dict, answers: dict, index: int) -> object:
    values = _repeatable_values(section, field, answers.get(field["id"]))
    return values[index] if index < len(values) else None


def iter_self_summary_field_instances(schema: list[dict], answers: dict):
    for section in schema:
        for index in range(self_summary_instance_count(section, answers)):
            for field in section.get("fields") or []:
                yield section, field, index, self_summary_field_value(section, field, answers, index)


def self_summary_instance_unknown(section: dict, answers: dict, index: int) -> bool:
    return any(
        field.get("type") == "rating" and field.get("allow_unknown") is True
        and self_summary_field_value(section, field, answers, index) == "__unknown__"
        for field in section.get("fields") or []
    )


def _sanitize_field_value(field: dict, value: object) -> object:
    if field.get("type") == "rating" and value == "__unknown__" and field.get("allow_unknown") is not True:
        raise HTTPException(status_code=400, detail={"code": "VALIDATION_FAILED", "field_id": field["id"]})
    if field.get("type") == "rich_text" and value is not None:
        return sanitize_rich_text(value)
    if field.get("type") == "tag_with_followup" and isinstance(value, dict):
        if "notes" in value:
            notes = value.get("notes") if isinstance(value.get("notes"), dict) else {}
            return {**value, "notes": {str(option_id): sanitize_rich_text(note) for option_id, note in notes.items()}}
        return {**value, "note": sanitize_rich_text(value.get("note"))}
    return value


def sanitize_self_summary_answers(schema: list[dict], answers: dict) -> dict:
    sanitized = deepcopy(answers)
    for section in schema:
        for field in section.get("fields") or []:
            field_id = field["id"]
            value = sanitized.get(field_id)
            values = _repeatable_values(section, field, value)
            if section.get("allow_multiple") and (not (field.get("type") == "tag_with_followup" and isinstance(value, list) and all(isinstance(item, str) for item in value))):
                sanitized[field_id] = [_sanitize_field_value(field, item) for item in values]
            else:
                sanitized[field_id] = _sanitize_field_value(field, value)
    return sanitized


def self_summary_value_empty(field: dict, value: object) -> bool:
    if field.get("type") == "tag_with_followup":
        if not isinstance(value, dict) or not value.get("tags"):
            return True
        notes = value.get("notes")
        if isinstance(notes, dict):
            return any(
                option.get("required", False) and self_summary_value_empty({"type": "rich_text"}, notes.get(option.get("id")))
                for option in field.get("options") or []
                if option.get("id") in value["tags"]
            )
        return any(
            option.get("required", False) and self_summary_value_empty({"type": "rich_text"}, value.get("note"))
            for option in field.get("options") or []
            if option.get("id") in value["tags"]
        )
    if not isinstance(value, str):
        return not value
    import re
    text = re.sub(r"<[^>]+>", "", value)
    return not unescape(text).replace("​", "").strip()


def self_summary_field_requires_value(field: dict, value: object) -> bool:
    return bool(field.get("required")) or (
        field.get("type") == "tag_with_followup"
        and isinstance(value, dict)
        and any(option.get("required", False) and option.get("id") in value.get("tags", []) for option in field.get("options") or [])
    )


def resolve_self_summary_content(template: dict, content_library: list[dict]) -> dict:
    resolved = deepcopy(template)
    bindings = resolved.get("content_bindings") or {}
    library = {str(content.get("content_id") or content.get("id")): content for content in content_library}
    inline_contents = resolved.get("content") or []
    if inline_contents:
        # Inline node content is the local authority. Bindings only seed missing content.
        inline_ids = {
            str(content.get("content_id") or content.get("id"))
            for content in inline_contents
            if isinstance(content, dict) and (content.get("content_id") or content.get("id")) is not None
        }
        contents = deepcopy(inline_contents)
        appended_ids: set[str] = set()
        ordered_slots = [slot for slot in ("fill", "reference", "adjustment", "view") if slot in bindings]
        ordered_slots.extend(slot for slot in bindings if slot not in ordered_slots)
        for slot in ordered_slots:
            for content_id in bindings.get(slot) or []:
                key = str(content_id)
                if key in inline_ids or key in appended_ids:
                    continue
                content = library.get(key)
                if content:
                    contents.append({**deepcopy(content), "content_slot": slot})
                    appended_ids.add(key)
        resolved["content"] = contents
        return resolved
    contents: list[dict] = []
    ordered_slots = [slot for slot in ("fill", "reference", "adjustment", "view") if slot in bindings]
    ordered_slots.extend(slot for slot in bindings if slot not in ordered_slots)
    for slot in ordered_slots:
        for content_id in bindings.get(slot) or []:
            content = library.get(str(content_id))
            if content:
                contents.append({**deepcopy(content), "content_slot": slot})
    resolved["content"] = contents
    return resolved
