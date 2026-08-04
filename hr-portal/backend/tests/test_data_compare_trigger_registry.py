from app.automation.trigger_registry import get_trigger_meta


def test_data_compare_scheduler_triggers_are_registered():
    for trigger_type in (
        "scheduled_data_compare_success",
        "scheduled_data_compare_warning",
        "scheduled_data_compare_failed",
    ):
        assert get_trigger_meta(trigger_type) is not None
