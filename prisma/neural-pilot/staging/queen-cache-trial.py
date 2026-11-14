#!/usr/bin/env python3
"""Approved single local Queen cache trial. No installs, image pulls or model changes."""


"""Pure, conservative Compose/live-container gate. Never print configuration."""
import shlex
import re
from decimal import Decimal, localcontext


class TrialGuardError(Exception):
    def __init__(self, code, unsupported_service_keys=None):
        super().__init__(code)
        self.safe_details = {}
        if unsupported_service_keys is not None:
            names = sorted({key if isinstance(key, str) and re.fullmatch(r'[a-z][a-z0-9_]{0,63}', key)
                            else 'redacted-key' for key in unsupported_service_keys})
            self.safe_details = {'unsupportedServiceKeys': names[:32]}


def _require(condition, code):
    if not condition:
        raise TrialGuardError(code)


def _argv(value):
    if value is None:
        return []
    if isinstance(value, str):
        return shlex.split(value)
    _require(isinstance(value, list) and all(isinstance(x, str) for x in value), 'COMMAND_FORMAT')
    return value


def _env(value):
    if value is None:
        return {}
    if isinstance(value, dict):
        _require(all(isinstance(k, str) and (v is None or isinstance(v, str)) for k, v in value.items()), 'ENV_FORMAT')
        return dict(value)
    _require(isinstance(value, list), 'ENV_FORMAT')
    result = {}
    for item in value:
        _require(isinstance(item, str) and '=' in item, 'ENV_FORMAT')
        key, val = item.split('=', 1)
        _require(key not in result, 'ENV_DUPLICATE')
        result[key] = val
    return result


def _duration_ns(value):
    if value is None:
        return 0
    if type(value) is int:
        _require(0 <= value <= 2**63 - 1, 'HEALTHCHECK_FORMAT')
        return value
    _require(isinstance(value, str) and len(value) <= 128, 'HEALTHCHECK_FORMAT')
    if value == '0':
        return 0
    part = r'([0-9]+(?:\.[0-9]*)?|\.[0-9]+)(ns|us|ms|s|m|h)'
    _require(re.fullmatch('(?:' + part + ')+', value) is not None, 'HEALTHCHECK_FORMAT')
    units = {'ns': 1, 'us': 1000, 'ms': 1000000, 's': 1000000000, 'm': 60000000000, 'h': 3600000000000}
    with localcontext() as context:
        context.prec = 256
        total = sum((Decimal(number) * units[unit] for number, unit in re.findall(part, value)), Decimal(0))
    _require(0 <= total <= 2**63 - 1 and total == total.to_integral_value(), 'HEALTHCHECK_FORMAT')
    return int(total)


def _health_test(value, shell_string=False):
    if value is None:
        return []
    if isinstance(value, str) and shell_string:
        return ['CMD-SHELL', value]
    _require(isinstance(value, list) and all(isinstance(item, str) for item in value), 'HEALTHCHECK_FORMAT')
    _require(not value or (value[0] == 'NONE' and len(value) == 1) or
             (value[0] == 'CMD-SHELL' and len(value) == 2) or
             (value[0] == 'CMD' and len(value) >= 2), 'HEALTHCHECK_FORMAT')
    return value


def _image_health(value):
    value = {} if value is None else value
    fields = {'Interval', 'Timeout', 'StartPeriod', 'StartInterval', 'Retries'}
    _require(isinstance(value, dict) and not (set(value) - fields - {'Test'}), 'HEALTHCHECK_FORMAT')
    result = {'Test': _health_test(value.get('Test'))}
    for key in fields:
        number = value.get(key, 0)
        _require(type(number) is int and 0 <= number <= 2**63 - 1, 'HEALTHCHECK_FORMAT')
        result[key] = number
    return result


def _healthcheck(service, live, image):
    expected = _image_health(image.get('Healthcheck'))
    health = service.get('healthcheck')
    if health is not None:
        _require(isinstance(health, dict) and not (set(health) - {'test', 'disable', 'interval', 'timeout', 'start_period', 'start_interval', 'retries'}), 'HEALTHCHECK_FORMAT')
        _require(type(health.get('disable', False)) is bool, 'HEALTHCHECK_FORMAT')
        test = ['NONE'] if health.get('disable') else _health_test(health.get('test'), shell_string=True)
        # Compose config preserves escaped dollars; the Engine receives one
        # unescape pass. Never alter the frozen source or native image test.
        test = [part.replace('$$', '$') for part in test]
        if test:
            expected['Test'] = test
        for key, field in (('interval', 'Interval'), ('timeout', 'Timeout'), ('start_period', 'StartPeriod'), ('start_interval', 'StartInterval')):
            value = _duration_ns(health.get(key))
            if value:
                expected[field] = value
        retries = health.get('retries', 0)
        _require(type(retries) is int and 0 <= retries <= 2**31 - 1, 'HEALTHCHECK_FORMAT')
        if retries:
            expected['Retries'] = retries
    _require(expected == _image_health(live.get('Healthcheck')), 'HEALTHCHECK')


