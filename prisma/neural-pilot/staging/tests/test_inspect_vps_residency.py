"""Only regressions needed to make the one-shot residency capture safe and useful."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock


spec = importlib.util.spec_from_file_location('residency', Path(__file__).parents[1] / 'inspect-vps-residency.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class ResidencyTests(unittest.TestCase):
    def test_parent_limits_count_and_absent_v2_root_controls_are_not_failures(self):
        levels = [
            {'files': {'memory.max': 'max', 'memory.high': 'max'}},
            {'files': {'memory.max': '3000000', 'memory.high': '2000000'}},
            {'isHierarchyRoot': True, 'files': {
                name: {'error': 'FileNotFoundError', 'errno': 2} for name in ('memory.max', 'memory.high')}},
        ]
        result = reader.v2_limit_summary(levels, True)
        self.assertEqual(result['memory.max']['minimumFiniteBytes'], 3000000)
        self.assertEqual(result['memory.high']['minimumFiniteBytes'], 2000000)
        self.assertTrue(result['memory.high']['allLevelsReadable'])

    def test_missing_nonroot_control_is_unknown_not_unlimited(self):
        levels = [{'files': {'memory.max': {'error': 'PermissionError', 'errno': 13}, 'memory.high': 'max'}}]
        result = reader.v2_limit_summary(levels, True)
        self.assertFalse(result['memory.max']['allLevelsReadable'])
        self.assertFalse(result['memory.max']['unboundedAtAllLevels'])
        self.assertIsNone(result['memory.max']['minimumFiniteBytes'])

    def test_delegated_mount_does_not_claim_invisible_ancestors_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / 'child').mkdir()
            (base / 'child' / 'memory.max').write_text('1500000')
            mounts = f'23 1 0:20 /parent {base} rw - cgroup2 cgroup rw\n'
            original_read = reader.read
            def fake_read(path):
                if str(path) == '/proc/42/cgroup':
                    return '0::/parent/child'
                if str(path) == '/proc/self/mountinfo':
                    return mounts
                return original_read(path)
            with mock.patch.object(reader, 'read', side_effect=fake_read):
                result = reader.cgroups(42)[0]
        self.assertFalse(result['visibleAncestorsComplete'])
        self.assertEqual(result['limits']['memory.max']['minimumObservedFiniteBytes'], 1500000)
        self.assertIsNone(result['limits']['memory.max']['minimumFiniteBytes'])
        self.assertFalse(any(level['isHierarchyRoot'] for level in result['levels']))

    def test_smaps_aggregates_residency_without_paths_or_guessed_kv(self):
        text = ('1000-3000 r--p 00000000 08:00 1 /PRIVATE/model.gguf\n'
                'Size: 8 kB\nRss: 4 kB\nPss: 4 kB\n'
                '3000-4000 rw-p 00000000 00:00 0 [heap]\n'
                'Size: 4 kB\nRss: 4 kB\nAnonymous: 4 kB\n'
                '5000-900000 r--p 00000000 08:00 2 /models/cache/PRIVATE-opaque-hash\n'
                'Size: 8192 kB\nRss: 1024 kB\n')
        result = reader.parse_smaps(text)
        self.assertEqual(result['gguf']['bytes']['SizeBytes'], 8192)
        self.assertEqual(result['gguf']['bytes']['RssBytes'], 4096)
        self.assertIsNone(result['kvBytes'])
        self.assertIsNone(result['computeBufferBytes'])
        self.assertEqual(result['largeFileMappings'][0]['pathClass'], 'model-cache-candidate')
        self.assertEqual(result['largeFileMappings'][0]['bytes']['RssBytes'], 1024**2)
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('model.gguf', json.dumps(result))

    def test_docker_reads_use_empty_config_local_socket_and_no_inherited_env(self):
        with mock.patch.object(Path, 'is_file', return_value=True), \
             mock.patch.object(reader.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, 'ok')) as run:
            result = reader.docker_reader('/empty-config')('top', 'prisma-neural-qwen', '-eo', 'pid,comm')
        self.assertEqual(result, 'ok')
        args, kwargs = run.call_args
        self.assertEqual(args[0][1:5], ['--config', '/empty-config', '--host', 'unix:///var/run/docker.sock'])
        self.assertEqual(kwargs['env'], {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'})
        self.assertEqual(kwargs['stderr'], subprocess.DEVNULL)

    def test_selects_llama_not_tini_and_preserves_partial_report(self):
        metadata = {'initPid': 1, 'startedAt': 'fixed', 'restartCount': 0, 'imageId': 'fixed'}
        def docker(*args):
            return json.dumps(metadata) if args[0] == 'inspect' else 'PID COMMAND\n1 tini\n42 llama-server\n'
        partial = {}
        with mock.patch.object(reader, 'docker_reader', return_value=docker), \
             mock.patch.object(reader, 'snapshot', side_effect=reader.CaptureDeadline()) as snapshot:
            with self.assertRaises(reader.CaptureDeadline):
                reader.capture('prisma-neural-qwen', report=partial)
        snapshot.assert_called_once_with(42)
        self.assertEqual(partial['hostPid'], 42)
        self.assertEqual(partial['dockerBefore'], metadata)
        self.assertEqual(partial['generationRequests'], 0)


if __name__ == '__main__':
    unittest.main()
