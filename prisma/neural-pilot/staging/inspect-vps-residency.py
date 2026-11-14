#!/usr/bin/env python3
"""Read Qwen residency and limits only. No HTTP, env, cmdline, logs or model reads."""
import argparse
import datetime
import json
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time


CGV2 = ('memory.current', 'memory.max', 'memory.high', 'memory.low', 'memory.swap.current',
        'memory.swap.max', 'memory.stat', 'memory.events', 'memory.events.local',
        'memory.pressure', 'io.stat', 'io.max', 'io.pressure', 'cpu.max', 'cpu.stat',
        'cpu.pressure', 'cpuset.cpus.effective')
CGV1 = {
    'memory': ('memory.usage_in_bytes', 'memory.limit_in_bytes', 'memory.soft_limit_in_bytes',
               'memory.memsw.usage_in_bytes', 'memory.memsw.limit_in_bytes', 'memory.stat',
               'memory.failcnt', 'memory.use_hierarchy', 'memory.oom_control'),
    'cpu': ('cpu.cfs_quota_us', 'cpu.cfs_period_us', 'cpu.stat'),
    'blkio': ('blkio.throttle.read_bps_device', 'blkio.throttle.write_bps_device',
              'blkio.throttle.read_iops_device', 'blkio.throttle.write_iops_device',
              'blkio.throttle.io_service_bytes', 'blkio.throttle.io_serviced'),
}
SMAPS_KEYS = {'Size', 'Rss', 'Pss', 'Pss_Anon', 'Pss_File', 'Pss_Shmem', 'Anonymous',
              'Swap', 'SwapPss', 'Locked', 'Private_Clean', 'Private_Dirty',
              'Shared_Clean', 'Shared_Dirty'}
VM_COUNTERS = {'pgfault', 'pgmajfault', 'workingset_refault_file', 'workingset_activate_file',
               'workingset_restore_file', 'pgscan_kswapd', 'pgscan_direct',
               'pgsteal_kswapd', 'pgsteal_direct', 'pswpin', 'pswpout'}
MEM_KEYS = {'MemTotal', 'MemAvailable', 'MemFree', 'Buffers', 'Cached', 'AnonPages',
            'Mapped', 'Shmem', 'PageTables', 'KernelStack', 'Slab', 'SReclaimable',
            'SUnreclaim', 'SwapTotal', 'SwapFree', 'SwapCached'}
DOCKER_FIELDS = {
    'initPid': '.State.Pid', 'running': '.State.Running', 'oomKilled': '.State.OOMKilled',
    'startedAt': '.State.StartedAt', 'restartCount': '.RestartCount', 'imageId': '.Image',
    'memoryLimitBytes': '.HostConfig.Memory', 'memoryReservationBytes': '.HostConfig.MemoryReservation',
    'memorySwapBytes': '.HostConfig.MemorySwap', 'memorySwappiness': '.HostConfig.MemorySwappiness',
    'nanoCpus': '.HostConfig.NanoCpus', 'cpuQuota': '.HostConfig.CpuQuota',
    'cpuPeriod': '.HostConfig.CpuPeriod', 'cpuSet': '.HostConfig.CpusetCpus',
    'blkioWeight': '.HostConfig.BlkioWeight',
    'readBps': '.HostConfig.BlkioDeviceReadBps', 'writeBps': '.HostConfig.BlkioDeviceWriteBps',
    'readIops': '.HostConfig.BlkioDeviceReadIOps', 'writeIops': '.HostConfig.BlkioDeviceWriteIOps',
}


class CaptureDeadline(Exception):
    pass


def read(path):
    try:
        with Path(path).open(errors='replace') as source:
            value = source.read(4 * 1024 * 1024 + 1)
        if len(value) > 4 * 1024 * 1024:
            return {'error': 'READ_LIMIT'}
        return value.strip()
    except OSError as exc:
        return {'error': type(exc).__name__, 'errno': exc.errno}


def key_values(text):
    if not isinstance(text, str):
        return None
    values = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 2 and parts[1].isdigit():
            values[parts[0].rstrip(':')] = int(parts[1])
    return values


def byte_fields(text, allowed):
    if not isinstance(text, str):
        return text
    result = {}
    for line in text.splitlines():
        parts = line.split()
        key = parts[0].rstrip(':') if parts else ''
        if key in allowed and len(parts) >= 2 and parts[1].isdigit():
            result[key + ('Bytes' if parts[-1] == 'kB' else '')] = int(parts[1]) * (1024 if parts[-1] == 'kB' else 1)
    return result


