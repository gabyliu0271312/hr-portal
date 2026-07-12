"""Phase 2-2 retry_failed_items 单元测试。"""
import sys
sys.path.insert(0, '.')
sys.path.insert(0, '.venv/Lib/site-packages')

import asyncio
from types import SimpleNamespace
from app.ucp.pipeline_engine import retry_failed_items, RetryError


fake_pipeline_exec = SimpleNamespace(
    pipeline_run_id='pr_test_002',
    pipeline_code='PENDING_OFFER_SYNC',
    trace_id='trace_test_002',
    status='PARTIAL_SUCCESS',
    context_summary={},
    success_steps=1,
    failed_steps=0,
)

fake_failed_item_1 = SimpleNamespace(
    id=1,
    trace_id='trace_test_002',
    pipeline_run_id='pr_test_002',
    step_run_id='sr_loop_001',
    connector_code='FEISHU_OFFER_DETAIL',
    item_key='A1',
    status='FAILED',
    error_code='OFFER_NOT_FOUND',
    error_message='item 1 失败',
    retry_count=0,
    is_retryable=1,
    last_failed_at=None,
    request_params_masked=None,
)

fake_failed_item_2 = SimpleNamespace(
    id=2,
    trace_id='trace_test_002',
    pipeline_run_id='pr_test_002',
    step_run_id='sr_loop_001',
    connector_code='FEISHU_OFFER_DETAIL',
    item_key='A2',
    status='FAILED',
    error_code='TIMEOUT',
    error_message='item 2 超时',
    retry_count=0,
    is_retryable=1,
    last_failed_at=None,
    request_params_masked=None,
)

fake_step_exec = SimpleNamespace(
    step_run_id='sr_loop_001',
    pipeline_run_id='pr_test_002',
    step_id='pull_offer_detail',
    step_type='CONNECTOR_LOOP',
    connector_code='FEISHU_OFFER_DETAIL',
    status='PARTIAL_SUCCESS',
    success_items=3,
    failed_items=2,
    error_message='2 个失败',
)

fake_conn_config = SimpleNamespace(
    id=1,
    system_code='FEISHU_OFFER_DETAIL',
    adapter_code='FEISHU_OFFER_DETAIL_ADAPTER',
    protocol={'url': 'http://example.com'},
    report_config={},
    credential_id=None,
)

fake_pipeline_config = SimpleNamespace(
    pipeline_code='PENDING_OFFER_SYNC',
    steps=[
        {'step_id': 'pull_pending_list', 'type': 'CONNECTOR', 'connector_code': 'BEISEN_PENDING_LIST'},
        {'step_id': 'pull_offer_detail', 'type': 'CONNECTOR_LOOP', 'connector_code': 'FEISHU_OFFER_DETAIL', 'item_key_field': 'application_id'},
    ],
)


class MockResult:
    def __init__(self, values):
        self._values = values
    def scalar_one_or_none(self):
        return self._values[0] if self._values else None
    def scalars(self):
        return SimpleNamespace(all=lambda: self._values)


class FakeDB:
    def __init__(self, query_map):
        self._map = query_map
        self.added = []
        self._call_count = 0
    async def execute(self, stmt):
        s = str(stmt)
        self._call_count += 1
        # retry_failed_items 查询顺序：
        # 1. pipeline_exec
        # 2. failed_items
        # 3. step_exec (per step)
        # 4. conn_config (per connector)
        # 5. pipeline_config
        # 6. all_steps 重新统计
        if self._call_count == 1:
            return MockResult([self._map.get('pipeline_exec')])
        elif self._call_count == 2:
            return MockResult(self._map.get('failed_items', []))
        elif self._call_count == 3:
            return MockResult([self._map.get('step_exec')])
        elif self._call_count == 4:
            return MockResult([self._map.get('conn_config')])
        elif self._call_count == 5:
            return MockResult([self._map.get('pipeline_config')])
        else:
            return MockResult(self._map.get('all_steps', []))
    def add(self, obj):
        self.added.append(obj)
    async def flush(self):
        pass


async def test_retry_failed_items_no_items():
    """没有可重跑项时直接返回空结果。"""
    db = FakeDB({
        'pipeline_exec': fake_pipeline_exec,
        'failed_items': [],
    })
    result = await retry_failed_items(db, 'pr_test_002')
    assert result['total'] == 0
    assert result['success_count'] == 0
    assert result['failed_count'] == 0
    print(f'[OK] retry_failed_items: no retryable items, returns empty result')


async def test_retry_failed_items_pipeline_not_found():
    db = FakeDB({'pipeline_exec': None})
    try:
        await retry_failed_items(db, 'pr_does_not_exist')
        print('[FAIL] should raise')
    except RetryError as e:
        assert e.code == 'PIPELINE_NOT_FOUND'
        print(f'[OK] retry_failed_items raises PIPELINE_NOT_FOUND')


async def test_retry_failed_items_happy_path():
    """模拟 2 个失败项：1 个重试成功，1 个仍失败。"""
    db = FakeDB({
        'pipeline_exec': fake_pipeline_exec,
        'failed_items': [fake_failed_item_1, fake_failed_item_2],
        'step_exec': fake_step_exec,
        'conn_config': fake_conn_config,
        'pipeline_config': fake_pipeline_config,
        'all_steps': [fake_step_exec],
    })

    # 模拟 adapter：根据 item_key 返回不同结果
    import app.ucp.adapters as ad
    original_get = ad.get_adapter
    def mock_get_adapter(adapter_code):
        async def adapter(params, secrets, db):
            from app.ucp.types import AdapterResult
            if params.get('application_id') == 'A1':
                # A1 重试成功
                return AdapterResult(
                    status='success',
                    data=[{'application_id': 'A1', 'offer': 'ok'}],
                    row_count=1,
                    success_count=1,
                )
            else:
                # A2 仍失败
                return AdapterResult(
                    status='failed',
                    error_code='TIMEOUT',
                    error_message='仍超时',
                )
        return adapter
    ad.get_adapter = mock_get_adapter

    try:
        result = await retry_failed_items(db, 'pr_test_002')

        # 校验结果
        assert result['total'] == 2, f'expected 2, got {result["total"]}'
        assert result['success_count'] == 1, f'expected 1 success, got {result["success_count"]}'
        assert result['failed_count'] == 1, f'expected 1 failed, got {result["failed_count"]}'

        # 校验 A1 成功 -> 新 ConnectorLoopItemExecution 写入
        # 校验 A1 的 is_retryable=0
        assert fake_failed_item_1.is_retryable == 0, 'A1 should be marked is_retryable=0'
        # 校验 A2 仍失败 -> retry_count+1, last_failed_at 更新
        assert fake_failed_item_2.retry_count == 1, f'expected retry_count=1, got {fake_failed_item_2.retry_count}'

        print(f'[OK] retry_failed_items: 2 items, 1 success, 1 failed')
        print(f'     A1 (success) -> is_retryable=0, retry_count=1')
        print(f'     A2 (failed) -> retry_count={fake_failed_item_2.retry_count}, last_failed_at updated')
        print(f'     pipeline_exec.status -> {fake_pipeline_exec.status}')
        print(f'     details: {result["details"]}')
    finally:
        ad.get_adapter = original_get


async def main():
    await test_retry_failed_items_no_items()
    await test_retry_failed_items_pipeline_not_found()
    await test_retry_failed_items_happy_path()
    print('---')
    print('All retry_failed_items tests passed.')


asyncio.run(main())
