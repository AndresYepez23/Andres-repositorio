#!/usr/bin/env python3
"""One startup-metadata capture; only existing llama binary --version/--help.

No inference, HTTP, model reads, environment inspection, raw logs or server
configuration changes. Command-line values are filtered in memory, never saved.
"""
import argparse
import datetime
import json
import os
from pathlib import Path, PurePosixPath
import re
import selectors
import signal
import stat
import subprocess
import tempfile
import time

MAX_SECONDS, COMMAND_SECONDS = 35, 6
HELPER_SECONDS = 5
MAX_OUTPUT, MAX_CMDLINE = 512 * 1024, 128 * 1024
FIXED_ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'}
NUMERIC = {
    'ctxSize': ('--ctx-size', '-c'), 'batchSize': ('--batch-size', '-b'),
    'uBatchSize': ('--ubatch-size', '-ub'), 'threads': ('--threads', '-t'),
    'threadsBatch': ('--threads-batch', '-tb'), 'parallel': ('--parallel', '-np'),
    'nPredict': ('--n-predict', '--predict', '-n'),
    'cacheRamMiB': ('--cache-ram', '-cram'),
    'ctxCheckpoints': ('--ctx-checkpoints', '--swa-checkpoints', '-ctxcp'),
}
ENUMS = {'cacheTypeK': ('--cache-type-k', '-ctk'),
         'cacheTypeV': ('--cache-type-v', '-ctv'),
         'flashAttention': ('--flash-attn', '-fa')}
KV_TYPES = {'f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'q5_0', 'q5_1', 'iq4_nl'}
CHOICES = {'cacheTypeK': KV_TYPES, 'cacheTypeV': KV_TYPES,
           'flashAttention': {'on', 'off', 'auto'}}
BOOLEAN = {'--mmap': ('mmap', True), '--no-mmap': ('mmap', False),
           '--mlock': ('mlock', True), '--no-mlock': ('mlock', False)}
ALIASES = {alias: key for key, aliases in {**NUMERIC, **ENUMS}.items() for alias in aliases}
# Values may themselves resemble flags. Consume sensitive option values before
# looking for whitelisted settings; none of these values is ever returned.
PRIVATE_OPTIONS = {'--api-key', '--api-key-file', '--hf-token', '--prompt', '-p',
                   '--file', '-f', '--model', '-m', '--hf-repo', '-hf',
                   '--hf-file', '--grammar', '--grammar-file', '--json-schema',
                   '--jinja-file', '--chat-template', '--chat-template-file',
                   '--system-prompt', '--system-prompt-file'}
CONTAINER_FIELDS = {'containerId': '.Id', 'imageId': '.Image', 'initPid': '.State.Pid',
                    'running': '.State.Running', 'startedAt': '.State.StartedAt',
                    'restartCount': '.RestartCount'}
COMPOSE_LABELS = {'project': 'com.docker.compose.project',
                  'configFiles': 'com.docker.compose.project.config_files',
                  'workingDir': 'com.docker.compose.project.working_dir',
                  'service': 'com.docker.compose.service'}


class CaptureError(Exception):
    """Fixed codes only; external stdout/stderr never enters an error."""


def bounded_command(argv, deadline, capture_stderr=False):
    remaining = min(COMMAND_SECONDS, deadline - time.monotonic())
    if remaining <= 0:
        raise CaptureError('CAPTURE_DEADLINE')
    process = None
    try:
        process = subprocess.Popen(argv, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT if capture_stderr else subprocess.DEVNULL,
                                   env=FIXED_ENV, start_new_session=True)
        end, output = time.monotonic() + remaining, bytearray()
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while True:
                wait = min(end, deadline) - time.monotonic()
                if wait <= 0 or not selector.select(wait):
                    raise CaptureError('COMMAND_DEADLINE')
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    break
                output.extend(chunk)
                if len(output) > MAX_OUTPUT:
                    raise CaptureError('COMMAND_OUTPUT_LIMIT')
        if process.wait(timeout=max(.001, min(end, deadline) - time.monotonic())):
            raise CaptureError('DOCKER_COMMAND_FAILED')
        return output.decode('utf-8', errors='replace')
    except (OSError, subprocess.TimeoutExpired):
        raise CaptureError('DOCKER_COMMAND_UNAVAILABLE') from None
    finally:
        if process is not None:
            if process.poll() is None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=1)
            if process.stdout is not None:
                process.stdout.close()


