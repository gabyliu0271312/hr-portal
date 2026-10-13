from __future__ import annotations

from copy import deepcopy
from html import escape, unescape
from html.parser import HTMLParser
from urllib.parse import urlparse

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
    raw = item.get("options") if item else None
    if not raw:
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
                if not content.get("options"):
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
                        if level and level.get("code") and "code" not in option:
                            option["code"] = level["code"]
                content["ratingDisplayMode"] = question.display_mode or "标签样式"
                if not content.get("description"):
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
            field_type = "rich_text"
            if content_type == "rating":
                field_type = "rating"
            elif content_type == "custom" and content.get("questionType") == "tag":
                field_type = "tag_with_followup"
            options = _inline_options(content, item) if field_type in {"rating", "tag_with_followup"} else []
            base_field_id = str(item.get("id") or f"{section_id}-{item_index}")
            field_id = base_field_id
            suffix = 1
            while field_id in seen_field_ids:
                field_id = f"{base_field_id}-{suffix}"
                suffix += 1
            seen_field_ids.add(field_id)
            fields.append({
                "id": field_id,
                "type": field_type,
                "label": item.get("label") or content.get("name") or "填写题",
                "required": bool(item_settings.get("required", (content.get("settings") or {}).get("required", False))),
                "placeholder": item.get("hint") or "提示",
                "options": options,
                **({"display_mode": content.get("ratingDisplayMode") or "标签样式"} if field_type == "rating" else {}),
            })
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


def _sanitize_field_value(field: dict, value: object) -> object:
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
    if resolved.get("content"):
        return resolved
    bindings = resolved.get("content_bindings") or {}
    library = {str(content.get("content_id") or content.get("id")): content for content in content_library}
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
