#!/usr/bin/env python3
"""Compare preserved real captures offline; no imports/execution of the uploaded reader."""
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def counters(text):
    if not isinstance(text, str):
        return None
    result = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].isdigit():
            result[parts[0]] = int(parts[1])
    return result


def delta(a, b):
    return {key: b[key] - a[key] if b[key] >= a[key] else None for key in a.keys() & b.keys()}


def io_values(text):
    return {parts[0]: {k: int(v) for k, v in (p.split('=', 1) for p in parts[1:])}
            for line in text.splitlines() if (parts := line.split()) and ':' in parts[0]}


def psi_totals(text):
    return {line.split()[0]: int(line.rsplit('total=', 1)[1]) for line in text.splitlines()}


def main():
    provenance = json.loads((ROOT / 'provenance.json').read_text())
    for name in ('residency.json', 'reader-exit-code.txt', 'reader-sha256.txt'):
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == provenance['files'][name]['sha256']
    report = json.loads((ROOT / 'residency.json').read_text())
    a, b = report['samples']
    assert report['identityStable'] and report['generationRequests'] == 0
    ca, cb = a['cgroups'][0], b['cgroups'][0]
    assert ca['version'] == cb['version'] == 2
    leaf_a, leaf_b = ca['levels'][0]['files'], cb['levels'][0]['files']
    ma, mb = counters(leaf_a['memory.stat']), counters(leaf_b['memory.stat'])
    cpu_a, cpu_b = counters(leaf_a['cpu.stat']), counters(leaf_b['cpu.stat'])
    io_a, io_b = io_values(leaf_a['io.stat']), io_values(leaf_b['io.stat'])
    candidates = [m for m in a['smaps']['largeFileMappings'] if m['pathClass'] == 'model-cache-candidate']
    assert len(candidates) == 1
    candidate = candidates[0]
    model = candidate['bytes']
    anon = a['processStatus']['RssAnonBytes']
    total = a['hostMemory']['MemTotalBytes']
    selected = ('workingset_refault_file', 'pgscan', 'pgsteal', 'pgmajfault')
    previous = json.loads((ROOT.parent / 'queen-genix-evidence-2026-11-13' / 'analysis.json').read_text())
    result = {
        'source': 'Two real user-supplied captures, compared offline; no new VPS requests',
        'integrity': {'preservedRawHashesMatch': True, 'readerExitCode': int((ROOT / 'reader-exit-code.txt').read_text()),
                      'readerSha256': (ROOT / 'reader-sha256.txt').read_text().strip(),
                      'readerMatchesPublishedCheckpoint': provenance['readerMatchesPublishedCommit']},
        'passiveWindow': {'firstUtc': a['atUtc'], 'lastUtc': b['atUtc'],
                          'secondsBetweenSampleStarts': report['observedSecondsBetweenSampleStarts'],
                          'identityStable': report['identityStable'], 'containerStartedAt': report['dockerBefore']['startedAt']},
        'memory': {'hostTotalBytes': total,
                   'minimumHostAvailableBytes': min(s['hostMemory']['MemAvailableBytes'] for s in (a, b)),
                   'processRssBytes': a['processStatus']['VmRSSBytes'], 'processAnonBytes': anon,
                   'processFileRssBytes': a['processStatus']['RssFileBytes'],
                   'processAnonShareOfHostAnonPercent': anon * 100 / a['hostMemory']['AnonPagesBytes'],
                   'cgroupCurrentBytes': int(leaf_a['memory.current']),
                   'cgroupAnonBytes': ma['anon'], 'cgroupFileBytes': ma['file'], 'cgroupKernelBytes': ma['kernel'],
                   'swapTotalBytes': a['hostMemory']['SwapTotalBytes'],
                   'namedGgufMappings': a['smaps']['gguf']['mappingCount'],
                   'candidate': {'identityConfirmedAsGguf': False, 'mappedBytes': model['SizeBytes'],
                                 'residentBytes': model['RssBytes'], 'residentPercent': model['RssBytes'] * 100 / model['SizeBytes'],
                                 'unrepresentedByMappedRssBytes': model['SizeBytes'] - model['RssBytes'],
                                 'deviceHex': candidate['deviceHex'], 'inode': candidate['inode']},
                   'conditionalBudget': {'currentAnonPlusEntireCandidateBytes': anon + model['SizeBytes'],
                                         'excessOverPhysicalRamBytesBeforeOsAndOthers': anon + model['SizeBytes'] - total,
                                         'assumptions': ['retain all current anonymous memory', 'entire candidate mapping required resident'],
                                         'notARequiredUpgradeSize': True},
                   'kvBytes': None, 'computeBufferBytes': None, 'requestCacheBytes': None},
        'visibleControlsBothSnapshots': [
            [{'levelFromLeaf': level['levelFromLeaf'],
              'memory.max': level['files']['memory.max'], 'memory.high': level['files']['memory.high'],
              'io.max': level['files']['io.max'], 'cpu.max': level['files']['cpu.max']}
             for level in sample['cgroups'][0]['levels'] if not level['isHierarchyRoot']]
            for sample in (a, b)],
        'qwenCumulativeHistory': {**{key: ma[key] for key in selected},
                                  'processMajorFaults': a['processCounters']['majorFaults'],
                                  'io': io_a,
                                  'scope': 'Cumulative counters; no attribution to the historical 60-second episode'},
        'passiveDeltas': {'qwenMemoryCounters': {key: mb[key] - ma[key] for key in selected},
                          'qwenProcessFaults': report['deltas']['processFaults'],
                          'qwenIo': {device: delta(values, io_b[device]) for device, values in io_a.items()},
                          'qwenMemoryEvents': delta(counters(leaf_a['memory.events']), counters(leaf_b['memory.events'])),
                          'qwenCpu': delta(cpu_a, cpu_b),
                          'qwenPsiMemoryUs': delta(psi_totals(leaf_a['memory.pressure']), psi_totals(leaf_b['memory.pressure'])),
                          'qwenPsiIoUs': delta(psi_totals(leaf_a['io.pressure']), psi_totals(leaf_b['io.pressure'])),
                          'hostVm': report['deltas']['hostVm'],
                          'hostPsiMemoryUs': delta(psi_totals(a['pressure']['memory']), psi_totals(b['pressure']['memory'])),
                          'hostPsiIoUs': delta(psi_totals(a['pressure']['io']), psi_totals(b['pressure']['io'])),
                          'physicalDisk253:0': report['deltas']['disk']['253:0'],
                          'doNotSumDiskAndPartition': 'vda / vda1 represent the same underlying I/O'},
        'priorActiveEvidence': {'firstUtc': previous['host']['firstUtc'], 'lastUtc': previous['host']['lastUtc'],
                                'highIoWaitDurationSeconds': previous['vmstat']['highIoWaitDurationSeconds'],
                                'highIoWaitStats': previous['vmstat']['highIoWaitStats'],
                                'highIoWaitReadGiB': previous['vmstat']['highIoWaitReadGiB'],
                                'generationMs': previous['probe']['elapsedMs'],
                                'synchronizedReclaimOrResidencyCountersAvailable': False},
        'missing': ['Anonymous allocation breakdown: KV/recurrent state/compute/request cache/retained heap',
                    'Definite identity and actual hot working set of opaque model-cache mapping',
                    'During an explicitly authorized future workload: synchronized refault/reclaim, residency, faults, PSI, cgroup I/O, disk latency/queue',
                    'Provider storage limits/QoS and uncollected local io.weight/io.latency/io.cost policies'],
        'newInferenceRequests': 0, 'newVpsReads': 0,
    }
    print(json.dumps(result, indent=2, sort_keys=True, allow_nan=False))


if __name__ == '__main__':
    main()
