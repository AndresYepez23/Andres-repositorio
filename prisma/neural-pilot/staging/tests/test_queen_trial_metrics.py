"""Fixtures only; no real Docker, proc metrics, VPS or inference."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('trial_metrics', Path(__file__).resolve().parents[1] / 'queen-cache-trial.py')
metrics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metrics)


def inspected(cid='a' * 64, restarts=0):
    return {'Id': cid, 'RestartCount': restarts,
            'State': {'Pid': 42, 'Running': True, 'Restarting': False, 'OOMKilled': False},
            'Config': {'Env': ['SECRET_API_KEY=PRIVATE'], 'Cmd': ['PRIVATE_PROMPT']}}


def cg(cpu=1000000, mem=1000, read=10):
    return {'memoryBytes': mem, 'swapBytes': 0, 'anonBytes': 700, 'fileBytes': 300,
            'events': {'oom': 0, 'oom_kill': 0, 'high': 0, 'max': 0},
            'cpuUsageUsec': cpu, 'ioDevices': {'253:1': {'rbytes': read, 'wbytes': 2}}}


def proc(path):
    return {'/proc/meminfo': 'MemTotal: 4000 kB\nMemAvailable: 500 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n',
            '/proc/stat': 'cpu  10 0 5 70 15 0 0 0 0 0\n',
            '/proc/vmstat': 'oom_kill 0\npgmajfault 100\npswpin 0\npswpout 0\n'}.get(str(path))


class TrialMetricsTests(unittest.TestCase):
    def test_immediate_private_baseline_no_secret_output_and_unknown_deltas(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'samples.jsonl'
            with mock.patch.object(metrics, '_trial_read', side_effect=proc), \
                 mock.patch.object(metrics, '_trial_cgroup', return_value=cg()):
                sampler = metrics.TrialSampler(lambda: inspected(), output).start()
                summary = sampler.stop()
            rows = [json.loads(line) for line in output.read_text().splitlines()]
            self.assertEqual(len(rows), 2)
            self.assertTrue(summary['finalSampleCaptured'])
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertEqual(summary['hostMemAvailableMinBytes'], 500 * 1024)
            self.assertEqual(summary['hostSwapUsedMaxBytes'], 0)
            self.assertIsNone(summary['hostCpuBusyPercentMax'])
            self.assertIs(summary['containers'][0]['oomObservedWithinCoverage'], False)
            self.assertEqual(summary['containers'][0]['unexpectedRestartDelta'], 0)
            self.assertNotIn('PRIVATE', output.read_text() + json.dumps(summary))
            self.assertNotIn('Env', output.read_text())

    def sampled(self, folder, inspections, groups):
        sampler = metrics.TrialSampler(mock.Mock(side_effect=inspections), Path(folder) / 'samples.jsonl')
        sampler._fd = os.open(sampler.output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with mock.patch.object(metrics, '_trial_read', side_effect=proc), \
             mock.patch.object(metrics, '_trial_cgroup', side_effect=groups), \
             mock.patch.object(metrics.time, 'monotonic', side_effect=[0, 2, 4]):
            for _ in inspections:
                sampler._sample()
        os.close(sampler._fd)
        sampler._fd = None
        return sampler.stop()

    def test_container_recreation_does_not_bridge_cpu_or_io_counters(self):
        with tempfile.TemporaryDirectory() as folder:
            summary = self.sampled(folder, [inspected(), inspected('b' * 64), inspected('b' * 64)],
                                   [cg(9000000, 3000, 10000), cg(1000000, 1000, 10), cg(2000000, 2000, 20)])
        a, b = summary['containers']
        self.assertIsNone(a['cpuPercentOfOneCoreMax'])
        self.assertIsNone(a['ioDeviceDeltas'])
        self.assertEqual(b['cpuPercentOfOneCoreMax'], 50)
        self.assertEqual(b['memoryPeakBytes'], 2000)
        self.assertEqual(b['ioDeviceDeltas']['253:1']['rbytes'], 10)
        self.assertIs(b['oomObservedWithinCoverage'], False)

    def test_final_sample_captures_fast_recreated_container_without_waiting(self):
        with tempfile.TemporaryDirectory() as folder:
            current = [inspected()]
            with mock.patch.object(metrics, '_trial_read', side_effect=proc), \
                 mock.patch.object(metrics, '_trial_cgroup', return_value=cg()):
                sampler = metrics.TrialSampler(lambda: current[0], Path(folder) / 'samples.jsonl').start()
                current[0] = inspected('b' * 64)
                sampler.phase = 'after'
                summary = sampler.stop()
            self.assertEqual(len(summary['containers']), 2)
            self.assertEqual(summary['containers'][1]['id'], 'b' * 64)
            self.assertIsNone(summary['containers'][1]['oomObservedWithinCoverage'])
            self.assertTrue(summary['finalSampleCaptured'])
            self.assertIsNone(sampler._fd)
            rows = [json.loads(line) for line in sampler.output_path.read_text().splitlines()]
            self.assertEqual(rows[-1]['phase'], 'after')

    def test_restarts_invalidate_endpoint_deltas_and_do_not_claim_no_oom(self):
        with tempfile.TemporaryDirectory() as folder:
            summary = self.sampled(folder, [inspected(), inspected(restarts=1), inspected(restarts=1)],
                                   [cg(9000000, 3000, 10000), cg(1000000, 1000, 10), cg(2000000, 2000, 20)])
        row = summary['containers'][0]
        self.assertEqual(row['unexpectedRestartDelta'], 1)
        self.assertEqual(row['cpuPercentOfOneCoreMax'], 50)
        self.assertIsNone(row['ioDeviceDeltas'])
        self.assertIsNone(row['memoryEventsDelta']['oom_kill'])
        self.assertIsNone(row['oomObservedWithinCoverage'])

    def test_missing_readings_and_private_inspect_failure_stay_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'samples.jsonl'
            def failed():
                raise ValueError('PRIVATE_DOCKER_SECRET')
            with mock.patch.object(metrics, '_trial_read', return_value=None):
                sampler = metrics.TrialSampler(failed, output).start()
                summary = sampler.stop()
            self.assertEqual(summary['inspectSamples'], 0)
            self.assertIsNone(summary['hostSwapUsedMaxBytes'])
            self.assertEqual(summary['containers'], [])
            self.assertNotIn('PRIVATE', output.read_text())

    def test_cgroup_rejects_traversal_and_filters_numeric_fields(self):
        with mock.patch.object(metrics, '_trial_read', return_value='0::/../../PRIVATE\n') as read:
            self.assertEqual(metrics._trial_cgroup(42), {})
            self.assertEqual(read.call_count, 1)
        def files(path):
            name = str(path)
            if name == '/proc/42/cgroup': return '0::/queen\n'
            return {'memory.current': '1000', 'memory.swap.current': '0',
                    'memory.events': 'oom 0\noom_kill 0\nSECRET 999\n',
                    'memory.stat': 'anon 700\nfile 300\nPRIVATE 999\n',
                    'cpu.stat': 'usage_usec 2000000\n',
                    'io.stat': '253:1 rbytes=10 wbytes=2 rios=9\n'}.get(Path(name).name)
        with mock.patch.object(metrics, '_trial_read', side_effect=files):
            result = metrics._trial_cgroup(42)
        self.assertEqual(result['anonBytes'], 700)
        self.assertEqual(result['ioDevices']['253:1'], {'rbytes': 10, 'wbytes': 2})
        self.assertNotIn('PRIVATE', json.dumps(result))
        self.assertNotIn('SECRET', json.dumps(result))

    def test_stop_join_is_bounded_and_reports_live_daemon_instead_of_completion(self):
        sampler = metrics.TrialSampler(lambda: inspected(), '/unused-fixture-output')
        sampler._thread = mock.Mock()
        sampler._thread.is_alive.return_value = True
        summary = sampler.stop()
        sampler._thread.join.assert_called_once_with(timeout=8)
        self.assertTrue(summary['samplerStillRunning'])
        self.assertEqual(summary['samples'], 0)


if __name__ == '__main__':
    unittest.main()