def _guard(config, container, image, live_argv):
    service = config['services']['qwen']
    allowed = {'image', 'platform', 'container_name', 'init', 'restart', 'environment', 'command', 'entrypoint',
               'ports', 'volumes', 'cpus', 'stop_grace_period', 'networks', 'working_dir', 'user', 'labels', 'healthcheck'}
    _require(isinstance(service, dict), 'UNSUPPORTED_SERVICE_SETTINGS')
    if set(service) - allowed:
        raise TrialGuardError('UNSUPPORTED_SERVICE_SETTINGS', set(service) - allowed)
    live, host, base = container['Config'], container['HostConfig'], image['Config']
    _require(container['Image'] == image['Id'], 'IMAGE_ID')
    references = {image['Id'], live.get('Image'), *(image.get('RepoTags') or []), *(image.get('RepoDigests') or [])}
    _require(service.get('image') in references, 'IMAGE_REFERENCE')
    platform = image.get('Os', 'linux') + '/' + image.get('Architecture', 'amd64')
    _require(service.get('platform', platform) == platform, 'PLATFORM')
    _require(service.get('container_name') == container['Name'].lstrip('/'), 'CONTAINER_NAME')
    entrypoint = service.get('entrypoint')
    command = service.get('command')
    expected_entrypoint = base.get('Entrypoint') if entrypoint is None else entrypoint
    expected_command = base.get('Cmd') if command is None and entrypoint is None else command
    _require(_argv(expected_entrypoint) == _argv(live.get('Entrypoint')), 'ENTRYPOINT')
    _require(_argv(expected_command) == _argv(live.get('Cmd')), 'COMMAND')
    expected_env = _env(base.get('Env'))
    for key, value in _env(service.get('environment')).items():
        if value is None:
            expected_env.pop(key, None)
        else:
            # Compose config escapes dollars; native image/Engine Env does not.
            expected_env[key] = value.replace('$$', '$')
    _require(expected_env == _env(live.get('Env')), 'ENVIRONMENT')
    _require(service.get('user', base.get('User') or '') == (live.get('User') or ''), 'USER')
    _require(service.get('working_dir', base.get('WorkingDir') or '') == (live.get('WorkingDir') or ''), 'WORKING_DIR')
    _require(bool(service.get('init', False)) == bool(host.get('Init', False)), 'INIT')
    _require(host.get('RestartPolicy', {}).get('Name', 'no') == service.get('restart', 'no') and
             host.get('RestartPolicy', {}).get('MaximumRetryCount', 0) == 0, 'RESTART')
    _require(service.get('stop_grace_period') in ('60s', '1m', '1m0s', '1m0.0s') and live.get('StopTimeout') == 60, 'STOP_GRACE')
    _require((live.get('StopSignal') or '') == (base.get('StopSignal') or ''), 'STOP_SIGNAL')
    _healthcheck(service, live, base)
    _require(abs(float(service.get('cpus', 0)) * 1_000_000_000 - host.get('NanoCpus', 0)) < 1, 'CPU_LIMIT')
    for name in ('CpuQuota', 'CpuPeriod', 'CpuShares', 'CpuRealtimePeriod', 'CpuRealtimeRuntime', 'Memory', 'MemoryReservation', 'MemorySwap', 'KernelMemory'):
        _require(host.get(name, 0) in (0, None), 'RESOURCE_LIMITS')
    _require(not host.get('CpusetCpus') and not host.get('CpusetMems') and not host.get('OomKillDisable') and
             container.get('OomScoreAdj', host.get('OomScoreAdj', 0)) == 0, 'RESOURCE_LIMITS')
    for name in ('ReadonlyRootfs', 'Privileged', 'CapAdd', 'CapDrop', 'SecurityOpt', 'GroupAdd', 'Devices', 'DeviceRequests', 'VolumesFrom', 'Tmpfs'):
        _require(not host.get(name), 'SECURITY_SETTINGS')
    _require(host.get('PidMode', '') == '' and host.get('IpcMode', 'private') == 'private' and
             host.get('UTSMode', '') == '' and not host.get('UsernsMode'), 'NAMESPACE_SETTINGS')
    labels = dict(base.get('Labels') or {})
    custom = service.get('labels') or {}
    _require(isinstance(custom, dict) and not any(k.startswith('com.docker.compose.') for k in custom), 'LABELS')
    labels.update(custom)
    actual_labels = {k: v for k, v in (live.get('Labels') or {}).items() if not k.startswith('com.docker.compose.')}
    _require(labels == actual_labels, 'LABELS')
    mounts = []
    for mount in service.get('volumes', []):
        _require(isinstance(mount, dict) and not (set(mount) - {'type', 'source', 'target', 'read_only', 'bind'}), 'MOUNT_FORMAT')
        _require(mount.get('type') == 'bind' and not (set(mount.get('bind') or {}) - {'create_host_path', 'propagation'}), 'MOUNT_FORMAT')
        mounts.append(('bind', mount['source'], mount['target'], not mount.get('read_only', False),
                       (mount.get('bind') or {}).get('propagation', 'rprivate')))
    actual_mounts = [(m['Type'], m['Source'], m['Destination'], m['RW'], m.get('Propagation', 'rprivate')) for m in container.get('Mounts', [])]
    _require(sorted(mounts) == sorted(actual_mounts), 'MOUNTS')
    ports = []
    for port in service.get('ports', []):
        _require(isinstance(port, dict) and not (set(port) - {'target', 'published', 'host_ip', 'protocol', 'mode'}) and port.get('mode', 'ingress') == 'ingress', 'PORT_FORMAT')
        ports.append((str(port['target']) + '/' + port.get('protocol', 'tcp'), port.get('host_ip', '0.0.0.0'), str(port['published'])))
    bound = [(key, p['HostIp'], p['HostPort']) for key, values in (host.get('PortBindings') or {}).items() for p in (values or [])]
    published = [(key, p['HostIp'], p['HostPort']) for key, values in (container.get('NetworkSettings', {}).get('Ports') or {}).items() for p in (values or [])]
    _require(sorted(ports) == sorted(bound) == sorted(published) == [('7860/tcp', '127.0.0.1', '7860')], 'PORT_BINDINGS')
    networks = service.get('networks') or {'default': None}
    _require(isinstance(networks, dict), 'NETWORK_FORMAT')
    expected_networks = {}
    for key, options in networks.items():
        network = config.get('networks', {}).get(key, {})
        _require(not (set(network) - {'name', 'external', 'ipam'}) and network.get('ipam') in (None, {}), 'NETWORK_SETTINGS')
        _require(isinstance(network.get('name'), str), 'NETWORK_NAME')
        options = options or {}
        _require(not (set(options) - {'aliases', 'ipv4_address', 'ipv6_address'}), 'NETWORK_SETTINGS')
        expected_networks[network['name']] = options
    actual_networks = container.get('NetworkSettings', {}).get('Networks') or {}
    _require(set(expected_networks) == set(actual_networks), 'NETWORKS')
    _require(host.get('NetworkMode') in expected_networks, 'NETWORK_MODE')
    for name, options in expected_networks.items():
        network = actual_networks[name]
        _require(all(alias in (network.get('Aliases') or []) for alias in options.get('aliases', [])), 'NETWORK_ALIASES')
        for key, actual in (('ipv4_address', 'IPAddress'), ('ipv6_address', 'GlobalIPv6Address')):
            _require(not options.get(key) or options[key] == network.get(actual), 'NETWORK_ADDRESS')
    _require(isinstance(live_argv, list) and live_argv and all(isinstance(a, str) for a in live_argv), 'LIVE_ARGV_FORMAT')
    cache = {'--cache-ram', '-cram', '--ctx-checkpoints', '--swa-checkpoints', '-ctxcp'}
    private = {'--api-key', '--api-key-file', '--hf-token', '--prompt', '-p', '--file', '-f', '--model', '-m', '--hf-repo', '-hf', '--hf-file', '--grammar', '--grammar-file', '--json-schema', '--jinja-file', '--chat-template', '--chat-template-file', '--system-prompt', '--system-prompt-file'}
    i = 1
    while i < len(live_argv):
        option, separator, _ = live_argv[i].partition('=')
        if option in private:
            i += 1 if separator else 2
            continue
        _require(option not in cache, 'CLI_CACHE_OVERRIDE')
        i += 1