def docker_reader(config, deadline):
    binary = next((str(p) for p in (Path('/usr/bin/docker'), Path('/usr/local/bin/docker')) if p.is_file()), None)
    if not binary:
        raise CaptureError('DOCKER_NOT_FOUND')
    def docker(*args):
        # Some builds print --version to stderr. Both channels stay in bounded
        # memory and only the version/help whitelist parser may publish fields.
        helper = (len(args) == 7 and args[0] == 'exec' and args[2:5] ==
                  ('/usr/bin/timeout', '--signal=KILL', str(HELPER_SECONDS) + 's') and
                  args[-1] in ('--version', '--help'))
        return bounded_command([binary, '--config', config, '--host',
                                'unix:///var/run/docker.sock', *args], deadline,
                               capture_stderr=helper)
    return docker


def template(fields):
    return '{' + ','.join(json.dumps(key) + ':{{json ' + value + '}}'
                          for key, value in fields.items()) + '}'


def integer(value):
    return int(value) if isinstance(value, str) and re.fullmatch(r'-?\d{1,10}', value) and -1 <= int(value) <= 2147483647 else None


def parse_arguments(raw):
    if len(raw) > MAX_CMDLINE:
        raise CaptureError('CMDLINE_LIMIT')
    args = raw.decode('utf-8', errors='replace').split('\0')
    if len(args) > 512:
        raise CaptureError('ARGUMENT_COUNT_LIMIT')
    values, invalid, index = {}, set(), 1
    while index < len(args):
        option, separator, inline = args[index].partition('=')
        if option in PRIVATE_OPTIONS:
            index += 1 if separator else 2
            continue
        if option in BOOLEAN:
            key, value = BOOLEAN[option]
            if separator:
                invalid.add(key)
            else:
                values[key] = value
        elif option in ALIASES:
            key = ALIASES[option]
            value = inline if separator else args[index + 1] if index + 1 < len(args) else ''
            parsed = integer(value) if key in NUMERIC else value if value in CHOICES[key] else None
            # Older --flash-attn had no value; preserve that explicit switch.
            if key == 'flashAttention' and not separator and (not value or value.startswith('-')):
                parsed = 'on'
            elif not separator:
                index += 1
            if parsed is None:
                invalid.add(key)
            else:
                values[key] = parsed
        index += 1
    return {'configuredArguments': values, 'unparsedFields': sorted(invalid),
            'effectiveSettingsKnown': False,
            'meaning': 'Whitelisted explicit process arguments only. Environment overrides and model defaults are not read.'}


def parse_help(raw):
    blocks, current = [], None
    for line in raw.splitlines():
        header = re.match(r'^\s*(--?[A-Za-z][\w-]*(?:\s*,\s*--?[A-Za-z][\w-]*)*)', line)
        if header:
            current = {'flags': set(re.findall(r'--?[A-Za-z][\w-]*', header[1])), 'text': line}
            blocks.append(current)
        elif current is not None:
            current['text'] += '\n' + line
    result = {}
    for key, aliases in {**NUMERIC, **ENUMS, 'mmap': ('--mmap', '--no-mmap'),
                         'mlock': ('--mlock', '--no-mlock')}.items():
        relevant = [b for b in blocks if b['flags'].intersection(aliases)]
        text = '\n'.join(b['text'] for b in relevant)
        default = re.search(r'default:\s*([-\w]+)', text, re.IGNORECASE)
        value = default[1].lower() if default else None
        parsed = integer(value) if key in NUMERIC else value if key in ENUMS and value in CHOICES[key] else (
            value in ('true', 'enabled') if key in ('mmap', 'mlock') and value in ('true', 'false', 'enabled', 'disabled') else None)
        result[key] = {'supported': bool(relevant), 'defaultFromHelp': parsed}
        if key in ENUMS:
            result[key]['knownChoicesFromHelp'] = sorted(v for v in CHOICES[key] if re.search(r'(?<![\w])' + re.escape(v) + r'(?![\w])', text))
    recognized = all(result[key]['supported'] for key in ('ctxSize', 'batchSize', 'parallel'))
    if not recognized:
        for value in result.values():
            value['supported'] = None
            value['defaultFromHelp'] = None
            if 'knownChoicesFromHelp' in value:
                value['knownChoicesFromHelp'] = []
    result['metadataRecognized'] = recognized
    return result


def parse_version(raw):
    match = re.search(r'(?mi)^\s*(?:llama(?:\.cpp|-server)?\s+)?(?:version|build)\s*[:=]\s*b?(\d{1,10})\s*\(([0-9a-f]{7,40})(-dirty)?\)', raw)
    if not match:
        match = re.search(r'(?mi)^\s*version\s*:\s*v?\d{1,4}\.\d{1,4}\.\d{1,4}-b(\d{1,10})-([0-9a-f]{7,40})(-dirty)?\s*$', raw)
    return {'buildNumber': int(match[1]) if match else None,
            'commit': match[2].lower() if match else None,
            'dirty': bool(match[3]) if match else None}


