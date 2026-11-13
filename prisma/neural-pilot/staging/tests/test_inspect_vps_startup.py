"""Offline safety/identity regressions; no Docker, VPS or model calls."""
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('startup', Path(__file__).parents[1] / 'inspect-vps-startup.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)

CONTAINER = {'containerId': 'a' * 64, 'imageId': 'sha256:' + 'b' * 64,
             'initPid': 1, 'running': True, 'startedAt': '2026-11-13T09:39:40Z', 'restartCount': 0,
             'project': 'queen', 'configFiles': '/opt/queen/compose.yaml,/opt/queen/override.yaml',
             'workingDir': '/opt/queen', 'service': 'qwen'}
IDENTITY = ('/app/llama-server', {'pid': 42, 'startTicks': 100, 'device': 2, 'inode': 99})
TIMEOUT_IDENTITY = (2, 101, 50000, 123456789, 0o100755, 0)
HELP = '''-c, --ctx-size N    context size (default: 0)
-b, --batch-size N    logical batch (default: 2048)
-ub, --ubatch-size N    physical batch (default: 512)
-np, --parallel N    parallel sequences (default: 1)
-cram, --cache-ram N    maximum cache MiB (default: 8192, -1 unlimited, 0 disable)
-ctxcp, --ctx-checkpoints, --swa-checkpoints N    checkpoints (default: 32)
-ctk, --cache-type-k TYPE    choices: f16, bf16, q8_0 (default: f16)
-ctv, --cache-type-v TYPE    choices: f16, q8_0 (default: f16)
-fa, --flash-attn MODE    on, off, auto (default: auto)
--no-mmap    mmap (default: enabled)
--mlock    lock pages
--model FNAME    PRIVATE_MODEL_PATH
--api-key KEY    PRIVATE_API_KEY
'''


class StartupTests(unittest.TestCase):
    def test_cmdline_filters_private_values_and_distinguishes_explicit_from_effective(self):
        raw = b'\0'.join(s.encode() for s in ['/app/llama-server', '--model', '/PRIVATE_MODEL',
             '--api-key', '--cache-ram=1234', '--prompt', 'PRIVATE_PROMPT', '--ctx-size', '2048',
             '--batch-size=256', '--ubatch-size', '128', '--threads', '2', '--parallel', '1',
             '--n-predict', '256', '--cache-ram=0', '--ctx-checkpoints', '0', '--cache-type-k',
             'q8_0', '--flash-attn', 'off', '--no-mmap', '--mlock'])
        result = reader.parse_arguments(raw)
        values = result['configuredArguments']
        self.assertEqual(values['ctxSize'], 2048)
        self.assertEqual(values['cacheRamMiB'], 0)
        self.assertEqual(values['ctxCheckpoints'], 0)
        self.assertEqual(values['cacheTypeK'], 'q8_0')
        self.assertFalse(values['mmap'])
        self.assertTrue(values['mlock'])
        self.assertFalse(result['effectiveSettingsKnown'])
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('1234', json.dumps(result))

    def test_help_keeps_only_supported_relevant_flags_defaults_and_known_choices(self):
        result = reader.parse_help(HELP)
        self.assertEqual(result['cacheRamMiB'], {'supported': True, 'defaultFromHelp': 8192})
        self.assertEqual(result['ctxCheckpoints']['defaultFromHelp'], 32)
        self.assertEqual(result['flashAttention']['knownChoicesFromHelp'], ['auto', 'off', 'on'])
        self.assertTrue(result['mmap']['defaultFromHelp'])
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertIsNone(reader.parse_help('--cache-idle-slots    requires --cache-ram\n')['cacheRamMiB']['supported'])
        self.assertIsNone(reader.parse_help('-c, --ctx-size N    context from model\n')['ctxSize']['defaultFromHelp'])

    def test_version_and_argument_errors_never_return_unrelated_text(self):
        self.assertEqual(reader.parse_version('version: 1234 (abcdef012-dirty)\nPRIVATE_KEY'),
                         {'buildNumber': 1234, 'commit': 'abcdef012', 'dirty': True})
        self.assertIsNone(reader.parse_version('PRIVATE_KEY')['commit'])
        self.assertEqual(reader.parse_version('version: v1.0.0-b12359-b1b770d')['commit'], 'b1b770d')
        result = reader.parse_arguments(b'/app/server\0--cache-ram\0PRIVATE_API_KEY\0--cache-type-v\0PRIVATE_TYPE\0')
        self.assertEqual(result['configuredArguments'], {})
        self.assertNotIn('PRIVATE', json.dumps(result))
        with self.assertRaisesRegex(reader.CaptureError, '^CMDLINE_LIMIT$'):
            reader.parse_arguments(b'x' * (reader.MAX_CMDLINE + 1))

    def test_only_help_version_capture_stderr_in_memory_for_whitelist_parsing(self):
        with mock.patch.object(Path, 'is_file', return_value=True), \
             mock.patch.object(reader, 'bounded_command', return_value='version: 1234 (abcdef012)\nPRIVATE_STDERR') as run:
            docker = reader.docker_reader('/empty', reader.time.monotonic() + 10)
            parsed = reader.parse_version(docker('exec', 'a' * 64, '/usr/bin/timeout', '--signal=KILL', '5s', '/app/server', '--version'))
            self.assertTrue(run.call_args.kwargs['capture_stderr'])
            docker('exec', 'a' * 64, '/usr/bin/timeout', '--signal=KILL', '5s', '/app/server', '--help')
            self.assertTrue(run.call_args.kwargs['capture_stderr'])
            docker('inspect', '--format', '{}', 'queen')
            self.assertFalse(run.call_args.kwargs['capture_stderr'])
        self.assertEqual(parsed['commit'], 'abcdef012')
        self.assertNotIn('PRIVATE', json.dumps(parsed))

    def test_complete_capture_skips_tini_and_executes_only_version_and_help(self):
        commands = []
        def docker(*args):
            commands.append(args)
            if args[0] == 'inspect':
                return json.dumps(CONTAINER)
            if args[0] == 'top':
                return 'PID COMMAND\n1 tini\n42 llama-server\n'
            if args[:2] == ('image', 'inspect'):
                return json.dumps({'revision': 'abcdef0123456789', 'version': 'v1.0.0-b1234-abcdef012', 'PRIVATE_EXTRA': 'PRIVATE_SECRET'})
            if args[0] == 'exec' and args[-1] == '--version':
                return 'version: 1234 (abcdef012)\nPRIVATE_BUILD_PATH'
            if args[0] == 'exec' and args[-1] == '--help':
                return HELP
            self.fail('unexpected Docker command')
        with mock.patch.object(reader, 'docker_reader', return_value=docker), \
             mock.patch.object(reader, 'process_identity', return_value=IDENTITY), \
             mock.patch.object(reader, 'trusted_timeout', return_value=TIMEOUT_IDENTITY), \
             mock.patch.object(Path, 'open', return_value=io.BytesIO(b'/app/llama-server\0--ctx-size\x002048\0--api-key\0PRIVATE_KEY')):
            report = reader.capture()
        self.assertTrue(report['complete'])
        self.assertTrue(report['identityStable'])
        self.assertEqual(report['process']['hostPid'], 42)
        self.assertEqual(report['compose']['configFiles'], ['/opt/queen/compose.yaml', '/opt/queen/override.yaml'])
        self.assertFalse(report['compose']['launchFileOwnershipVerified'])
        self.assertTrue(report['candidateFlagsSupported'])
        self.assertEqual(report['image']['ociVersion'], 'v1.0.0-b1234-abcdef012')
        self.assertFalse(report['revisionConflict'])
        self.assertEqual(report['helpVersionProcessesRequested'], 2)
        self.assertEqual(report['helpVersionProcessesCompleted'], 2)
        self.assertEqual(report['timeoutWrapperProcessesRequested'], 2)
        self.assertEqual(report['generationRequests'], 0)
        self.assertEqual(report['networkRequestsToModel'], 0)
        self.assertEqual(report['serverConfigurationChanges'], 0)
        self.assertNotIn('PRIVATE', json.dumps(report))
        self.assertNotIn('"Env":', json.dumps(report))
        self.assertEqual([c for c in commands if c[0] == 'exec'], [
            ('exec', CONTAINER['containerId'], '/usr/bin/timeout', '--signal=KILL', '5s', '/app/llama-server', '--version'),
            ('exec', CONTAINER['containerId'], '/usr/bin/timeout', '--signal=KILL', '5s', '/app/llama-server', '--help')])
        self.assertTrue(all(c[0] in ('inspect', 'image', 'top', 'exec') for c in commands))
        self.assertTrue(all('.Config.Env' not in ' '.join(c) and '.Config.Cmd' not in ' '.join(c) for c in commands))

    def test_identity_drift_stops_before_dispatching_help_and_preserves_partial_metadata(self):
        commands, report = [], {}
        def docker(*args):
            commands.append(args)
            if args[0] == 'inspect': return json.dumps(CONTAINER)
            if args[0] == 'top': return 'PID COMMAND\n1 tini\n42 server\n'
            if args[0] == 'image': return '{}'
            if args[0] == 'exec': return 'version: 1234 (abcdef012)'
            self.fail('unexpected command')
        changed = (IDENTITY[0], {**IDENTITY[1], 'startTicks': 200})
        with mock.patch.object(reader, 'docker_reader', return_value=docker), \
             mock.patch.object(reader, 'process_identity', side_effect=[IDENTITY, IDENTITY, changed]), \
             mock.patch.object(reader, 'trusted_timeout', return_value=TIMEOUT_IDENTITY), \
             mock.patch.object(Path, 'open', return_value=io.BytesIO(b'/app/server\0')):
            with self.assertRaisesRegex(reader.CaptureError, '^PROCESS_IDENTITY_DRIFT$'):
                reader.capture(report=report)
        self.assertFalse(report['complete'])
        self.assertEqual(report['helpVersionProcessesRequested'], 1)
        self.assertEqual(len([c for c in commands if c[0] == 'exec']), 1)

    def test_missing_timeout_refuses_all_helper_exec_without_installation_or_fallback(self):
        commands, report = [], {}
        def docker(*args):
            commands.append(args)
            return json.dumps(CONTAINER) if args[0] == 'inspect' else 'PID COMMAND\n42 llama-server\n'
        with mock.patch.object(reader, 'docker_reader', return_value=docker), \
             mock.patch.object(reader, 'process_identity', return_value=IDENTITY), \
             mock.patch.object(reader, 'trusted_timeout', side_effect=reader.CaptureError('TIMEOUT_HELPER_UNAVAILABLE')):
            with self.assertRaisesRegex(reader.CaptureError, '^TIMEOUT_HELPER_UNAVAILABLE$'):
                reader.capture(report=report)
        self.assertEqual(report['helpVersionProcessesRequested'], 0)
        self.assertFalse(any(c[0] == 'exec' for c in commands))

    def test_unrecognized_version_or_core_help_is_incomplete_not_missing_flag_proof(self):
        for bad in ('--version', '--help'):
            with self.subTest(option=bad):
                report = {}
                def docker(*args):
                    if args[0] == 'inspect': return json.dumps(CONTAINER)
                    if args[0] == 'top': return 'PID COMMAND\n42 llama-server\n'
                    if args[0] == 'image': return '{}'
                    if args[-1] == bad: return 'PRIVATE_UNRECOGNIZED'
                    return HELP if args[-1] == '--help' else 'version: 1234 (abcdef012)'
                with mock.patch.object(reader, 'docker_reader', return_value=docker), \
                     mock.patch.object(reader, 'process_identity', return_value=IDENTITY), \
                     mock.patch.object(reader, 'trusted_timeout', return_value=TIMEOUT_IDENTITY), \
                     mock.patch.object(Path, 'open', return_value=io.BytesIO(b'/app/server\0')):
                    with self.assertRaisesRegex(reader.CaptureError, '^BINARY_METADATA_UNRECOGNIZED$'):
                        reader.capture(report=report)
                self.assertFalse(report['complete'])
                self.assertNotIn('PRIVATE', json.dumps(report))
                if bad == '--help':
                    self.assertIsNone(report['candidateFlagsSupported'])
                    self.assertIsNone(report['capabilities']['cacheRamMiB']['supported'])

    def test_timeout_is_existing_regular_root_owned_and_not_writable_by_other_users(self):
        info = SimpleNamespace(st_mode=0o100755, st_uid=0, st_dev=2, st_ino=101, st_size=50000, st_ctime_ns=123456789)
        with mock.patch.object(Path, 'lstat', return_value=info):
            self.assertEqual(reader.trusted_timeout(42), TIMEOUT_IDENTITY)
        info.st_mode = 0o100777
        with mock.patch.object(Path, 'lstat', return_value=info):
            with self.assertRaisesRegex(reader.CaptureError, '^TIMEOUT_HELPER_UNTRUSTED$'):
                reader.trusted_timeout(42)
        with mock.patch.object(Path, 'lstat', side_effect=FileNotFoundError()):
            with self.assertRaisesRegex(reader.CaptureError, '^TIMEOUT_HELPER_UNAVAILABLE$'):
                reader.trusted_timeout(42)

    def test_unknown_binary_and_ambiguous_pids_are_rejected(self):
        with mock.patch.object(reader.os, 'readlink', return_value='/bin/sh'):
            with self.assertRaisesRegex(reader.CaptureError, '^UNSUPPORTED_EXISTING_BINARY$'):
                reader.process_identity(42)
        with self.assertRaisesRegex(reader.CaptureError, '^EXPECTED_ONE_LLAMA_SERVER$'):
            reader.select_pid(lambda *_: 'PID COMMAND\n1 tini\n42 llama-server\n43 server\n', 'container')
        self.assertIsNone(reader.compose_metadata({})['configFiles'])
        self.assertFalse(reader.compose_metadata({})['launchFileOwnershipVerified'])
        self.assertIsNone(reader.compose_metadata({'configFiles': '/tmp/../PRIVATE'})['configFiles'])

    def test_process_identity_verifies_existing_binary_against_container_root(self):
        ticks = ['0'] * 20
        ticks[19] = '12345'
        stat = '42 (llama-server) ' + ' '.join(ticks)
        with mock.patch.object(reader.os, 'readlink', return_value='/app/llama-server'), \
             mock.patch.object(Path, 'stat', return_value=SimpleNamespace(st_dev=7, st_ino=8)), \
             mock.patch.object(Path, 'open', return_value=io.StringIO(stat)):
            target, identity = reader.process_identity(42)
        self.assertEqual(target, '/app/llama-server')
        self.assertEqual(identity['startTicks'], 12345)
        with mock.patch.object(reader.os, 'readlink', return_value='/app/server'), \
             mock.patch.object(Path, 'stat', side_effect=[SimpleNamespace(st_dev=7, st_ino=8), SimpleNamespace(st_dev=7, st_ino=9)]):
            with self.assertRaisesRegex(reader.CaptureError, '^BINARY_IDENTITY_MISMATCH$'):
                reader.process_identity(42)

    def test_docker_command_has_empty_config_local_socket_fixed_env_no_shell_and_output_bound(self):
        process = mock.Mock()
        process.stdout.fileno.return_value = 11
        process.poll.return_value = 0
        process.wait.return_value = 0
        selector = mock.MagicMock()
        selector.__enter__.return_value = selector
        selector.select.return_value = [(process.stdout, 1)]
        with mock.patch.object(Path, 'is_file', return_value=True), \
             mock.patch.object(reader.subprocess, 'Popen', return_value=process) as start, \
             mock.patch.object(reader.selectors, 'DefaultSelector', return_value=selector), \
             mock.patch.object(reader.os, 'read', side_effect=[b'ok', b'']):
            self.assertEqual(reader.docker_reader('/empty', reader.time.monotonic() + 10)('top', 'queen', '-eo', 'pid,comm'), 'ok')
        args, kwargs = start.call_args
        self.assertEqual(args[0][1:5], ['--config', '/empty', '--host', 'unix:///var/run/docker.sock'])
        self.assertEqual(kwargs['env'], reader.FIXED_ENV)
        self.assertEqual(kwargs['stderr'], reader.subprocess.DEVNULL)
        self.assertNotIn('shell', kwargs)
        with mock.patch.object(reader.subprocess, 'Popen', return_value=process), \
             mock.patch.object(reader.selectors, 'DefaultSelector', return_value=selector), \
             mock.patch.object(reader.os, 'read', return_value=b'PRIVATE_LONG_OUTPUT'), \
             mock.patch.object(reader, 'MAX_OUTPUT', 4):
            with self.assertRaisesRegex(reader.CaptureError, '^COMMAND_OUTPUT_LIMIT$'):
                reader.bounded_command(['docker', 'top'], reader.time.monotonic() + 10)
        with mock.patch.object(reader.subprocess, 'Popen') as start:
            with self.assertRaisesRegex(reader.CaptureError, '^CAPTURE_DEADLINE$'):
                reader.bounded_command(['docker', 'top'], reader.time.monotonic() - 1)
            start.assert_not_called()


if __name__ == '__main__':
    unittest.main()