def guard_trial(config, container, image, live_argv):
    """Return None for a supported exact baseline; raise only fixed safe codes."""
    try:
        _guard(config, container, image, live_argv)
    except TrialGuardError:
        raise
    except Exception:
        raise TrialGuardError('MALFORMED_BASELINE') from None


"""Private, sampled trial metrics; no prompts, environment or model requests."""
import json
import os
from pathlib import Path
import re
import threading
import time


def _trial_read(path):
    try:
        with Path(path).open() as source:
            value = source.read(262145)
        return value if len(value) <= 262144 else None
    except (OSError, ValueError):
        return None


def _trial_values(text):
    if text is None:
        return {}
    result = {}
    for line in text.splitlines():
        fields = line.replace(':', ' ').split()
        if len(fields) > 1 and fields[1].isdigit():
            result[fields[0]] = int(fields[1])
    return result


def _trial_cgroup(pid):
    membership = _trial_read('/proc/' + str(pid) + '/cgroup') if type(pid) is int and pid > 0 else None
    location = next((line[3:] for line in (membership or '').splitlines() if line.startswith('0::')), None)
    if not location or not location.startswith('/') or '..' in Path(location).parts:
        return {}
    base = Path('/sys/fs/cgroup').resolve()
    target = (base / location.lstrip('/')).resolve()
    if not target.is_relative_to(base):
        return {}
    def scalar(name):
        value = _trial_read(target / name)
        return int(value.strip()) if value is not None and value.strip().isdigit() else None
    io = _trial_read(target / 'io.stat')
    devices = {}
    for line in (io or '').splitlines():
        parts = line.split()
        if parts and re.fullmatch(r'\d+:\d+', parts[0]):
            fields = dict(p.split('=', 1) for p in parts[1:] if '=' in p)
            devices[parts[0]] = {k: int(fields[k]) if fields.get(k, '').isdigit() else None for k in ('rbytes', 'wbytes')}
    memory = _trial_values(_trial_read(target / 'memory.stat'))
    events = _trial_values(_trial_read(target / 'memory.events'))
    return {'memoryBytes': scalar('memory.current'), 'swapBytes': scalar('memory.swap.current'),
            'anonBytes': memory.get('anon'), 'fileBytes': memory.get('file'),
            'events': {k: events.get(k) for k in ('oom', 'oom_kill', 'high', 'max')},
            'cpuUsageUsec': _trial_values(_trial_read(target / 'cpu.stat')).get('usage_usec'),
            'ioDevices': devices if io is not None else None}


def _trial_delta(a, b):
    return b - a if type(a) is int and type(b) is int and b >= a else None


def _trial_extreme(rows, key, operation=max):
    values = [r[key] for r in rows if isinstance(r.get(key), (int, float))]
    return operation(values) if values else None