def parse_smaps(text):
    if not isinstance(text, str):
        return text
    gguf, anon, other, file_mappings = [], [], [], []
    current = None
    for line in text.splitlines():
        mapping = re.match(r'^[0-9a-f]+-[0-9a-f]+\s+(\S+)\s+\S+\s+(\S+)\s+(\d+)\s*(.*)$', line)
        if mapping:
            permissions, device, inode, path = mapping.groups()
            current = {}
            # Classify paths in memory only; never output a mapped path or its contents.
            (gguf if '.gguf' in path.lower() else anon if not path or path.startswith('[') else other).append(current)
            if path and not path.startswith('['):
                file_mappings.append({'permissions': permissions, 'deviceHex': device, 'inode': int(inode),
                                      'pathClass': 'gguf-name' if '.gguf' in path.lower() else
                                                   'model-cache-candidate' if '/models/' in path else 'other-file',
                                      'bytes': current})
        elif current is not None:
            field = byte_fields(line, SMAPS_KEYS)
            current.update(field)
    def aggregate(items):
        return {'mappingCount': len(items), 'bytes': {
            key: sum(item.get(key, 0) for item in items)
            for key in sorted({key for item in items for key in item})}}
    return {'gguf': aggregate(gguf), 'unnamedOrBracketMappings': aggregate(anon), 'otherMappings': aggregate(other),
            'largeFileMappings': sorted((m for m in file_mappings if m['bytes'].get('SizeBytes', 0) >= 8 * 1024**2),
                                        key=lambda m: m['bytes']['SizeBytes'], reverse=True)[:64],
            'kvBytes': None, 'computeBufferBytes': None, 'requestCacheBytes': None,
            'allocationBreakdown': 'OS mappings do not identify KV/compute/request cache; do not label anonymous memory as KV.',
            'residencyMeaning': 'RSS is mapped resident pages at observation, not all filesystem page-cache residency. No model pages were touched.'}


def process_stat(pid):
    text = read(f'/proc/{pid}/stat')
    if not isinstance(text, str):
        return text
    parts = text[text.rfind(')') + 2:].split()
    try:
        return {'startTicks': int(parts[19]), 'minorFaults': int(parts[7]), 'majorFaults': int(parts[9])}
    except (ValueError, IndexError):
        return {'error': 'PROCESS_STAT_UNAVAILABLE'}


def ancestor_paths(base, membership):
    relative = Path(membership.lstrip('/'))
    if '..' in relative.parts:
        raise ValueError('INVALID_CGROUP_PATH')
    base = base.resolve()
    leaf = (base / relative).resolve()
    if not leaf.is_relative_to(base):
        raise ValueError('CGROUP_OUTSIDE_MOUNT')
    paths = []
    while len(paths) < 32:
        paths.append(leaf)
        if leaf == base:
            return paths, True
        leaf = leaf.parent
    return paths, False


def v2_limit_summary(levels, complete):
    result = {'ancestorsComplete': complete}
    for name in ('memory.max', 'memory.high'):
        values = []
        for level in levels:
            value = level['files'].get(name)
            # v2 root has no memory.max/high control files by kernel ABI. Preserve
            # raw ENOENT but don't mistake this expected absence for an unknown ancestor.
            if level.get('isHierarchyRoot') and isinstance(value, dict) and value.get('errno') == 2:
                value = 'max'
            values.append(value)
        known = complete and bool(values) and all(isinstance(v, str) and (v == 'max' or v.isdigit()) for v in values)
        finite = [int(v) for v in values if isinstance(v, str) and v.isdigit()]
        result[name] = {'allLevelsReadable': known, 'minimumFiniteBytes': min(finite) if known and finite else None,
                        'minimumObservedFiniteBytes': min(finite) if finite else None,
                        'unboundedAtAllLevels': known and not finite,
                        'meaning': 'Ancestor thresholds apply to the shared group, not a dedicated allowance for Qwen.'}
    return result


def cgroup_mounts(text):
    if not isinstance(text, str):
        return []
    mounts = []
    def unescape(value):
        return re.sub(r'\\([0-7]{3})', lambda m: chr(int(m[1], 8)), value)
    for line in text.splitlines():
        left, separator, right = line.partition(' - ')
        parts, fs = left.split(), right.split()
        if separator and len(parts) >= 5 and len(fs) >= 3 and fs[0] in ('cgroup', 'cgroup2'):
            mounts.append({'root': unescape(parts[3]), 'target': unescape(parts[4]),
                           'type': fs[0], 'controllers': fs[2].split(',')})
    return mounts


