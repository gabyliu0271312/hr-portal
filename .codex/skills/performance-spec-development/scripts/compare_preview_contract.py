#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def delta_errors(expected: dict | None, actual: dict | None, label: str, tolerance: float = 1.0) -> list[str]:
    if not isinstance(expected, dict) or not isinstance(actual, dict): return [f'{label}:missing_bbox']
    errors = []
    for key in ('x', 'y', 'width', 'height'):
        if not isinstance(expected.get(key), (int, float)) or not isinstance(actual.get(key), (int, float)) or abs(expected[key] - actual[key]) > tolerance:
            errors.append(f'{label}:{key}:{expected.get(key)}!={actual.get(key)}')
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    target = json.loads(args.target.read_text(encoding='utf-8'))
    runtime = json.loads(args.runtime.read_text(encoding='utf-8'))
    target_states = {item['source_state_id']: item for item in target['states']}
    components = {item['component_id']: item for item in target['components']}
    errors = []
    normal_states = {
        'RR-PREVIEW-RATING-NON-QUANTIFIED', 'RR-PREVIEW-RATING-QUANTIFIED',
        'RR-PREVIEW-SCORE-BOUNDS', 'RR-PREVIEW-SCORE-FIXED',
        'RR-PREVIEW-MAPPING-INITIAL', 'RR-PREVIEW-MAPPING-VALUE-50',
    }
    for item in runtime:
        state_id = item['source_state_id']; expected = target_states[state_id]
        errors.extend(delta_errors(expected['geometry']['bbox'], item['geometry']['bbox'], f'{state_id}:root'))
        if state_id in normal_states:
            root = expected['geometry']['bbox']
            expected_header = {'x': root['x'], 'y': root['y'], 'width': 600, 'height': 72}
            expected_body = {'x': root['x'], 'y': root['y'] + 72, 'width': 600, 'height': root['height'] - 96}
            expected_close = {'x': 1212, 'y': root['y'] + 22, 'width': 28, 'height': 28}
            errors.extend(delta_errors(expected_header, item['geometry']['header'], f'{state_id}:header'))
            errors.extend(delta_errors(expected_body, item['geometry']['body'], f'{state_id}:body'))
            errors.extend(delta_errors(expected_close, item['geometry']['close_button'], f'{state_id}:close_button'))
            expected_close_svg = next(icon for icon in expected['svg'] if icon.get('data_icon') == 'CloseOutlined')
            actual_close_svg = next((icon for icon in item['svg'] if icon.get('data_icon') == 'CloseOutlined'), None)
            if not actual_close_svg or actual_close_svg.get('path') != expected_close_svg.get('path') or actual_close_svg.get('viewBox') != expected_close_svg.get('viewBox'):
                errors.append(f'{state_id}:CloseOutlined:path_or_viewBox')
            elif delta_errors(expected_close_svg['bbox'], actual_close_svg['bbox'], f'{state_id}:CloseOutlined'):
                errors.extend(delta_errors(expected_close_svg['bbox'], actual_close_svg['bbox'], f'{state_id}:CloseOutlined'))
    runtime_by_state = {item['source_state_id']: item for item in runtime}
    score_input = components['ScoreRulePreview']['geometry']['bounds_preview_input']
    mapping_input = components['ScoreMappingRulePreview']['geometry']['preview_input']
    errors.extend(delta_errors(score_input, runtime_by_state['RR-PREVIEW-SCORE-BOUNDS']['geometry']['preview_input'], 'RR-PREVIEW-SCORE-BOUNDS:preview_input'))
    for state_id in ('RR-PREVIEW-MAPPING-INITIAL', 'RR-PREVIEW-MAPPING-VALUE-50'):
        errors.extend(delta_errors(mapping_input, runtime_by_state[state_id]['geometry']['preview_input'], f'{state_id}:preview_input'))
    output = {
        'schema_version': 2,
        'feature': 'PM-T006-review-rule-preview-rendered',
        'source_of_truth': 'runtime_chrome_cdp',
        'environment': target['environment'],
        'states': runtime,
        'layout_relations': target['layout_relations'],
        'comparison': {'tolerance_px': 1, 'errors': errors, 'status': 'passed' if not errors else 'failed'},
        'coverage': {'captured_state_ids': sorted(runtime_by_state), 'required_screenshot_states': 9},
    }
    args.out.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(output['comparison'], ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == '__main__': raise SystemExit(main())
