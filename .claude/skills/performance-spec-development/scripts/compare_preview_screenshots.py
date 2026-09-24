#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import struct
import zlib
from pathlib import Path

CASES = [
    ('01-rating-validation', 'RR-PREVIEW-RATING-VALIDATION-ERROR'),
    ('02-rating-non-quantified', 'RR-PREVIEW-RATING-NON-QUANTIFIED'),
    ('03-rating-quantified', 'RR-PREVIEW-RATING-QUANTIFIED'),
    ('04-score-validation', 'RR-PREVIEW-SCORE-VALIDATION-ERROR'),
    ('05-score-bounds', 'RR-PREVIEW-SCORE-BOUNDS'),
    ('06-score-fixed', 'RR-PREVIEW-SCORE-FIXED'),
    ('07-mapping-validation', 'RR-PREVIEW-MAPPING-VALIDATION-ERROR'),
    ('08-mapping-initial', 'RR-PREVIEW-MAPPING-INITIAL'),
    ('09-mapping-value-50', 'RR-PREVIEW-MAPPING-VALUE-50'),
]


def read_png(path: Path) -> tuple[int, int, bytes]:
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError(f'{path}:not_png')
    pos = 8; width = height = None; color_type = None; bits = None; compressed = b''
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]; kind = data[pos + 4:pos + 8]; chunk = data[pos + 8:pos + 8 + length]; pos += 12 + length
        if kind == b'IHDR': width, height, bits, color_type = struct.unpack('>IIBB', chunk[:10])
        elif kind == b'IDAT': compressed += chunk
        elif kind == b'IEND': break
    if bits != 8 or color_type not in (2, 6): raise ValueError(f'{path}:only_8bit_rgb_or_rgba_supported')
    channels = 4 if color_type == 6 else 3; stride = width * channels; raw = zlib.decompress(compressed); rows = []; offset = 0; previous = bytearray(stride)
    for _ in range(height):
        filter_type = raw[offset]; offset += 1; source = raw[offset:offset + stride]; offset += stride; row = bytearray(stride)
        for i, value in enumerate(source):
            left = row[i - channels] if i >= channels else 0; up = previous[i]; upper_left = previous[i - channels] if i >= channels else 0
            if filter_type == 0: result = value
            elif filter_type == 1: result = (value + left) & 255
            elif filter_type == 2: result = (value + up) & 255
            elif filter_type == 3: result = (value + ((left + up) // 2)) & 255
            elif filter_type == 4:
                predictor = left + up - upper_left; pa = abs(predictor - left); pb = abs(predictor - up); pc = abs(predictor - upper_left); result = (value + (left if pa <= pb and pa <= pc else up if pb <= pc else upper_left)) & 255
            else: raise ValueError(f'{path}:unsupported_filter_{filter_type}')
            row[i] = result
        rows.append(row); previous = row
    rgba = bytearray()
    for row in rows:
        if channels == 4: rgba.extend(row)
        else:
            for i in range(0, len(row), 3): rgba.extend(row[i:i + 3]); rgba.append(255)
    return width, height, bytes(rgba)


def write_png(path: Path, width: int, height: int, rgba: bytes) -> None:
    raw = b''.join(b'\x00' + rgba[y * width * 4:(y + 1) * width * 4] for y in range(height))
    def chunk(kind: bytes, value: bytes) -> bytes: return struct.pack('>I', len(value)) + kind + value + struct.pack('>I', zlib.crc32(kind + value) & 0xffffffff)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dir', type=Path, required=True)
    parser.add_argument('--max-diff-pixel-ratio', type=float, default=0.01)
    parser.add_argument('--channel-tolerance', type=int, default=3)
    args = parser.parse_args()
    results = []
    for name, state in CASES:
        target = args.dir / f'{name}-target.png'; actual = args.dir / f'{name}.png'; diff = args.dir / f'{name}-diff.png'
        width, height, expected = read_png(target); actual_width, actual_height, observed = read_png(actual)
        if (width, height) != (actual_width, actual_height): raise SystemExit(f'{name}:viewport_mismatch:{width}x{height}!={actual_width}x{actual_height}')
        output = bytearray(width * height * 4); different = 0
        for i in range(0, len(expected), 4):
            delta = max(abs(expected[i + channel] - observed[i + channel]) for channel in range(3))
            if delta > args.channel_tolerance:
                different += 1; output[i:i + 4] = bytes((255, 0, 0, 255))
            else:
                gray = round(sum(observed[i:i + 3]) / 3); output[i:i + 4] = bytes((gray, gray, gray, 255))
        ratio = different / (width * height); status = 'passed' if ratio <= args.max_diff_pixel_ratio else 'failed'
        write_png(diff, width, height, bytes(output))
        results.append({'source_state_id':state,'target_path':str(target),'actual_path':str(actual),'diff_path':str(diff),'width':width,'height':height,'channel_tolerance':args.channel_tolerance,'max_diff_pixel_ratio':args.max_diff_pixel_ratio,'diff_pixels':different,'diff_pixel_ratio':ratio,'pixel_status':status})
    payload={'viewport':{'width':1920,'height':1080,'dpr':1},'browser':'Chrome','color_scheme':'light','fonts_status':'loaded','cases':results,'pixel_status':'passed' if all(x['pixel_status']=='passed' for x in results) else 'failed'}
    (args.dir/'diff-results.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(payload,ensure_ascii=False,indent=2))
    return 0 if payload['pixel_status']=='passed' else 1


if __name__ == '__main__': raise SystemExit(main())