def cgroups(pid):
    membership = read(f'/proc/{pid}/cgroup')
    if not isinstance(membership, str):
        return membership
    groups = []
    mounts = cgroup_mounts(read('/proc/self/mountinfo'))
    for line in membership.splitlines():
        _, controllers, location = line.split(':', 2)
        requested = [('unified', CGV2)] if not controllers else [(c, f) for c, f in CGV1.items() if c in controllers.split(',')]
        for controller, files in requested:
            version = 2 if controller == 'unified' else 1
            candidates = [m for m in mounts if m['type'] == ('cgroup2' if version == 2 else 'cgroup')
                          and (version == 2 or controller in m['controllers'])
                          and Path(location).is_relative_to(m['root'])]
            if not candidates:
                groups.append({'version': version, 'controller': controller, 'error': 'CGROUP_MOUNT_NOT_FOUND'})
                continue
            # Prefer a complete hierarchy over a delegated/bind-mounted subtree.
            mount = max(candidates, key=lambda m: (m['root'] == '/', len(m['root'])))
            base = Path(mount['target'])
            relative = '/' + str(Path(location).relative_to(mount['root']))
            paths, reached_mount = ancestor_paths(base, relative)
            complete = reached_mount and mount['root'] == '/'
            levels = [{'levelFromLeaf': i, 'isHierarchyRoot': complete and path == base.resolve(),
                       'files': {name: read(path / name) for name in files}}
                      for i, path in enumerate(paths)]
            group = {'version': version, 'controller': controller, 'visibleAncestorsComplete': complete,
                     'mountRoot': mount['root'], 'mountPoint': mount['target'], 'levels': levels}
            if version == 2:
                group['limits'] = v2_limit_summary(levels, complete)
            else:
                group['limitSemantics'] = 'Use memory.use_hierarchy/hierarchical_memory_limit; large v1 limits may be an unlimited sentinel.'
            groups.append(group)
    return groups


def diskstats():
    text = read('/proc/diskstats')
    if not isinstance(text, str):
        return text
    result = {}
    names = ('reads', 'readsMerged', 'sectorsRead', 'readMs', 'writes', 'writesMerged',
             'sectorsWritten', 'writeMs', 'inFlight', 'ioMs', 'weightedIoMs')
    for line in text.splitlines():
        parts = line.split()
        if len(parts) >= 14 and not parts[2].startswith(('loop', 'ram')):
            result[parts[0] + ':' + parts[1]] = {'name': parts[2], **dict(zip(names, map(int, parts[3:14])))}
    return result


def snapshot(pid):
    before = process_stat(pid)
    vm = key_values(read('/proc/vmstat'))
    sample = {'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'monotonic': time.monotonic(),
              'hostMemory': byte_fields(read('/proc/meminfo'), MEM_KEYS),
              'vmCounters': {k: v for k, v in vm.items() if k in VM_COUNTERS} if vm is not None else None,
              'pressure': {name: read('/proc/pressure/' + name) for name in ('cpu', 'memory', 'io')},
              'processStatus': byte_fields(read(f'/proc/{pid}/status'),
                                          {'VmSize', 'VmRSS', 'RssAnon', 'RssFile', 'RssShmem', 'VmSwap', 'VmLck', 'Threads'}),
              'smapsRollup': byte_fields(read(f'/proc/{pid}/smaps_rollup'), SMAPS_KEYS),
              'smaps': parse_smaps(read(f'/proc/{pid}/smaps')),
              'cgroups': cgroups(pid), 'diskstats': diskstats(), 'processCounters': before}
    after = process_stat(pid)
    sample['sameProcessDuringRead'] = 'startTicks' in before and before.get('startTicks') == after.get('startTicks')
    return sample


def counter_delta(before, after):
    if not isinstance(before, dict) or not isinstance(after, dict):
        return None
    return {key: value - before[key] for key, value in after.items()
            if type(value) is int and type(before.get(key)) is int and value >= before[key]}


def disk_deltas(before, after, seconds):
    if not isinstance(before, dict) or not isinstance(after, dict) or 'error' in before or 'error' in after or seconds <= 0:
        return None
    result = {}
    for device in before.keys() & after.keys():
        if not isinstance(before[device], dict) or not isinstance(after[device], dict):
            continue
        delta = counter_delta(before[device], after[device])
        delta.pop('inFlight', None)  # A point-in-time gauge, not a monotonic counter.
        if not delta or any(key not in delta for key in ('reads', 'readMs', 'sectorsRead', 'ioMs', 'weightedIoMs')):
            continue
        result[device] = {'name': after[device]['name'], 'counterDeltas': delta,
                          'readBytesPerSecond': delta['sectorsRead'] * 512 / seconds,
                          'readAwaitMs': delta['readMs'] / delta['reads'] if delta['reads'] else None,
                          'busyPercentApprox': delta['ioMs'] / (seconds * 10),
                          'averageQueueDepthApprox': delta['weightedIoMs'] / (seconds * 1000)}
    return result