def safe_path(value):
    return isinstance(value, str) and len(value) <= 1024 and value.startswith('/') and '..' not in PurePosixPath(value).parts and re.fullmatch(r'/[A-Za-z0-9_./ @+~-]*', value) is not None


def compose_metadata(raw):
    result = {key: None for key in COMPOSE_LABELS}
    for key in ('project', 'service'):
        value = raw.get(key)
        if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', value):
            result[key] = value
    if safe_path(raw.get('workingDir')):
        result['workingDir'] = raw['workingDir']
    files = raw.get('configFiles')
    if isinstance(files, str) and len(files) <= 4096 and 0 < len(files.split(',')) <= 8 and all(safe_path(p) for p in files.split(',')):
        result['configFiles'] = files.split(',')
    result.update({'launchFileOwnershipVerified': False,
                   'meaning': 'Docker Compose creation labels only; current files, contents and ownership are not verified.'})
    return result


def container_metadata(docker, container):
    fields = {**CONTAINER_FIELDS, **{key: '(index .Config.Labels ' + json.dumps(label) + ')' for key, label in COMPOSE_LABELS.items()}}
    raw = json.loads(docker('inspect', '--format', template(fields), container))
    if not re.fullmatch(r'[0-9a-f]{64}', str(raw.get('containerId', ''))) or not re.fullmatch(r'sha256:[0-9a-f]{64}', str(raw.get('imageId', ''))):
        raise CaptureError('CONTAINER_IDENTITY_UNAVAILABLE')
    if raw.get('running') is not True or type(raw.get('initPid')) is not int or raw['initPid'] <= 0:
        raise CaptureError('CONTAINER_NOT_RUNNING')
    if type(raw.get('restartCount')) is not int or raw['restartCount'] < 0 or not re.fullmatch(r'[0-9TZ:.+-]{1,40}', str(raw.get('startedAt', ''))):
        raise CaptureError('CONTAINER_IDENTITY_UNAVAILABLE')
    return {key: raw.get(key) for key in CONTAINER_FIELDS}, compose_metadata(raw)


def select_pid(docker, container):
    pids = [int(parts[0]) for line in docker('top', container, '-eo', 'pid,comm').splitlines()
            if len(parts := line.split()) == 2 and parts[0].isdigit() and parts[1] in ('llama-server', 'server')]
    if len(pids) != 1 or not 0 < pids[0] < 2**31:
        raise CaptureError('EXPECTED_ONE_LLAMA_SERVER')
    return pids[0]


def process_identity(pid):
    root = Path('/proc') / str(pid)
    target = os.readlink(root / 'exe')
    if not safe_path(target) or PurePosixPath(target).name not in ('llama-server', 'server'):
        raise CaptureError('UNSUPPORTED_EXISTING_BINARY')
    binary = (root / 'exe').stat()
    inside = (root / 'root' / target.lstrip('/')).stat()
    if (binary.st_dev, binary.st_ino) != (inside.st_dev, inside.st_ino):
        raise CaptureError('BINARY_IDENTITY_MISMATCH')
    with (root / 'stat').open() as source:
        raw = source.read(4097)
    tail = raw[raw.rfind(')') + 2:].split()
    if len(raw) > 4096 or len(tail) < 20 or not tail[19].isdigit():
        raise CaptureError('PROCESS_IDENTITY_UNAVAILABLE')
    return target, {'pid': pid, 'startTicks': int(tail[19]), 'device': binary.st_dev, 'inode': binary.st_ino}


def trusted_timeout(pid):
    # Existing coreutils wrapper only. Never install, search PATH or follow a
    # replacement symlink; owner/writability metadata is checked before each use.
    try:
        info = (Path('/proc') / str(pid) / 'root/usr/bin/timeout').lstat()
    except OSError:
        raise CaptureError('TIMEOUT_HELPER_UNAVAILABLE') from None
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or not info.st_mode & 0o111:
        raise CaptureError('TIMEOUT_HELPER_UNTRUSTED')
    return (info.st_dev, info.st_ino, info.st_size, info.st_ctime_ns, info.st_mode, info.st_uid)