class TrialSampler:
    def __init__(self, inspect_container, output_path):
        self.inspect_container, self.output_path = inspect_container, Path(output_path)
        self.phase, self.samples, self.write_failed = 'before', [], False
        self._event, self._thread, self._fd = threading.Event(), None, None
        self._lock, self._close_on_exit, self._final_sample = threading.Lock(), False, False

    def _sample(self, final=False):
        with self._lock:
            self._sample_locked(final)

    def _sample_locked(self, final=False):
        row = {'monotonic': time.monotonic(), 'phase': self.phase if self.phase in ('before', 'startup', 'probe', 'after') else None}
        mem = _trial_values(_trial_read('/proc/meminfo'))
        row.update({'hostMemTotalBytes': mem.get('MemTotal', 0) * 1024 if 'MemTotal' in mem else None,
                    'hostMemAvailableBytes': mem.get('MemAvailable', 0) * 1024 if 'MemAvailable' in mem else None,
                    'hostSwapTotalBytes': mem.get('SwapTotal', 0) * 1024 if 'SwapTotal' in mem else None,
                    'hostSwapUsedBytes': (mem['SwapTotal'] - mem['SwapFree']) * 1024 if 'SwapTotal' in mem and 'SwapFree' in mem and mem['SwapTotal'] >= mem['SwapFree'] else None})
        vm = _trial_values(_trial_read('/proc/vmstat'))
        row['hostVm'] = {k: vm.get(k) for k in ('oom_kill', 'pgmajfault', 'pswpin', 'pswpout')}
        cpu = next((line.split()[1:9] for line in (_trial_read('/proc/stat') or '').splitlines() if line.startswith('cpu ')), [])
        row['hostCpu'] = list(map(int, cpu)) if len(cpu) == 8 and all(v.isdigit() for v in cpu) else None
        row.update({'inspectAvailable': False, 'container': None})
        try:
            obj = self.inspect_container()
            if isinstance(obj, list) and len(obj) == 1:
                obj = obj[0]
            state = obj.get('State', {})
            cid = obj.get('Id')
            if not isinstance(cid, str) or not re.fullmatch(r'[a-f0-9]{64}', cid):
                raise ValueError()
            container = {'id': cid, 'running': state.get('Running') if type(state.get('Running')) is bool else None,
                         'oomKilled': state.get('OOMKilled') if type(state.get('OOMKilled')) is bool else None,
                         'restarting': state.get('Restarting') if type(state.get('Restarting')) is bool else None,
                         'restartCount': obj.get('RestartCount') if type(obj.get('RestartCount')) is int and obj['RestartCount'] >= 0 else None}
            container.update(_trial_cgroup(state.get('Pid')))
            row.update({'inspectAvailable': True, 'container': container})
        except Exception:
            pass  # Full Docker errors/configuration can contain secrets; never serialize them.
        if self._event.is_set() and not final:
            return
        self.samples.append(row)
        try:
            os.write(self._fd, (json.dumps(row, allow_nan=False) + '\n').encode())
        except (OSError, TypeError, ValueError):
            self.write_failed = True

    def start(self):
        if self._thread is not None or self._fd is not None:
            raise RuntimeError('SAMPLER_ALREADY_STARTED')
        self.output_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self._fd = os.open(self.output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        self._sample()  # Immediate baseline; no passive waiting period.
        def loop():
            try:
                while not self._event.wait(2):
                    self._sample()
            finally:
                if self._close_on_exit:
                    self._close_file()
        self._thread = threading.Thread(target=loop, name='queen-trial-metrics', daemon=True)
        self._thread.start()
        return self

    def _close_file(self):
        with self._lock:
            if self._fd is not None:
                os.close(self._fd)
                self._fd = None

    def stop(self):
        self._event.set()
        if self._thread is not None:
            self._thread.join(timeout=8)
        if self._thread is not None and self._thread.is_alive():
            self._close_on_exit = True
            if not self._thread.is_alive():
                self._close_file()
        elif self._fd is not None:
            # Caller supplies a bounded (4s) inspect callback. No passive wait:
            # take one serialized, fresh final snapshot, then close safely.
            try:
                self._sample(final=True)
                self._final_sample = True
            finally:
                self._close_file()
        rows = list(self.samples)
        host_cpu, host_io = [], []
        for a, b in zip(rows, rows[1:]):
            if a['hostCpu'] is not None and b['hostCpu'] is not None:
                parts = [_trial_delta(x, y) for x, y in zip(a['hostCpu'], b['hostCpu'])]
                if all(v is not None for v in parts) and sum(parts) > 0:
                    host_cpu.append(100 * (sum(parts) - parts[3] - parts[4]) / sum(parts))
                    host_io.append(100 * parts[4] / sum(parts))
        by_id = {}
        for row in rows:
            c = row.get('container')
            if c is not None:
                by_id.setdefault(c['id'], []).append({**c, 'monotonic': row['monotonic']})
        containers = []
        for cid, seen in by_id.items():
            first, last, cpu = seen[0], seen[-1], []
            for a, b in zip(seen, seen[1:]):
                delta = _trial_delta(a.get('cpuUsageUsec'), b.get('cpuUsageUsec'))
                seconds = b['monotonic'] - a['monotonic']
                if delta is not None and seconds > 0 and a.get('restartCount') == b.get('restartCount'):
                    cpu.append(100 * delta / (seconds * 1000000))
            stable_restarts = first.get('restartCount') is not None and all(c.get('restartCount') == first['restartCount'] for c in seen)
            events = {k: _trial_delta(first.get('events', {}).get(k), last.get('events', {}).get(k)) if len(seen) > 1 and stable_restarts else None for k in ('oom', 'oom_kill', 'high', 'max')}
            device_deltas = {}
            if len(seen) > 1 and stable_restarts and first.get('ioDevices') is not None and last.get('ioDevices') is not None:
                for device in first['ioDevices'].keys() | last['ioDevices'].keys():
                    device_deltas[device] = {k: _trial_delta(first['ioDevices'].get(device, {}).get(k), last['ioDevices'].get(device, {}).get(k)) for k in ('rbytes', 'wbytes')}
            oom = True if any(c.get('oomKilled') is True for c in seen) or any((events[k] or 0) > 0 for k in ('oom', 'oom_kill')) else False if len(seen) > 1 and stable_restarts and all(c.get('oomKilled') is False and all(c.get('events', {}).get(k) is not None for k in ('oom', 'oom_kill')) for c in seen) and all(events[k] is not None for k in ('oom', 'oom_kill')) else None
            containers.append({'id': cid, 'samples': len(seen), 'memoryPeakBytes': _trial_extreme(seen, 'memoryBytes'),
                               'memorySamples': sum(type(c.get('memoryBytes')) is int for c in seen), 'cpuIntervals': len(cpu),
                               'swapPeakBytes': _trial_extreme(seen, 'swapBytes'), 'anonPeakBytes': _trial_extreme(seen, 'anonBytes'),
                               'cpuPercentOfOneCoreMax': max(cpu) if cpu else None, 'ioDeviceDeltas': device_deltas or None,
                               'memoryEventsDelta': events, 'oomObservedWithinCoverage': oom,
                               'unexpectedRestartDelta': _trial_delta(first.get('restartCount'), last.get('restartCount')) if len(seen) > 1 else None})
        return {'samples': len(rows), 'inspectSamples': sum(r['inspectAvailable'] for r in rows),
                'finalSampleCaptured': self._final_sample,
                'hostMemorySamples': sum(type(r.get('hostMemAvailableBytes')) is int for r in rows), 'hostCpuIntervals': len(host_cpu),
                'samplerStillRunning': self._thread.is_alive() if self._thread else False, 'sampleWriteFailed': self.write_failed,
                'hostMemAvailableMinBytes': _trial_extreme(rows, 'hostMemAvailableBytes', min),
                'hostSwapUsedMaxBytes': _trial_extreme(rows, 'hostSwapUsedBytes'),
                'hostCpuBusyPercentMax': max(host_cpu) if host_cpu else None,
                'hostIowaitPercentMax': max(host_io) if host_io else None,
                'hostVmDelta': {k: _trial_delta(rows[0]['hostVm'][k], rows[-1]['hostVm'][k]) if len(rows) > 1 else None for k in ('oom_kill', 'pgmajfault', 'pswpin', 'pswpout')},
                'containers': containers,
                'coverageMeaning': 'Peaks/minima are sampled extrema, not guaranteed continuous maxima/minima. No continuous absence guarantees. Unknown is null. Container counters never bridge different IDs. IO deltas are per device; do not sum stacked devices as physical bytes. Host CPU busy excludes iowait, reported separately.'}


#!/usr/bin/env python3
"""Manual local VPS probe: one tiny completion, no tuning or secret output."""
import argparse
from contextlib import contextmanager
import datetime
import json
import signal
import subprocess
import time
import urllib.request

PROBE_TIMEOUT = 100
REQUEST_TIMEOUT = 5
GENERATION_TIMEOUT = 55


class WallDeadlineExceeded(Exception):
    """Stay outside OSError so urllib cannot wrap a wall deadline as a URL error."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('LOCAL_REDIRECT_BLOCKED')


@contextmanager
def wall_deadline(seconds, code):
    """Bound a scope without extending an enclosing absolute SIGALRM deadline."""
    now = time.monotonic()
    previous_handler = signal.getsignal(signal.SIGALRM)
    previous_delay, previous_interval = signal.getitimer(signal.ITIMER_REAL)
    previous_deadline = now + previous_delay if previous_delay > 0 else None
    expires = now + seconds

    def expired(*_):
        raise WallDeadlineExceeded(code)

    handler = expired
    if previous_deadline is not None and previous_deadline <= expires:
        expires = previous_deadline
        handler = previous_handler
    signal.signal(signal.SIGALRM, handler)
    signal.setitimer(signal.ITIMER_REAL, max(expires - time.monotonic(), 0.000001))
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous_handler)
        if previous_deadline is not None:
            remaining = previous_deadline - time.monotonic()
            if remaining > 0:
                signal.setitimer(signal.ITIMER_REAL, remaining, previous_interval)


def request(opener, key, path, body=None, timeout=REQUEST_TIMEOUT,
            deadline_code='REQUEST_DEADLINE'):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request('http://127.0.0.1:7860' + path, data=data,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    # A socket timeout alone can be renewed by a server that keeps dribbling bytes.
    with wall_deadline(timeout, deadline_code):
        with opener.open(req, timeout=timeout) as response:
            data = response.read(65537)
        if len(data) > 65536:
            raise ValueError('RESPONSE_LIMIT')
        return data.decode()


def queue_snapshot(opener, key):
    try:
        metrics = request(opener, key, '/metrics', timeout=REQUEST_TIMEOUT)
        values = {}
        for line in metrics.splitlines():
            if not line or line.startswith('#'):
                continue
            parts = line.split()
            name = parts[0].split('{')[0]
            if any(term in name.lower() for term in ('requests_processing', 'requests_deferred', 'queue')):
                try:
                    values.setdefault(name, []).append(float(parts[1]))
                except (IndexError, ValueError):
                    pass
        return {'metricsAvailable': True, 'counters': values or None}
    except Exception as exc:
        if isinstance(exc, WallDeadlineExceeded) and str(exc) == 'PROBE_DEADLINE':
            raise
        error_type = 'TimeoutError' if isinstance(exc, WallDeadlineExceeded) else type(exc).__name__
        return {'metricsAvailable': False, 'errorType': error_type,
                'httpStatus': getattr(exc, 'code', None), 'counters': None}


def run_probe(container):
    report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'completionAttempted': False, 'usage': None, 'timings': None}
    try:
        with wall_deadline(PROBE_TIMEOUT, 'PROBE_DEADLINE'):
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
            # Existing local credential stays in memory; no environment values are printed.
            env = trial_inspect(container)['Config']['Env']
            key = next((item.split('=', 1)[1] for item in env if item.startswith('LLAMA_API_KEY=')), '')
            if not key:
                raise ValueError('LOCAL_API_KEY_UNAVAILABLE')
            slots = json.loads(request(opener, key, '/slots', timeout=REQUEST_TIMEOUT))
            if not isinstance(slots, list) or len(slots) != 1 or slots[0].get('is_processing') is not False:
                raise ValueError('SLOT_BUSY_OR_STATE_UNKNOWN')
            models = json.loads(request(opener, key, '/v1/models', timeout=REQUEST_TIMEOUT)).get('data', [])
            if len(models) != 1 or not models[0].get('id'):
                raise ValueError('MODEL_ID_UNAVAILABLE_OR_AMBIGUOUS')
            report['queueBefore'] = queue_snapshot(opener, key)
            report['model'] = models[0]['id']
            started = time.monotonic()
            report['completionAttempted'] = True
            try:
                with wall_deadline(GENERATION_TIMEOUT, 'GENERATION_DEADLINE'):
                    result = json.loads(request(opener, key, '/v1/chat/completions', {
                        'model': models[0]['id'], 'messages': [{'role': 'user', 'content': 'Responde: OK'}],
                        'temperature': 0, 'max_tokens': 8, 'stream': False,
                        'chat_template_kwargs': {'enable_thinking': False}}, timeout=GENERATION_TIMEOUT,
                        deadline_code='GENERATION_DEADLINE'))
                    if not result.get('choices'):
                        raise ValueError('COMPLETION_RESPONSE_MISSING')
                    report['outcome'] = 'response-received'
                    report['usage'] = {k: result.get('usage', {}).get(k)
                                       for k in ('prompt_tokens', 'completion_tokens', 'total_tokens')}
                    report['timings'] = {k: result.get('timings', {}).get(k)
                                        for k in ('prompt_n', 'prompt_ms', 'prompt_per_second',
                                                  'predicted_n', 'predicted_ms', 'predicted_per_second')}
                    report['finishReason'] = result['choices'][0].get('finish_reason')
            finally:
                report['elapsedMs'] = round((time.monotonic() - started) * 1000)
            report['queueAfter'] = queue_snapshot(opener, key)
    except Exception as exc:
        report.setdefault('outcome', 'unknown' if report['completionAttempted'] else 'not-attempted')
        report['errorType'] = 'TimeoutError' if isinstance(exc, WallDeadlineExceeded) else type(exc).__name__
        report['httpStatus'] = getattr(exc, 'code', None)
        known = {'RESPONSE_LIMIT', 'LOCAL_API_KEY_UNAVAILABLE', 'SLOT_BUSY_OR_STATE_UNKNOWN',
                 'MODEL_ID_UNAVAILABLE_OR_AMBIGUOUS', 'COMPLETION_RESPONSE_MISSING',
                 'GENERATION_DEADLINE', 'REQUEST_DEADLINE', 'PROBE_DEADLINE', 'LOCAL_REDIRECT_BLOCKED'}
        report['code'] = str(exc) if str(exc) in known else None
    report['ttftMs'] = None  # Non-streaming probe: do not invent a TTFT.
    return report



import argparse
import copy
import fcntl
import http.client
import os
import stat
import sys
import uuid
from pathlib import Path

TRIAL_ROOT = Path('/root/queen-cache-trial-20261113')
TRIAL_IMAGE = 'sha256:998e17af1ae710081e5a6e6db962f29dd81db31b33eccf281f1767ff0f7729c7'
TRIAL_BASE = Path('/root/PRISMA/prisma/neural-pilot/compose.yaml')
TRIAL_ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'}
TRIAL_CACHE = {'LLAMA_ARG_CACHE_RAM': '0', 'LLAMA_ARG_CTX_CHECKPOINTS': '0'}
TRIAL_VERSION = 3


class TrialError(Exception):
    pass


def trial_write(name, value):
    target = TRIAL_ROOT / name
    temporary = TRIAL_ROOT / (name + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, target)


def trial_save_controller(state):
    # A preflight failure has not consumed the approved mutation or request.
    # Replace the old preflight-only controller while holding the process lock.
    if state.get('mutationReserved'):
        return
    source = Path(__file__).read_bytes()
    temporary = TRIAL_ROOT / 'trial.py.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(source)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, TRIAL_ROOT / 'trial.py')


def trial_save_resume_controller():
    source = Path(__file__).read_bytes()
    temporary = TRIAL_ROOT / 'resume-v3.py.tmp'
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(source)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, TRIAL_ROOT / 'resume-v3.py')


def trial_docker(arguments, timeout=12, extra_env=None):
    env = dict(TRIAL_ENV, DOCKER_CONFIG=str(TRIAL_ROOT / 'empty-docker-config'))
    if extra_env:
        env.update(extra_env)
    try:
        result = subprocess.run([TRIAL_DOCKER, '--host', 'unix:///var/run/docker.sock', *arguments],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired):
        raise TrialError('DOCKER_COMMAND_UNAVAILABLE_OR_TIMED_OUT') from None
    if result.returncode != 0 or len(result.stdout) > 2**20:
        raise TrialError('DOCKER_COMMAND_FAILED')
    return result.stdout.decode('utf-8', errors='strict')


def trial_inspect(container='prisma-neural-qwen', timeout=12):
    values = json.loads(trial_docker(['inspect', container], timeout=timeout))
    if len(values) != 1:
        raise TrialError('CONTAINER_IDENTITY_AMBIGUOUS')
    return values[0]


def trial_env(container):
    result = {}
    for entry in container['Config']['Env']:
        key, separator, value = entry.partition('=')
        if not separator or key in result:
            raise TrialError('CONTAINER_ENVIRONMENT_AMBIGUOUS')
        result[key] = value
    return result


def trial_argv(container):
    rows = trial_docker(['top', container['Id'], '-eo', 'pid,comm']).splitlines()
    pids = [parts[0] for row in rows if len(parts := row.split()) == 2
            and parts[0].isdigit() and parts[1] in ('llama-server', 'server')]
    if len(pids) != 1:
        raise TrialError('EXPECTED_ONE_LLAMA_PROCESS')
    with (Path('/proc') / pids[0] / 'cmdline').open('rb') as source:
        raw = source.read(131073)
    if len(raw) > 131072 or not raw.endswith(b'\0'):
        raise TrialError('PROCESS_ARGUMENTS_UNAVAILABLE')
    return raw[:-1].decode('utf-8', errors='strict').split('\0')


def trial_key(container):
    key = trial_env(container).get('LLAMA_API_KEY')
    if not key:
        raise TrialError('EXISTING_LOCAL_API_KEY_UNAVAILABLE')
    return key


def trial_opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def trial_idle(container):
    slots = json.loads(request(trial_opener(), trial_key(container), '/slots'))
    if not isinstance(slots, list) or len(slots) != 1 or slots[0].get('is_processing') is not False:
        raise TrialError('SLOT_BUSY_OR_STATE_UNKNOWN_NO_CHANGE')


def trial_ready(container_id, seconds=180):
    expires = time.monotonic() + seconds
    key = trial_key(trial_inspect(container_id))
    while time.monotonic() < expires:
        current = trial_inspect(container_id)
        if current['State'].get('OOMKilled') or not current['State'].get('Running') or current.get('RestartCount', 0):
            raise TrialError('NEW_CONTAINER_UNSTABLE')
        try:
            remaining = min(5, expires - time.monotonic())
            health = json.loads(request(trial_opener(), key, '/health', timeout=max(0.01, remaining)))
            if not isinstance(health, dict):
                raise ValueError('HEALTH_RESPONSE_FORMAT')
            if health.get('status') == 'ok':
                trial_idle(current)
                return current
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise TrialError('LOCAL_HEALTH_AUTHORIZATION_FAILED') from None
        except (OSError, http.client.HTTPException, ValueError, WallDeadlineExceeded):
            pass
        time.sleep(min(2, max(0, expires - time.monotonic())))
    raise TrialError('MODEL_NOT_READY_WITHIN_180_SECONDS')


def trial_compose(cache=False):
    args = ['compose', '-p', 'neural-pilot', '--project-directory', str(TRIAL_BASE.parent),
            '-f', str(TRIAL_ROOT / 'baseline.private.json'), '-f', str(TRIAL_ROOT / 'image-pin.json')]
    if cache:
        args.extend(['-f', str(TRIAL_ROOT / 'cache-off.json')])
    return args


def trial_stop(cache=False, expected_id=None):
    before = trial_inspect()
    if (expected_id is not None and before['Id'] != expected_id):
        raise TrialError('CONTAINER_CHANGED_DO_NOT_STOP')
    if before['Image'] != TRIAL_IMAGE:
        raise TrialError('IMAGE_CHANGED_DO_NOT_STOP')
    try:
        trial_docker([*trial_compose(cache), 'stop', 'qwen'], timeout=85)
    except TrialError:
        pass
    after = trial_inspect(before['Id'])
    if after['State'].get('Running') or after['State'].get('Restarting'):
        raise TrialError('STOP_NOT_CONFIRMED_NO_START')


def trial_up(cache=False):
    try:
        trial_docker([*trial_compose(cache), 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'qwen'], timeout=90)
    except TrialError:
        # The daemon may have created our container even if the CLI timed out.
        # Preserve only an identity bearing this private trial's exact file labels.
        try:
            trial_record_created(trial_inspect(), cache)
        except Exception:
            pass
        raise
    current = trial_inspect()
    if current['Image'] != TRIAL_IMAGE:
        raise TrialError('IMAGE_CHANGED_AFTER_RECREATION')
    trial_record_created(current, cache)
    return current


def trial_record_created(current, cache):
    labels = current.get('Config', {}).get('Labels') or {}
    expected_files = [str(TRIAL_ROOT / 'baseline.private.json'), str(TRIAL_ROOT / 'image-pin.json')]
    if cache:
        expected_files.append(str(TRIAL_ROOT / 'cache-off.json'))
    if (current.get('Image') != TRIAL_IMAGE or labels.get('com.docker.compose.project') != 'neural-pilot'
            or labels.get('com.docker.compose.service') != 'qwen'
            or labels.get('com.docker.compose.project.config_files', '').split(',') != expected_files):
        return
    state = json.loads((TRIAL_ROOT / 'state.json').read_text())
    state['createdContainerId'] = current['Id']
    trial_write('state.json', state)


def trial_prepare():
    before = trial_inspect()
    if before['Image'] != TRIAL_IMAGE or not before['State'].get('Running') or before['State'].get('Restarting'):
        raise TrialError('BASELINE_IDENTITY_OR_STATE_CHANGED')
    labels = before['Config'].get('Labels') or {}
    expected = {'com.docker.compose.project': 'neural-pilot',
                'com.docker.compose.service': 'qwen',
                'com.docker.compose.project.working_dir': str(TRIAL_BASE.parent),
                'com.docker.compose.project.config_files': str(TRIAL_BASE)}
    if any(labels.get(key) != value for key, value in expected.items()):
        raise TrialError('COMPOSE_CREATION_METADATA_CHANGED')
    for path in (TRIAL_BASE, TRIAL_BASE.parent / '.env'):
        if path.exists():
            meta = path.lstat()
            if not stat.S_ISREG(meta.st_mode) or meta.st_uid != 0 or meta.st_mode & 0o022:
                raise TrialError('COMPOSE_SOURCE_OWNERSHIP_OR_PERMISSIONS')
    image = json.loads(trial_docker(['image', 'inspect', TRIAL_IMAGE]))[0]
    key = trial_key(before)
    config = json.loads(trial_docker(['compose', '-p', 'neural-pilot', '--project-directory', str(TRIAL_BASE.parent),
                                    '-f', str(TRIAL_BASE), 'config', '--format', 'json'],
                                   extra_env={'LLAMA_API_KEY': key}))
    guard_trial(config, before, image, trial_argv(before))
    trial_idle(before)
    frozen = {'name': 'neural-pilot', 'services': {'qwen': copy.deepcopy(config['services']['qwen'])}}
    network_names = set(frozen['services']['qwen'].get('networks', {'default': None}))
    frozen['networks'] = {name: config['networks'][name] for name in network_names}
    trial_write('baseline.private.json', frozen)
    trial_write('image-pin.json', {'services': {'qwen': {'image': TRIAL_IMAGE, 'pull_policy': 'never'}}})
    trial_write('cache-off.json', {'services': {'qwen': {'environment': TRIAL_CACHE}}})
    return before, image, frozen


def trial_save_report(report, sampler=None):
    if sampler is not None:
        report['measurements'] = sampler.stop()
    controller = TRIAL_ROOT / ('resume-v3.py' if (TRIAL_ROOT / 'resume-v3.py').is_file() else 'trial.py')
    report['rollbackCommand'] = 'sudo python3 ' + str(controller) + ' --rollback'
    report['scope'] = {'service': 'qwen', 'imageChanged': False, 'maximumCompletionRequests': 1,
                       'maximumOutputTokens': 8, 'completionWaitSeconds': 55,
                       'qualityValidated': False}
    trial_write('report.json', report)
    print(json.dumps(report, indent=2), flush=True)


def trial_progress(report, stage):
    report['stage'] = stage
    report['outcome'] = 'running'
    trial_write('report.json', report)


def trial_complete_probe(current, image, frozen, state, report, sampler):
    trial_progress(report, 'verify-existing-configuration')
    named = trial_inspect()
    if named['Id'] != state['createdContainerId'] or named['Image'] != TRIAL_IMAGE:
        raise TrialError('CONTAINER_CHANGED_BEFORE_PROBE')
    expected = copy.deepcopy(frozen)
    expected['services']['qwen']['image'] = TRIAL_IMAGE
    expected['services']['qwen']['environment'].update(TRIAL_CACHE)
    guard_trial(expected, current, image, trial_argv(current))
    if any(trial_env(current).get(key) != value for key, value in TRIAL_CACHE.items()):
        raise TrialError('CACHE_ENVIRONMENT_NOT_APPLIED')
    if state.get('completionReserved'):
        raise TrialError('COMPLETION_ALREADY_RESERVED_NO_RETRY')
    state['completionReserved'] = True
    trial_write('state.json', state)
    sampler.phase = 'probe'
    report['completionAttempted'] = None
    report['completionReserved'] = True
    trial_progress(report, 'single-approved-probe')
    print('4/4 Una unica solicitud: hasta 8 tokens y 55 segundos de espera; no habra reintento.', flush=True)
    probe = run_probe(current['Id'])
    report.update(probe)
    report['outcome'] = 'minimal-generation-received' if probe.get('outcome') == 'response-received' else 'trial-not-passed'
    report['recreationCompleted'] = True
    report['cacheEnvironmentApplied'] = True
    report['modelOrPlanningQualityPassed'] = False
    report['nextAction'] = 'review-real-measurements' if probe.get('outcome') == 'response-received' else 'no-retry-review-or-rollback'
    report['stage'] = 'finished'
    sampler.phase = 'after'
    trial_save_report(report, sampler)
    return 0 if probe.get('outcome') == 'response-received' else 2


def trial_main():
    global TRIAL_DOCKER
    parser = argparse.ArgumentParser(description='One approved, guarded Queen cache trial; no downloads or model changes.')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--rollback', action='store_true')
    modes.add_argument('--resume', action='store_true')
    options = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('Ejecuta este archivo con sudo python3.')
    os.umask(0o077)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    TRIAL_ROOT.mkdir(mode=0o700, exist_ok=True)
    metadata = TRIAL_ROOT.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o077:
        raise SystemExit('DIRECTORIO_PRIVADO_NO_VALIDO')
    lock = (TRIAL_ROOT / 'lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise SystemExit('El ensayo ya esta ejecutandose; no se iniciara otro.')
    try:
        return trial_locked(options)
    finally:
        lock.close()


def trial_locked(options):
    global TRIAL_DOCKER
    TRIAL_DOCKER = next(path for path in ('/usr/bin/docker', '/usr/local/bin/docker') if Path(path).is_file())
    (TRIAL_ROOT / 'empty-docker-config').mkdir(mode=0o700, exist_ok=True)
    state_path = TRIAL_ROOT / 'state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    if not isinstance(state, dict):
        raise TrialError('TRIAL_STATE_MALFORMED')
    trial_save_controller(state)
    report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'completionAttempted': False,
              'scriptVersion': TRIAL_VERSION, 'stage': 'preflight'}
    sampler = None
    try:
        if options.rollback:
            if not state.get('mutationReserved'):
                raise TrialError('NO_APPLIED_TRIAL_TO_ROLL_BACK')
            if state.get('rolledBack'):
                print('La reversion ya se completo; no se repetira.', flush=True)
                return 0
            current = trial_inspect()
            if current['Id'] not in (state.get('originalContainerId'), state.get('createdContainerId')):
                raise TrialError('CONTAINER_CHANGED_SINCE_TRIAL_DO_NOT_STOP')
            print('Reversion autorizada: detener Qwen y restaurar la misma imagen sin el override de caches.', flush=True)
            previous_report = TRIAL_ROOT / 'report.json'
            if previous_report.exists():
                report['previousTrial'] = json.loads(previous_report.read_text())
            trial_stop(cache=True, expected_id=current['Id'])
            restored = trial_up(cache=False)
            trial_ready(restored['Id'])
            state['rolledBack'] = True
            trial_write('state.json', state)
            report['outcome'] = 'rolled-back-no-inference'
            trial_save_report(report)
            return 0
        if options.resume:
            report['stage'] = 'resume-identity-check'
            if not state.get('mutationReserved') or not state.get('createdContainerId') or state.get('rolledBack'):
                raise TrialError('NO_CREATED_TRIAL_TO_RESUME')
            if state.get('completionReserved'):
                raise TrialError('COMPLETION_ALREADY_RESERVED_NO_RETRY')
            current = trial_inspect()
            report['containerId'] = current['Id']
            report['containerState'] = {key: current['State'].get(key) for key in
                                        ('Running', 'Restarting', 'OOMKilled', 'Status')}
            report['containerState']['restartCount'] = current.get('RestartCount')
            report['imageMatchesExpected'] = current['Image'] == TRIAL_IMAGE
            if current['Id'] != state['createdContainerId'] or current['Image'] != TRIAL_IMAGE:
                raise TrialError('CONTAINER_CHANGED_SINCE_TRIAL_NO_RESUME')
            if not current['State'].get('Running') or current['State'].get('Restarting') or current['State'].get('OOMKilled') or current.get('RestartCount', 0):
                raise TrialError('EXISTING_TRIAL_CONTAINER_UNSTABLE')
            if any(trial_env(current).get(key) != value for key, value in TRIAL_CACHE.items()):
                raise TrialError('CACHE_ENVIRONMENT_NOT_APPLIED')
            image = json.loads(trial_docker(['image', 'inspect', TRIAL_IMAGE]))[0]
            frozen = json.loads((TRIAL_ROOT / 'baseline.private.json').read_text())
            previous = TRIAL_ROOT / 'report.json'
            archived = TRIAL_ROOT / 'before-resume-report.json'
            if previous.exists() and not archived.exists():
                trial_write(archived.name, json.loads(previous.read_text()))
            trial_save_resume_controller()
            report['resumedExistingContainer'] = True
            report['containerId'] = current['Id']
            report['recreationPerformedThisRun'] = False
            samples_path = TRIAL_ROOT / ('resume-measurements-' + uuid.uuid4().hex + '.jsonl')
            report['measurementsFile'] = str(samples_path)
            sampler = TrialSampler(lambda: trial_inspect(current['Id'], timeout=4), samples_path)
            sampler.start()
            sampler.phase = 'startup'
            trial_progress(report, 'readiness-existing-container')
            print('Reanudacion: se conserva el contenedor actual; solo se espera salud y la unica prueba pendiente.', flush=True)
            current = trial_ready(current['Id'])
            return trial_complete_probe(current, image, frozen, state, report, sampler)
        if state.get('mutationReserved'):
            print('Ensayo ya reservado: no se recreara ni se repetira la inferencia.', flush=True)
            if (TRIAL_ROOT / 'report.json').exists():
                print((TRIAL_ROOT / 'report.json').read_text(), flush=True)
            else:
                print('Consulta state.json privadamente; la ejecucion anterior quedo incompleta.', flush=True)
            return 0
        print('1/4 Verificando Compose y contenedor actual, sin imprimir credenciales.', flush=True)
        before, image, frozen = trial_prepare()
        state = {'mutationReserved': True, 'originalContainerId': before['Id'], 'completionReserved': False}
        trial_write('state.json', state)
        sampler = TrialSampler(lambda: trial_inspect(timeout=4), TRIAL_ROOT / 'measurements.jsonl')
        sampler.start()
        sampler.phase = 'startup'
        print('2/4 Deteniendo el anterior antes de recrear solo Qwen; misma imagen, sin pull.', flush=True)
        trial_stop(cache=False, expected_id=before['Id'])
        created = trial_up(cache=True)
        state['createdContainerId'] = created['Id']
        trial_write('state.json', state)
        print('3/4 Esperando inicializacion del modelo (maximo 180 segundos).', flush=True)
        trial_progress(report, 'readiness-created-container')
        current = trial_ready(created['Id'])
        return trial_complete_probe(current, image, frozen, state, report, sampler)
    except Exception as error:
        report['outcome'] = 'stopped-without-retry'
        report['errorCode'] = str(error) if isinstance(error, (TrialError, TrialGuardError)) else 'TRIAL_CHECK_FAILED'
        report['errorType'] = type(error).__name__ if re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}', type(error).__name__) else 'UnknownError'
        if isinstance(error, TrialGuardError):
            safe_details = getattr(error, 'safe_details', {})
            names = safe_details.get('unsupportedServiceKeys') if isinstance(safe_details, dict) else None
            if isinstance(names, list):
                report['unsupportedServiceKeys'] = [name if isinstance(name, str) and
                    re.fullmatch(r'[a-z][a-z0-9_]{0,63}', name) else 'nonstandard-key' for name in names[:32]]
        report['recreationMayHaveStarted'] = bool(state.get('mutationReserved'))
        report['nextAction'] = 'review-report-use-preserved-rollback-if-required'
        trial_save_report(report, sampler)
        return 2


if __name__ == '__main__':
    raise SystemExit(trial_main())
