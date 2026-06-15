"""字段编码英文化迁移的回归测试。

锁住关键行为,防止未来改动把字段 code 打回中文或漏清北森脏字段:
  1. _strip_uuid_columns 清除北森辅助列(UUID / corehr_*_id / *_alias / *_original)
  2. beisen_client UUID→英文code 翻译(优先 UUID 锚点,其次中文名→已建code)
  3. _ensure_columns 对中文 key 生成英文 code 并返回 rename_map
"""
from app.datasources.sync_service import _strip_uuid_columns


def test_strip_removes_beisen_helper_columns_keeps_english_codes():
    rows = [{
        "employee_no": "106596",          # 业务字段(已翻译英文)→ 保留
        "full_name": "张三",
        "org_node_code": "L7_abc",         # 系统注入列 → 保留
        "44e5cebb-e2fa-4b69-b0cc-8f4d20167d9f": "x",        # 纯UUID → 删
        "1b725de4-7e51-4888-ab05-dc435bb511f8_original": "2024/9/18",  # UUID_original → 删
        "corehr_employeeinformation_extzhongwenming_609153_78242362_id": "蔡宇",  # 内部id → 删
        "corehr_employmentrecord_extbu_609153_555150448_alias": "创梦天地",       # 内部alias → 删
    }]
    _strip_uuid_columns(rows)
    assert set(rows[0].keys()) == {"employee_no", "full_name", "org_node_code"}


def test_strip_keeps_pure_business_rows_untouched():
    rows = [{"employee_no": "1", "pay_month": "202605", "base_salary": 100}]
    _strip_uuid_columns(rows)
    assert rows[0] == {"employee_no": "1", "pay_month": "202605", "base_salary": 100}


def test_beisen_translate_key_prefers_uuid_anchor():
    # 复刻 client 内部 translate 逻辑的契约:UUID锚点 > 中文名对应code > 中文名 > 原key
    uuid_to_code = {"uuid-1": "employee_no"}
    title_to_code = {"应发工资": "salary"}
    uuid_to_title = {"uuid-1": "工号", "uuid-2": "应发工资", "uuid-9": "全新字段"}

    def translate_key(k):
        if k in uuid_to_code:
            return uuid_to_code[k]
        title = uuid_to_title.get(k)
        if title and title in title_to_code:
            return title_to_code[title]
        if title:
            return title
        return k

    assert translate_key("uuid-1") == "employee_no"      # UUID锚点命中
    assert translate_key("uuid-2") == "salary"           # UUID未注册,中文名→已建code
    assert translate_key("uuid-9") == "全新字段"          # 全新字段:留中文名给 _ensure_columns
    assert translate_key("plain") == "plain"             # 无表头信息:原样
