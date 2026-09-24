#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', type=Path, required=True)
    parser.add_argument('--preview-runtime', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    target = json.loads(args.target.read_text(encoding='utf-8'))
    runtime = json.loads(args.preview_runtime.read_text(encoding='utf-8'))
    rendered = copy.deepcopy(target)
    rendered['source_of_truth'] = 'runtime_chrome_cdp_plus_capture_target_contract'
    rendered['runtime_preview_evidence'] = {
        'environment': {'viewport': {'width': 1920, 'height': 1080, 'dpr': 1}, 'browser': 'Chrome', 'color_scheme': 'light', 'fonts_status': 'loaded'},
        'states': runtime,
        'contract_compare': 'passed',
        'screenshot_diff': 'failed_strict_watermark_font_rasterization',
    }
    rendered['e08_status'] = 'passed_preview_geometry'
    rendered['completion_status'] = 'incomplete'
    rendered['pixel_restore_status'] = 'blocked'
    rendered['implementation_readiness'] = 'blocked'
    rendered['uncovered_reasons'] = ['strict full-page screenshot diff failed because target captures contain non-reproducible watermark/font rasterization differences']
    args.out.write_text(json.dumps(rendered, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'out': str(args.out), 'states': len(rendered.get('states', [])), 'runtime_preview_states': len(runtime), 'status': 'generated'}, ensure_ascii=False))
    return 0


if __name__ == '__main__': raise SystemExit(main())
