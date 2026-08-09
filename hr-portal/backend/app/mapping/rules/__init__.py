"""Built-in Mapping rule plugin registration."""

from app.mapping.rule_registry import get_registry
from app.mapping.rules.plugins import BUILTIN_PLUGINS


def register_builtin_plugins() -> None:
    registry = get_registry()
    for plugin in BUILTIN_PLUGINS:
        registry.register(plugin)


register_builtin_plugins()

__all__ = ["register_builtin_plugins", "BUILTIN_PLUGINS"]