def docker_reader(config):
    binary = next((str(p) for p in (Path('/usr/bin/docker'), Path('/usr/local/bin/docker')) if p.is_file()), None)
    if binary is None:
        raise ValueError('DOCKER_NOT_FOUND')
    def command(*args):
        # Explicit local socket + new empty config. Never read inherited Docker settings or credentials.
        result = subprocess.run([binary, '--config', config, '--host', 'unix:///var/run/docker.sock', *args],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=8,
                                env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'})
        if result.returncode:
            raise ValueError('DOCKER_READ_FAILED')
        return result.stdout
    return command


def capture(container, interval=5, report=None):
    if report is None:
        report = {}
    report.update({'schema': 1, 'kind': 'read-only-residency', 'container': container,
              'generationRequests': 0, 'networkRequestsToModel': 0, 'serverChanges': 0,
              'samples': [], 'observedScope': 'Two passive snapshots; background activity may exist. No attribution to the historical timeout is assumed.'})
    with tempfile.TemporaryDirectory(prefix='queen-empty-docker-config-', dir='/tmp') as config:
        docker = docker_reader(config)
        template = '{' + ','.join(json.dumps(k) + ':{{json ' + v + '}}' for k, v in DOCKER_FIELDS.items()) + '}'
        report['dockerBefore'] = json.loads(docker('inspect', '--format', template, container))
        pids = []
        for line in docker('top', container, '-eo', 'pid,comm').splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[0].isdigit() and parts[1] in ('llama-server', 'server'):
                pids.append(int(parts[0]))
        if len(pids) != 1:
            report.update({'selectionError': 'EXPECTED_ONE_LLAMA_SERVER', 'candidateCount': len(pids), 'identityStable': False})
            return report
        pid = pids[0]
        report['hostPid'] = pid
        report['samples'].append(snapshot(pid))
        time.sleep(interval)
        report['samples'].append(snapshot(pid))
        report['dockerAfter'] = json.loads(docker('inspect', '--format', template, container))
        a, b = report['samples']
        stable = all(s['sameProcessDuringRead'] for s in (a, b)) and a['processCounters'].get('startTicks') == b['processCounters'].get('startTicks')
        stable = stable and all(report['dockerBefore'].get(key) == report['dockerAfter'].get(key)
                                for key in ('initPid', 'startedAt', 'imageId', 'restartCount'))
        report['identityStable'] = stable
        seconds = b['monotonic'] - a['monotonic']
        report['observedSecondsBetweenSampleStarts'] = seconds
        faults = {k: v for k, v in counter_delta(a['processCounters'], b['processCounters']).items()
                  if k in ('minorFaults', 'majorFaults')} if stable else None
        report['deltas'] = {'hostVm': counter_delta(a['vmCounters'], b['vmCounters']),
                            'processFaults': faults,
                            'disk': disk_deltas(a['diskstats'], b['diskstats'], seconds)}
        report['limitations'] = ['KV/compute/cache attribution is unknown from OS mappings.',
                                'GGUF RSS or zero passive refaults alone cannot prove behavior during generation.',
                                'No GGUF-name mappings does not mean weights are absent: opaque cache filenames may appear in largeFileMappings; no model file contents are read.',
                                'Cgroup ancestor usage can include other workloads; disk counters are host/device-wide.',
                                'Disk busy/queue/await are approximate interval aggregates; absent values are unknown.',
                                'Cgroup raw counters in both snapshots permit refault, event and I/O comparisons; errors are not unlimited/zero.']
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', default='prisma-neural-qwen')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', args.container):
        parser.error('Invalid container name')
    def timeout(*_):
        raise CaptureDeadline()
    report, exit_code = {}, 0
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(45)
    try:
        report = capture(args.container, report=report)
    except Exception as exc:
        report.update({'kind': 'read-only-residency', 'generationRequests': 0,
                       'captureError': type(exc).__name__, 'complete': False})
        exit_code = 2
    finally:
        signal.alarm(0)
    print(json.dumps(report, indent=2, allow_nan=False))
    return exit_code


if __name__ == '__main__':
    raise SystemExit(main())
