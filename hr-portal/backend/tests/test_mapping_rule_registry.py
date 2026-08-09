from app.mapping.dto import ALL_RULE_TYPES
from app.mapping.executor import MappingExecutor
from app.mapping.rule_registry import get_registry


def test_builtin_rule_plugins_are_registered_in_contract_order():
    registry = get_registry()

    assert registry.all_types() == list(ALL_RULE_TYPES)
    assert set(registry.all_labels()) == set(ALL_RULE_TYPES)
    assert all(registry.get(rule_type) is not None for rule_type in ALL_RULE_TYPES)


def test_executor_uses_registry_dispatch_not_rule_specific_methods():
    executor = MappingExecutor()

    assert not hasattr(executor, "_apply_field")
    assert not hasattr(executor, "_apply_value_map")
    assert not hasattr(executor, "_apply_reference_lookup")
