"""Offline orchestrator safety tests. All Docker, model and sampler calls mocked."""
import copy
import datetime
import importlib.util
import io
import json
from pathlib import Path
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest import mock
import urllib.request
from test_queen_trial_guard import baseline

spec = importlib.util.spec_from_file_location('trial', Path(__file__).resolve().parents[1] / 'queen-cache-trial.py')
trial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trial)
REAL_STOP = trial.trial_stop
REAL_UP = trial.trial_up


class Sampler:
    def __init__(self, *_): self.phase = 'before'
    def start(self): pass
    def stop(self): return {'fixture': True}


class MainTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.root = root
        original_is_file = Path.is_file
        original_lstat = Path.lstat
        def owned_metadata(path):
            value = original_lstat(path)
            return SimpleNamespace(st_mode=value.st_mode, st_uid=0)
        self.patches = [mock.patch.object(trial, 'TRIAL_ROOT', root),
                        mock.patch.object(trial.os, 'geteuid', return_value=0),
                        mock.patch.object(trial.os, 'umask', return_value=0o022),
                        mock.patch.object(trial.signal, 'signal'),
                        mock.patch.object(Path, 'lstat', autospec=True, side_effect=owned_metadata),
                        mock.patch.object(Path, 'is_file', autospec=True, side_effect=lambda p: str(p) == '/usr/bin/docker' or original_is_file(p)),
                        mock.patch.object(trial, 'TrialSampler', Sampler, create=True),
                        mock.patch.object(trial, 'run_probe', create=True),
                        mock.patch.object(trial, 'trial_prepare'),
                        mock.patch.object(trial, 'trial_stop'),
                        mock.patch.object(trial, 'trial_up'),
                        mock.patch.object(trial, 'trial_ready'),
                        mock.patch.object(trial, 'trial_inspect'),
                        mock.patch.object(trial, 'trial_argv'),
                        mock.patch.object(sys, 'argv', ['trial.py']),
                        mock.patch('sys.stdout', new_callable=io.StringIO)]
        for patch in self.patches:
            patch.start(); self.addCleanup(patch.stop)
        config, before, image, argv = baseline()
        image['Id'] = before['Image'] = trial.TRIAL_IMAGE
        before.update(Id='original', State={'Running': True, 'Restarting': False})
        after = copy.deepcopy(before); after['Id'] = 'created'; after['Config']['Image'] = trial.TRIAL_IMAGE
        after['Config']['Env'] += [key + '=' + value for key, value in trial.TRIAL_CACHE.items()]
        self.config, self.before, self.after, self.image, self.argv = config, before, after, image, argv
        trial.trial_prepare.return_value = (before, image, copy.deepcopy(config))
        trial.trial_up.return_value = after
        trial.trial_ready.return_value = after
        trial.trial_argv.return_value = argv
        trial.trial_inspect.return_value = after
        trial.run_probe.return_value = {'completionAttempted': True, 'outcome': 'response-received', 'usage': {'completion_tokens': 2}}

    def state(self):
        return json.loads((self.root / 'state.json').read_text())

    def test_preflight_failure_does_not_mutate_or_generate(self):
        trial.trial_prepare.side_effect = trial.TrialGuardError('ENVIRONMENT')
        self.assertEqual(trial.trial_main(), 2)
        trial.trial_stop.assert_not_called(); trial.trial_up.assert_not_called(); trial.run_probe.assert_not_called()
        self.assertFalse((self.root / 'state.json').exists())
        self.assertNotIn('PRIVATE', sys.stdout.getvalue())

    def test_inactive_controller_is_replaced_atomically_without_reserving_mutation(self):
        saved, incoming = self.root / 'trial.py', self.root / 'incoming-v2.py'
        saved.write_bytes(b'OLD_CONTROLLER_FIXTURE\n')
        incoming.write_bytes(b'NEW_CONTROLLER_FIXTURE\n')
        with mock.patch.object(trial, '__file__', str(incoming)):
            trial.trial_save_controller({})
        self.assertEqual(saved.read_bytes(), incoming.read_bytes())
        self.assertEqual(saved.stat().st_mode & 0o777, 0o600)
        self.assertFalse((self.root / 'state.json').exists())
        trial.trial_prepare.assert_not_called()
        trial.trial_stop.assert_not_called()
        trial.run_probe.assert_not_called()

    def test_active_controller_and_inference_reservation_remain_unchanged(self):
        saved, incoming = self.root / 'trial.py', self.root / 'incoming-v2.py'
        saved.write_bytes(b'ACTIVE_CONTROLLER_FIXTURE\n')
        incoming.write_bytes(b'NEW_CONTROLLER_FIXTURE\n')
        state = {'mutationReserved': True, 'completionReserved': True,
                 'originalContainerId': 'original', 'createdContainerId': 'created'}
        (self.root / 'state.json').write_text(json.dumps(state))
        original_state = (self.root / 'state.json').read_bytes()
        with mock.patch.object(trial, '__file__', str(incoming)):
            trial.trial_save_controller(state)
        self.assertEqual(saved.read_bytes(), b'ACTIVE_CONTROLLER_FIXTURE\n')
        self.assertEqual((self.root / 'state.json').read_bytes(), original_state)
        self.assertTrue(state['completionReserved'])

    def test_prechange_failure_updates_saved_controller_before_prepare_without_mutation(self):
        saved, incoming = self.root / 'trial.py', self.root / 'incoming-v2.py'
        saved.write_bytes(b'OLD_CONTROLLER_FIXTURE\n')
        incoming.write_bytes(b'NEW_CONTROLLER_FIXTURE\n')
        def fail_before_change():
            self.assertEqual(saved.read_bytes(), incoming.read_bytes())
            self.assertFalse((self.root / 'state.json').exists())
            raise trial.TrialGuardError('UNSUPPORTED_SERVICE_SETTINGS')
        trial.trial_prepare.side_effect = fail_before_change
        with mock.patch.object(trial, '__file__', str(incoming)):
            self.assertEqual(trial.trial_main(), 2)
        trial.trial_stop.assert_not_called()
        trial.trial_up.assert_not_called()
        trial.run_probe.assert_not_called()
        self.assertFalse((self.root / 'state.json').exists())

    def test_mutation_marker_blocks_recreation_and_generation_on_rerun(self):
        (self.root / 'state.json').write_text(json.dumps({'mutationReserved': True, 'completionReserved': False}))
        self.assertEqual(trial.trial_main(), 0)
        trial.trial_prepare.assert_not_called(); trial.trial_stop.assert_not_called(); trial.trial_up.assert_not_called(); trial.run_probe.assert_not_called()

    def test_stop_precedes_up_and_probe_is_reserved_before_dispatch(self):
        events = []
        def stop(*_, **__):
            self.assertTrue(self.state()['mutationReserved']); events.append('stop')
        def up(*_, **__):
            self.assertEqual(events, ['stop']); events.append('up'); return self.after
        def probe(container_id):
            self.assertTrue(self.state()['completionReserved']); self.assertEqual(container_id, 'created')
            events.append('probe'); return {'completionAttempted': True, 'outcome': 'response-received'}
        trial.trial_stop.side_effect = stop; trial.trial_up.side_effect = up; trial.run_probe.side_effect = probe
        self.assertEqual(trial.trial_main(), 0)
        self.assertEqual(events, ['stop', 'up', 'probe']); trial.run_probe.assert_called_once()

    def test_unconfirmed_stop_never_starts_another_model(self):
        trial.trial_stop.side_effect = trial.TrialError('STOP_NOT_CONFIRMED_NO_START')
        self.assertEqual(trial.trial_main(), 2)
        trial.trial_up.assert_not_called(); trial.run_probe.assert_not_called()
        self.assertTrue(self.state()['mutationReserved']); self.assertFalse(self.state()['completionReserved'])

    def test_post_recreation_environment_drift_blocks_generation(self):
        self.after['Config']['Env'].append('UNEXPECTED=PRIVATE_SECRET')
        self.assertEqual(trial.trial_main(), 2)
        trial.run_probe.assert_not_called(); self.assertFalse(self.state()['completionReserved'])
        self.assertNotIn('PRIVATE', sys.stdout.getvalue())

    def test_pinned_image_reference_survives_original_untagged_image(self):
        self.image['RepoTags'] = []
        self.assertEqual(trial.trial_main(), 0)
        trial.run_probe.assert_called_once()

    def test_uncertain_probe_is_not_retried_or_automatically_restarted(self):
        trial.run_probe.return_value = {'completionAttempted': True, 'outcome': 'unknown', 'code': 'GENERATION_DEADLINE', 'usage': None}
        self.assertEqual(trial.trial_main(), 2)
        trial.run_probe.assert_called_once(); trial.trial_stop.assert_called_once(); trial.trial_up.assert_called_once()
        self.assertTrue(self.state()['completionReserved'])

    def test_rollback_has_no_completion_call(self):
        (self.root / 'state.json').write_text(json.dumps({'mutationReserved': True, 'completionReserved': True, 'originalContainerId': 'original', 'createdContainerId': 'created'}))
        with mock.patch.object(sys, 'argv', ['trial.py', '--rollback']):
            self.assertEqual(trial.trial_main(), 0)
        trial.run_probe.assert_not_called(); trial.trial_prepare.assert_not_called()
        self.assertFalse(trial.trial_up.call_args.kwargs['cache'])
        self.assertTrue(self.state()['rolledBack'])

    def test_actual_stop_refuses_an_unexpected_container_before_docker_mutation(self):
        trial.trial_inspect.return_value = self.after
        with mock.patch.object(trial, 'trial_docker') as docker:
            with self.assertRaisesRegex(trial.TrialError, '^CONTAINER_CHANGED_DO_NOT_STOP$'):
                REAL_STOP(expected_id='original')
            docker.assert_not_called()

    def test_actual_stop_requires_confirmed_stopped_state_even_when_stop_command_fails(self):
        trial.trial_inspect.side_effect = [self.before, self.before]
        with mock.patch.object(trial, 'trial_docker', side_effect=trial.TrialError('fixture timeout')):
            with self.assertRaisesRegex(trial.TrialError, '^STOP_NOT_CONFIRMED_NO_START$'):
                REAL_STOP(expected_id='original')
        self.assertEqual(trial.trial_inspect.call_args_list, [mock.call(), mock.call('original')])

    def test_uncertain_up_records_only_our_recoverable_container_identity(self):
        (self.root / 'state.json').write_text(json.dumps({'mutationReserved': True}))
        labels = self.after['Config'].setdefault('Labels', {})
        labels.update({'com.docker.compose.project': 'neural-pilot', 'com.docker.compose.service': 'qwen',
                       'com.docker.compose.project.config_files': ','.join(str(self.root / name) for name in
                           ('baseline.private.json', 'image-pin.json', 'cache-off.json'))})
        with mock.patch.object(trial, 'trial_docker', side_effect=trial.TrialError('DOCKER_COMMAND_UNAVAILABLE_OR_TIMED_OUT')):
            with self.assertRaises(trial.TrialError):
                REAL_UP(cache=True)
        self.assertEqual(self.state()['createdContainerId'], 'created')
        trial.run_probe.assert_not_called()

    def test_uncertain_up_does_not_adopt_another_same_image_container(self):
        (self.root / 'state.json').write_text(json.dumps({'mutationReserved': True}))
        with mock.patch.object(trial, 'trial_docker', side_effect=trial.TrialError('DOCKER_COMMAND_UNAVAILABLE_OR_TIMED_OUT')):
            with self.assertRaises(trial.TrialError):
                REAL_UP(cache=True)
        self.assertNotIn('createdContainerId', self.state())


