"""Offline fixtures only: these values are not VPS measurements."""
import importlib.util
import json
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('analyze_vps', pathlib.Path(__file__).parents[1] / 'analyze-vps.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def sample(index, **updates):
    row = {'at': f'2026-11-13T00:00:0{index}Z', 'hostVcpus': 2,
           'hostMemory': {'MemAvailableBytes': 2000, 'SwapTotalBytes': 1000, 'SwapFreeBytes': 700},
           'hostCpuPercent': None if index == 0 else 25,
           'container': {'CPUPerc': '100%', 'MemUsage': '1 MiB / 4 GiB'},
           'stability': {'OOMKilled': False, 'restartCount': 0, 'StartedAt': 'unchanged', 'Restarting': False}}
    row.update(updates)
    return json.dumps(row)


class CoverageTests(unittest.TestCase):
    def test_complete_capture_requires_count_exit_status_and_signal_coverage(self):
        result = module.summarize([sample(0), sample(1)], 2, 0)
        self.assertTrue(result['capture']['complete'])
        self.assertEqual(result['containerRamBytes']['max'], 1024**2)
        self.assertEqual(result['swapBytes']['maxUsed'], 300)
        self.assertEqual(result['hostCpuPercent']['mean'], 25)

    def test_old_cli_compatible_data_does_not_assume_monitor_success(self):
        self.assertFalse(module.summarize([sample(0), sample(1)])['capture']['complete'])
        self.assertIsNone(module.summarize([sample(0)])['capture']['monitorExitCode'])

    def test_interrupted_or_truncated_capture_keeps_valid_measurements(self):
        result = module.summarize([sample(0), '{"at":'], 120, 143)
        self.assertFalse(result['capture']['complete'])
        self.assertEqual(result['samples'], 1)
        self.assertEqual(result['capture']['invalidSampleLines'], [2])
        self.assertEqual(result['dockerCpuPercentOfOneCore']['mean'], 100)

    def test_docker_permission_errors_are_missing_coverage_not_zero_usage(self):
        result = module.summarize([sample(0, container={}, stability={}, containerError='DOCKER_STATS_FAILED')], 1, 0)
        self.assertFalse(result['capture']['complete'])
        self.assertIsNone(result['containerRamBytes']['max'])
        self.assertEqual(result['capture']['coverage']['containerStability'], 0)
        self.assertEqual(result['monitorErrors'], 1)

    def test_empty_capture_does_not_establish_stability(self):
        result = module.summarize([], 120, 0)
        self.assertFalse(result['capture']['complete'])
        self.assertEqual(result['capture']['coverage']['containerStability'], 0)
        self.assertIsNone(result['restartCountIncrease'])

    def test_invalid_restart_counts_do_not_establish_stability_coverage(self):
        for count in (False, True, -1, None, 1.5):
            with self.subTest(count=count):
                result = module.summarize([sample(0, stability={
                    'OOMKilled': False, 'restartCount': count})], 1, 0)
                self.assertFalse(result['capture']['complete'])
                self.assertEqual(result['capture']['coverage']['containerStability'], 0)
                self.assertIsNone(result['restartCountIncrease'])

    def test_restart_between_samples_is_observed_even_with_false_restarting(self):
        rows = [sample(0), sample(1, stability={'OOMKilled': False, 'restartCount': 1, 'StartedAt': 'new', 'Restarting': False})]
        self.assertTrue(module.summarize(rows, 2, 0)['containerRestartsObserved'])

    def test_nonfinite_cpu_is_unknown_and_json_stays_standard(self):
        result = module.summarize([sample(0, container={'CPUPerc': 'NaN', 'MemUsage': None})], 1, 0)
        self.assertIsNone(result['dockerCpuPercentOfOneCore']['mean'])
        self.assertFalse(result['capture']['complete'])
        json.dumps(result, allow_nan=False)


if __name__ == '__main__':
    unittest.main()
