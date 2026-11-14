#!/usr/bin/env python3
"""Summarize captured host measurements without treating partial data as complete."""
import argparse
import json
import math
import pathlib
import re
import statistics


def number(value):
    try:
        result = float(str(value).removesuffix('%'))
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def memory(value):
    match = re.fullmatch(r'([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)', str(value or '').strip())
    if not match:
        return None
    scale = {'B': 1, 'KiB': 1024, 'MiB': 1024**2, 'GiB': 1024**3,
             'KB': 1000, 'MB': 1000**2, 'GB': 1000**3}
    parsed = number(match[1])
    return round(parsed * scale[match[2]]) if parsed is not None else None


def valid_count(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def summarize(lines, expected_samples=None, monitor_exit_code=None):
    rows, invalid_lines = [], []
    for index, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            if not isinstance(row, dict) or not isinstance(row.get('at'), str):
                raise ValueError('INVALID_SAMPLE')
            if any(not isinstance(row.get(key, {}), dict) for key in ('hostMemory', 'container', 'stability')):
                raise ValueError('INVALID_SAMPLE_SECTION')
            rows.append(row)
        except (ValueError, TypeError):
            invalid_lines.append(index)

    cpu = [number(r.get('container', {}).get('CPUPerc')) for r in rows]
    cpu = [x for x in cpu if x is not None]
    ram = [memory(str(r.get('container', {}).get('MemUsage') or '').split('/')[0]) for r in rows]
    ram = [x for x in ram if x is not None]
    available = [r['hostMemory']['MemAvailableBytes'] for r in rows
                 if isinstance(r.get('hostMemory', {}).get('MemAvailableBytes'), (int, float))]
    host_cpu = [number(r.get('hostCpuPercent')) for r in rows]
    host_cpu = [x for x in host_cpu if x is not None and 0 <= x <= 100]
    restarts = [r.get('stability', {}).get('restartCount') for r in rows]
    restarts = [n for n in restarts if valid_count(n)]
    starts = {r.get('stability', {}).get('StartedAt') for r in rows
              if r.get('stability', {}).get('StartedAt')}
    swaps = [r.get('hostMemory', {}) for r in rows
             if all(isinstance(r.get('hostMemory', {}).get(k), (int, float))
                    for k in ('SwapTotalBytes', 'SwapFreeBytes'))]
    stability_rows = sum(isinstance(r.get('stability', {}).get('OOMKilled'), bool)
                         and valid_count(r.get('stability', {}).get('restartCount')) for r in rows)
    errors = sum('containerError' in r or 'stabilityError' in r for r in rows)
    count_matches = expected_samples is not None and len(rows) == expected_samples
    complete = bool(rows) and count_matches and monitor_exit_code == 0 and not invalid_lines and not errors
    complete = complete and len(cpu) == len(rows) and len(ram) == len(rows)
    complete = complete and len(available) == len(rows) and len(swaps) == len(rows)
    complete = complete and stability_rows == len(rows) and len(host_cpu) >= max(0, len(rows) - 1)
    return {
        'samples': len(rows), 'first': rows[0]['at'] if rows else None,
        'last': rows[-1]['at'] if rows else None,
        'hostVcpus': rows[0].get('hostVcpus') if rows else None,
        'dockerCpuPercentOfOneCore': {'mean': statistics.mean(cpu) if cpu else None, 'max': max(cpu) if cpu else None},
        'hostCpuPercent': {'mean': statistics.mean(host_cpu) if host_cpu else None, 'max': max(host_cpu) if host_cpu else None},
        'restartCountIncrease': max(restarts) - min(restarts) if restarts else None,
        'containerRamBytes': {'mean': round(statistics.mean(ram)) if ram else None, 'max': max(ram) if ram else None},
        'minimumHostAvailableRamBytes': min(available) if available else None,
        'swapBytes': {'maxUsed': max(r['SwapTotalBytes'] - r['SwapFreeBytes'] for r in swaps) if swaps else None,
                      'minimumFree': min(r['SwapFreeBytes'] for r in swaps) if swaps else None},
        'oomKilledObserved': any(r.get('stability', {}).get('OOMKilled') is True for r in rows),
        'containerRestartsObserved': len(starts) > 1 or (bool(restarts) and max(restarts) > min(restarts))
                                     or any(r.get('stability', {}).get('Restarting') is True for r in rows),
        'monitorErrors': errors, 'hardwareOrModelChanged': False,
        'capture': {'expectedSamples': expected_samples, 'monitorExitCode': monitor_exit_code,
                    'sampleCountMatches': count_matches if expected_samples is not None else None,
                    'invalidSampleLines': invalid_lines, 'complete': complete,
                    'coverage': {'dockerCpu': len(cpu), 'dockerMemory': len(ram), 'hostCpu': len(host_cpu),
                                 'hostAvailableMemory': len(available), 'hostSwap': len(swaps),
                                 'containerStability': stability_rows},
                    'note': 'complete concerns capture coverage, not generation health or absence of historical OOM.'}}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('--expected-samples', type=int)
    parser.add_argument('--monitor-exit-code', type=int)
    args = parser.parse_args(argv)
    if args.expected_samples is not None and not 1 <= args.expected_samples <= 360:
        parser.error('expected-samples must be 1..360')
    if args.monitor_exit_code is not None and args.monitor_exit_code < 0:
        parser.error('monitor-exit-code must be nonnegative')
    result = summarize(pathlib.Path(args.input).read_text().splitlines(), args.expected_samples, args.monitor_exit_code)
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