@unittest.skipUnless(shutil.which('docker'), 'Optional daemonless Compose renderer is unavailable')
class ComposeRenderTests(unittest.TestCase):
    def test_frozen_healthcheck_and_environment_keep_dollar_escapes_without_second_interpolation(self):
        config, live, image, argv = baseline()
        config['services']['qwen']['environment']['LLAMA_API_KEY'] = '${LLAMA_API_KEY}'
        live['Config']['Env'] = ['BASE=private', 'LLAMA_API_KEY=dummy$UNSETsuffix']
        escaped = 'curl -f -H "Authorization: Bearer $$LLAMA_API_KEY" http://127.0.0.1:7860/health'
        config['services']['qwen']['healthcheck'] = {
            'test': ['CMD-SHELL', escaped], 'interval': '30s', 'timeout': '5s',
            'retries': 3, 'start_period': '40s'}
        live['Config']['Healthcheck'] = {
            'Test': ['CMD-SHELL', escaped.replace('$$', '$')],
            'Interval': 30_000_000_000, 'Timeout': 5_000_000_000,
            'Retries': 3, 'StartPeriod': 40_000_000_000}
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            def render(value, name, with_key=False):
                source = folder / name
                source.write_text(json.dumps(value))
                no_daemon = folder / 'no-daemon.sock'
                self.assertFalse(no_daemon.exists())
                fixture_env = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'LC_ALL': 'C'}
                if with_key:
                    fixture_env['LLAMA_API_KEY'] = 'dummy$UNSETsuffix'
                result = subprocess.run([
                    shutil.which('docker'), '--config', directory,
                    '--host', 'unix://' + str(no_daemon), 'compose', '-p', 'queen',
                    '--project-directory', directory, '-f', str(source),
                    'config', '--format', 'json'], stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, timeout=10,
                    env=fixture_env)
                if result.returncode:
                    self.fail('Daemonless Compose fixture rendering failed; no configuration or stderr emitted')
                return json.loads(result.stdout)
            first = render(config, 'initial.json', with_key=True)
            second = render(first, 'frozen.json')
        self.assertEqual(first['services']['qwen']['healthcheck'], second['services']['qwen']['healthcheck'])
        self.assertIn('$$LLAMA_API_KEY', second['services']['qwen']['healthcheck']['test'][1])
        self.assertNotIn('dummy', json.dumps(second['services']['qwen']['healthcheck']))
        self.assertEqual(first['services']['qwen']['environment'], second['services']['qwen']['environment'])
        self.assertEqual(second['services']['qwen']['environment']['LLAMA_API_KEY'], 'dummy$$UNSETsuffix')
        # Real Compose output (including normalized network ipam) must pass the
        # pure Engine comparator, without rewriting the saved $$ representation.
        self.assertIsNone(trial.guard_trial(second, live, image, argv))


if __name__ == '__main__':
    unittest.main()