def capture(container='prisma-neural-qwen', report=None):
    report = {} if report is None else report
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', container):
        raise CaptureError('INVALID_CONTAINER_NAME')
    report.update({'schema': 1, 'kind': 'startup-metadata-only', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   'container': container, 'generationRequests': 0, 'networkRequestsToModel': 0,
                   'serverConfigurationChanges': 0, 'modelFilesRead': 0,
                   'helpVersionProcessesRequested': 0, 'helpVersionProcessesCompleted': 0,
                   'timeoutWrapperProcessesRequested': 0, 'helperRuntimeBoundSeconds': HELPER_SECONDS,
                   'remoteCompletionWithinCaptureDeadlineGuaranteed': False,
                   'deadlineScope': '35s bounds local capture; existing timeout bounds each binary after dispatch to 5s. Daemon scheduling is not bounded by the client deadline.',
                   'environmentScope': 'Fixed environment applies to the host Docker client only. Container environment is inherited and not inspected.',
                   'identityStable': None, 'complete': False})
    deadline = time.monotonic() + MAX_SECONDS
    with tempfile.TemporaryDirectory(prefix='queen-empty-docker-config-', dir='/tmp') as config:
        docker = docker_reader(config, deadline)
        before, report['compose'] = container_metadata(docker, container)
        report['dockerBefore'] = before
        pid = select_pid(docker, before['containerId'])
        binary, identity = process_identity(pid)
        timeout_identity = trusted_timeout(pid)
        report['process'] = {'hostPid': pid, 'startTicks': identity['startTicks'], 'binaryBasename': PurePosixPath(binary).name}
        with (Path('/proc') / str(pid) / 'cmdline').open('rb') as source:
            raw = source.read(MAX_CMDLINE + 1)
        report['arguments'] = parse_arguments(raw)
        image_fields = {'revision': '(index .Config.Labels "org.opencontainers.image.revision")',
                        'version': '(index .Config.Labels "org.opencontainers.image.version")'}
        labels = json.loads(docker('image', 'inspect', '--format', template(image_fields), before['imageId']))
        report['image'] = {'imageId': before['imageId'],
                           'ociRevision': labels.get('revision') if re.fullmatch(r'[0-9a-f]{7,40}', str(labels.get('revision', ''))) else None,
                           'ociVersion': labels.get('version') if re.fullmatch(r'(?:b?\d{1,10}(?:[-+][0-9a-f]{7,40})?|v?\d{1,4}\.\d{1,4}\.\d{1,4}(?:-b\d{1,10}-[0-9a-f]{7,40})?)', str(labels.get('version', ''))) else None}
        for option, key, parser in (('--version', 'binaryVersion', parse_version), ('--help', 'capabilities', parse_help)):
            if process_identity(pid) != (binary, identity) or trusted_timeout(pid) != timeout_identity:
                report['identityStable'] = False
                raise CaptureError('PROCESS_IDENTITY_DRIFT')
            report['helpVersionProcessesRequested'] += 1
            report['timeoutWrapperProcessesRequested'] += 1
            report[key] = parser(docker('exec', before['containerId'], '/usr/bin/timeout',
                                       '--signal=KILL', str(HELPER_SECONDS) + 's', binary, option))
            report['helpVersionProcessesCompleted'] += 1
        after, _ = container_metadata(docker, before['containerId'])
        report['dockerAfter'] = after
        if before != after or select_pid(docker, before['containerId']) != pid or process_identity(pid) != (binary, identity) or trusted_timeout(pid) != timeout_identity:
            report['identityStable'] = False
            raise CaptureError('PROCESS_IDENTITY_DRIFT')
        if time.monotonic() >= deadline:
            raise CaptureError('CAPTURE_DEADLINE')
        report['identityStable'] = True
        report['candidateFlagsSupported'] = (all(report['capabilities'][k]['supported'] for k in ('cacheRamMiB', 'ctxCheckpoints'))
                                             if report['capabilities']['metadataRecognized'] else None)
        revision, commit = report['image']['ociRevision'], report['binaryVersion']['commit']
        report['revisionConflict'] = bool(revision and commit and not (revision.startswith(commit) or commit.startswith(revision)))
        report['buildRevisionKnown'] = bool(revision or commit)
        report['effectiveSettingsKnown'] = False
        report['memoryAllocationBreakdown'] = None
        if not report['capabilities']['metadataRecognized'] or report['binaryVersion']['buildNumber'] is None or commit is None:
            raise CaptureError('BINARY_METADATA_UNRECOGNIZED')
        report['complete'] = True
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', default='prisma-neural-qwen')
    args = parser.parse_args()
    report, status = {}, 0
    def expired(*_):
        raise CaptureError('CAPTURE_DEADLINE')
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(MAX_SECONDS)
    try:
        capture(args.container, report)
    except Exception as error:
        report.update({'complete': False,
                       'captureError': str(error) if isinstance(error, CaptureError) else 'STARTUP_METADATA_UNAVAILABLE'})
        status = 2
    finally:
        signal.alarm(0)
    print(json.dumps(report, indent=2, allow_nan=False))
    return status


if __name__ == '__main__':
    raise SystemExit(main())
