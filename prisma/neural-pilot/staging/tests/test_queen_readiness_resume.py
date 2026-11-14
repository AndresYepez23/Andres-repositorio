"""Offline regressions for a transient startup reset and unspent-probe resume."""
import http.client
import json
import sys
import unittest
from unittest import mock
import test_queen_trial_main as helpers

trial = helpers.trial
REAL_READY = trial.trial_ready


class ReadyTests(unittest.TestCase):
    def test_startup_disconnect_and_reset_retry_only_bounded_metadata(self):
        clock, paths = [0.0], []
        current = {'Id': 'created', 'Config': {'Env': ['LLAMA_API_KEY=fixture']}, 'State': {'Running': True}, 'RestartCount': 0}
        failures = [http.client.RemoteDisconnected('PRIVATE_STARTUP_DETAIL'), ConnectionResetError('PRIVATE_RESET_DETAIL')]
        def request(_opener, _key, path, **kwargs):
            paths.append(path)
            self.assertGreater(kwargs['timeout'], 0); self.assertLessEqual(kwargs['timeout'], 5)
            if failures:
                raise failures.pop(0)
            return '{"status":"ok"}'
        with mock.patch.object(trial, 'trial_inspect', return_value=current), \
             mock.patch.object(trial, 'trial_opener'), mock.patch.object(trial, 'trial_idle') as idle, \
             mock.patch.object(trial, 'request', side_effect=request), \
             mock.patch.object(trial.time, 'monotonic', side_effect=lambda: clock[0]), \
             mock.patch.object(trial.time, 'sleep', side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)), \
             mock.patch.object(trial, 'run_probe') as probe:
            self.assertIs(REAL_READY('created', seconds=180), current)
            idle.assert_called_once_with(current); probe.assert_not_called()
        self.assertEqual(paths, ['/health', '/health', '/health'])
        self.assertLessEqual(clock[0], 180)

    def test_repeated_connection_resets_expire_without_any_completion_request(self):
        clock, paths = [0.0], []
        current = {'Id': 'created', 'Config': {'Env': ['LLAMA_API_KEY=fixture']}, 'State': {'Running': True}, 'RestartCount': 0}
        def request(_opener, _key, path, **kwargs):
            paths.append(path); clock[0] += kwargs['timeout']
            raise ConnectionResetError('PRIVATE_DETAIL')
        with mock.patch.object(trial, 'trial_inspect', return_value=current), \
             mock.patch.object(trial, 'trial_opener'), mock.patch.object(trial, 'trial_idle') as idle, \
             mock.patch.object(trial, 'request', side_effect=request), \
             mock.patch.object(trial.time, 'monotonic', side_effect=lambda: clock[0]), \
             mock.patch.object(trial.time, 'sleep', side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)), \
             mock.patch.object(trial, 'run_probe') as probe:
            with self.assertRaises(trial.TrialError):
                REAL_READY('created', seconds=180)
            probe.assert_not_called(); idle.assert_not_called()
        self.assertEqual(clock[0], 180)
        self.assertTrue(paths); self.assertTrue(all(path == '/health' for path in paths))
        self.assertLessEqual(len(paths), 27)


class ResumeTests(unittest.TestCase):
    setUp = helpers.MainTests.setUp
    state = helpers.MainTests.state

    def prepare_resume(self, completion_reserved=False):
        state = {'mutationReserved': True, 'completionReserved': completion_reserved,
                 'originalContainerId': 'original', 'createdContainerId': 'created'}
        (self.root / 'state.json').write_text(json.dumps(state))
        (self.root / 'baseline.private.json').write_text(json.dumps(self.config))
        (self.root / 'image-pin.json').write_text(json.dumps({'services': {'qwen': {'image': trial.TRIAL_IMAGE, 'pull_policy': 'never'}}}))
        (self.root / 'cache-off.json').write_text(json.dumps({'services': {'qwen': {'environment': trial.TRIAL_CACHE}}}))
        self.after['Config']['Labels'].update({
            'com.docker.compose.project': 'neural-pilot', 'com.docker.compose.service': 'qwen',
            'com.docker.compose.project.working_dir': str(trial.TRIAL_BASE.parent),
            'com.docker.compose.project.config_files': ','.join(str(self.root / name) for name in
                ('baseline.private.json', 'image-pin.json', 'cache-off.json'))})
        patch = mock.patch.object(trial, 'trial_docker', return_value=json.dumps([self.image]))
        self.docker = patch.start(); self.addCleanup(patch.stop)

    def test_resume_waits_existing_container_and_reserves_the_single_unspent_probe(self):
        self.prepare_resume()
        def probe(container_id):
            self.assertEqual(container_id, 'created'); self.assertTrue(self.state()['completionReserved'])
            return {'completionAttempted': True, 'outcome': 'response-received'}
        trial.run_probe.side_effect = probe
        with mock.patch.object(sys, 'argv', ['trial.py', '--resume']):
            self.assertEqual(trial.trial_main(), 0)
        trial.trial_prepare.assert_not_called(); trial.trial_stop.assert_not_called(); trial.trial_up.assert_not_called()
        trial.trial_ready.assert_called_once_with('created'); trial.run_probe.assert_called_once()
        self.assertEqual(self.state()['createdContainerId'], 'created')

    def test_resume_refuses_a_probe_that_was_already_reserved(self):
        self.prepare_resume(completion_reserved=True)
        with mock.patch.object(sys, 'argv', ['trial.py', '--resume']):
            self.assertEqual(trial.trial_main(), 2)
        trial.trial_prepare.assert_not_called(); trial.trial_stop.assert_not_called(); trial.trial_up.assert_not_called()
        trial.trial_ready.assert_not_called(); trial.run_probe.assert_not_called()
        self.assertTrue(self.state()['completionReserved'])

    def test_resume_refuses_an_unrelated_current_container_without_recreation(self):
        self.prepare_resume(); self.after['Id'] = 'unrelated'
        with mock.patch.object(sys, 'argv', ['trial.py', '--resume']):
            self.assertEqual(trial.trial_main(), 2)
        trial.trial_prepare.assert_not_called(); trial.trial_stop.assert_not_called(); trial.trial_up.assert_not_called()
        trial.trial_ready.assert_not_called(); trial.run_probe.assert_not_called()
        self.assertFalse(self.state()['completionReserved'])

    def test_unknown_resume_outcome_does_not_allow_a_second_probe_or_recreation(self):
        self.prepare_resume()
        trial.run_probe.return_value = {'completionAttempted': True, 'outcome': 'unknown', 'usage': None, 'code': 'GENERATION_DEADLINE'}
        with mock.patch.object(sys, 'argv', ['trial.py', '--resume']):
            self.assertEqual(trial.trial_main(), 2)
            self.assertEqual(trial.trial_main(), 2)
        trial.run_probe.assert_called_once(); trial.trial_stop.assert_not_called(); trial.trial_up.assert_not_called()
        self.assertTrue(self.state()['completionReserved'])


if __name__ == '__main__':
    unittest.main()
