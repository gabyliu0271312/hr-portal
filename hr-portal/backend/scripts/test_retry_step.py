"""Phase 2-2 retry_step/retry_failed_items 单元测试。"""
import sys
sys.path.insert(0, '.')
sys.path.insert(0, '.venv/Lib/site_packages') if False else None
sys.path.insert(0, '.venv/Lib/site-packages')

import asyncio
from types import SimpleNamespace
from app.ucp.pipeline_engine import retry_step, retry_failed_items, RetryError


# 共享 mock 对象
fake_pipeline_exec = SimpleNamespace(
    pipeline_run_id='pr_test_001',
    pipeline_code='PENDING_OFFER_SYNC',
    trace_id='trace_test_001',
    status='FAILED',
    context_summary={'stats': {}},
    success_steps=0,
    failed_steps=1,
)

fake_step_exec = SimpleNamespace(
    step_run_id='sr_pull_pending_list_001',
    pipeline_run_id='pr_test_001',
    step_id='pull_pending_list',
    step_type='CONNECTOR',
    connector_code='BEISEN_PENDING_LIST',
    status='FAILED',
    retry_count=0,
    error_message='北森 401',
    ended_at=None,
    duration_ms=None,
    output_snapshot=None,
    total_items=None,
    success_items=None,
    failed_items=None,
)

fake_pipeline_config = SimpleNamespace(
    pipeline_code='PENDING_OFFER_SYNC',
    steps=[
        {'step_id': 'pull_pending_list', 'type': 'CONNECTOR', 'connector_code': 'BEISEN_PENDING_LIST'},
        {'step_id': 'extract_application_ids', 'type': 'TRANSFORM'},
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
        # 按查询调用顺序匹配（retry_step 流程是固定的）：
        # 1. pipeline_exec 查询
        # 2. step_exec 查询
        # 3. pipeline_config 查询
        # 4. all_steps 重新统计
        if self._call_count == 1:
            return MockResult([self._map.get('pipeline_exec')])
        elif self._call_count == 2:
            return MockResult([self._map.get('step_exec')])
        elif self._call_count == 3:
            return MockResult([self._map.get('pipeline_config')])
        elif self._call_count == 4:
            return MockResult(self._map.get('all_steps', []))
        else:
            return MockResult(self._map.get('all_steps', []))
    def add(self, obj):
        self.added.append(obj)
    async def flush(self):
        pass


async def test_retry_step_happy_path():
    db = FakeDB({
        'pipeline_exec': fake_pipeline_exec,
        'step_exec': fake_step_exec,
        'pipeline_config': fake_pipeline_config,
        'all_steps': [fake_step_exec],
    })

    import app.ucp.pipeline_engine as pe
    original = pe._execute_step
    async def mock_execute_step(*args, **kwargs):
        return {
            'status': 'success',
            'data': [{'application_id': 'A1'}, {'application_id': 'A2'}],
            'row_count': 2,
            'success_count': 2,
            'failed_count': 0,
        }
    pe._execute_step = mock_execute_step

    try:
        result = await retry_step(db, 'pr_test_001', 'sr_pull_pending_list_001', triggered_by='user_1')
        assert result.retry_count == 1, f'retry_count should be 1, got {result.retry_count}'
        assert result.status == 'SUCCESS', f'status should be SUCCESS, got {result.status}'
        assert result.output_snapshot is not None, 'output_snapshot should be set'
        assert result.output_snapshot['row_count'] == 2
        assert result.output_snapshot['success_count'] == 2
        assert result.error_message is None
        assert fake_pipeline_exec.status == 'SUCCESS', f'pipeline status should be SUCCESS, got {fake_pipeline_exec.status}'
        print('[OK] retry_step: success path')
        print(f'     pipeline_exec.status -> {fake_pipeline_exec.status}')
        print(f'     retry_count -> {result.retry_count}')
        print(f'     output_snapshot.row_count -> {result.output_snapshot["row_count"]}')
    finally:
        pe._execute_step = original


async def test_retry_step_pipeline_not_found():
    db = FakeDB({'pipeline_exec': None})
    try:
        await retry_step(db, 'pr_does_not_exist', 'sr_x')
        print('[FAIL] should raise RetryError')
    except RetryError as e:
        assert e.code == 'PIPELINE_NOT_FOUND'
        print(f'[OK] retry_step raises PIPELINE_NOT_FOUND: {e.message}')


async def test_retry_step_pipeline_not_retryable():
    success_pipeline = SimpleNamespace(pipeline_run_id='pr_x', status='SUCCESS')
    success_step = SimpleNamespace(step_run_id='sr_x', pipeline_run_id='pr_x', step_id='x', status='SUCCESS')
    db = FakeDB({'pipeline_exec': success_pipeline, 'step_exec': success_step})
    try:
        await retry_step(db, 'pr_x', 'sr_x')
        print('[FAIL] should raise RetryError')
    except RetryError as e:
        assert e.code == 'PIPELINE_NOT_RETRYABLE', f'expected PIPELINE_NOT_RETRYABLE, got {e.code}'
        print(f'[OK] retry_step rejects when pipeline not retryable: code={e.code}')


async def test_retry_step_step_config_not_found():
    no_match_config = SimpleNamespace(pipeline_code='PENDING_OFFER_SYNC', steps=[
        {'step_id': 'pull_pending_list', 'type': 'CONNECTOR'},
        # 故意缺少 step_exec.step_id='pull_offer_detail' 测试用
    ])
    pipeline = SimpleNamespace(pipeline_run_id='pr_x', pipeline_code='PENDING_OFFER_SYNC', status='FAILED', context_summary={}, success_steps=0, failed_steps=1)
    step = SimpleNamespace(step_run_id='sr_x', pipeline_run_id='pr_x', step_id='pull_offer_detail', status='FAILED', retry_count=0, error_message='', output_snapshot=None, total_items=None, success_items=None, failed_items=None, connector_code=None)
    db = FakeDB({'pipeline_exec': pipeline, 'step_exec': step, 'pipeline_config': no_match_config})
    try:
        await retry_step(db, 'pr_x', 'sr_x')
        print('[FAIL] should raise RetryError')
    except RetryError as e:
        assert e.code in ('STEP_CONFIG_NOT_FOUND', 'CONNECTOR_NOT_FOUND', 'STEP_NOT_FOUND', 'PIPELINE_NOT_FOUND'), f'got {e.code}'
        print(f'[OK] retry_step raises {e.code}: {e.message}')


async def main():
    await test_retry_step_pipeline_not_found()
    await test_retry_step_pipeline_not_retryable()
    await test_retry_step_happy_path()
    await test_retry_step_step_config_not_found()
    print('---')
    print('All retry_step tests passed.')


asyncio.run(main())
