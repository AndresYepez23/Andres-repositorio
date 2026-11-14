import copy
import unittest
# Load the preserved public v3 monolith; no duplicate runtime source modules.
import importlib.util
from pathlib import Path
_spec = importlib.util.spec_from_file_location('trial_guard', Path(__file__).resolve().parents[1] / 'queen-cache-trial.py')
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
guard_trial, TrialGuardError = _module.guard_trial, _module.TrialGuardError


def baseline():
    image = {'Id': 'sha256:' + 'a' * 64, 'Os': 'linux', 'Architecture': 'amd64', 'RepoTags': ['local:qwen'],
             'Config': {'Entrypoint': ['/app/llama-server'], 'Cmd': [], 'Env': ['BASE=private'], 'WorkingDir': '/app', 'User': '', 'Labels': {'version': 'fixture'}}}
    service = {'image': 'local:qwen', 'platform': 'linux/amd64', 'container_name': 'prisma-neural-qwen', 'init': True,
               'restart': 'unless-stopped', 'environment': {'LLAMA_API_KEY': 'PRIVATE_SECRET'}, 'command': ['--ctx-size', '2048'],
               'ports': [{'target': 7860, 'published': '7860', 'host_ip': '127.0.0.1', 'protocol': 'tcp', 'mode': 'ingress'}],
               'volumes': [{'type': 'bind', 'source': '/root/qwen/models', 'target': '/models', 'bind': {'create_host_path': True}}],
               'cpus': 2.0, 'stop_grace_period': '1m0s', 'networks': {'default': None}}
    config = {'services': {'qwen': service}, 'networks': {'default': {'name': 'queen_default'}}}
    container = {'Image': image['Id'], 'Name': '/prisma-neural-qwen',
                 'Config': {'Image': 'local:qwen', 'Entrypoint': ['/app/llama-server'], 'Cmd': ['--ctx-size', '2048'],
                            'Env': ['BASE=private', 'LLAMA_API_KEY=PRIVATE_SECRET'], 'WorkingDir': '/app', 'User': '',
                            'Labels': {'version': 'fixture', 'com.docker.compose.project': 'queen'}, 'StopTimeout': 60},
                 'HostConfig': {'Init': True, 'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0},
                                'NanoCpus': 2000000000, 'PortBindings': {'7860/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '7860'}]},
                                'NetworkMode': 'queen_default', 'IpcMode': 'private'},
                 'Mounts': [{'Type': 'bind', 'Source': '/root/qwen/models', 'Destination': '/models', 'RW': True, 'Propagation': 'rprivate'}],
                 'NetworkSettings': {'Ports': {'7860/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '7860'}]},
                                     'Networks': {'queen_default': {'IPAddress': '172.20.0.2', 'Aliases': ['qwen', 'prisma-neural-qwen']}}}}
    return config, container, image, ['/app/llama-server', '--ctx-size', '2048']


class GuardTests(unittest.TestCase):
    def reject(self, data, code):
        with self.assertRaisesRegex(TrialGuardError, '^' + code + '$') as raised:
            guard_trial(*data)
        self.assertNotIn('PRIVATE', str(raised.exception))

    def test_matching_normalized_baseline(self):
        self.assertIsNone(guard_trial(*baseline()))

    def test_inherited_command_and_entrypoint(self):
        c, live, image, argv = baseline()
        c['services']['qwen']['command'] = None
        image['Config']['Cmd'] = live['Config']['Cmd']
        self.assertIsNone(guard_trial(c, live, image, argv))

    def test_explicit_entrypoint_suppresses_image_command(self):
        c, live, image, argv = baseline()
        c['services']['qwen'].update(entrypoint=['/app/llama-server'], command=None)
        image['Config']['Cmd'] = ['--model', 'PRIVATE_MODEL']
        live['Config']['Cmd'] = None
        self.assertIsNone(guard_trial(c, live, image, argv))

    def test_command_or_entrypoint_drift(self):
        for key, code in [('Cmd', 'COMMAND'), ('Entrypoint', 'ENTRYPOINT')]:
            data = baseline(); data[1]['Config'][key] = ['PRIVATE_DRIFT']
            self.reject(data, code)

    def test_all_environment_keys_are_compared_privately(self):
        data = baseline(); data[1]['Config']['Env'].append('OTHER=PRIVATE_DRIFT')
        self.reject(data, 'ENVIRONMENT')

    def test_unset_env_removes_inherited_value_and_duplicate_rejects(self):
        data = baseline(); data[0]['services']['qwen']['environment']['BASE'] = None
        data[1]['Config']['Env'] = ['LLAMA_API_KEY=PRIVATE_SECRET']
        self.assertIsNone(guard_trial(*data))
        data[1]['Config']['Env'].append('LLAMA_API_KEY=PRIVATE_OTHER')
        self.reject(data, 'ENV_DUPLICATE')

    def test_unknown_service_setting_is_not_silently_ignored(self):
        data = baseline(); data[0]['services']['qwen']['privileged'] = True
        self.reject(data, 'UNSUPPORTED_SERVICE_SETTINGS')
        try:
            guard_trial(*data)
        except TrialGuardError as error:
            self.assertEqual(error.safe_details, {'unsupportedServiceKeys': ['privileged']})
        data[0]['services']['qwen']['PRIVATE_SECRET_WITH SPACES'] = 'PRIVATE_VALUE'
        try:
            guard_trial(*data)
        except TrialGuardError as error:
            self.assertEqual(error.safe_details, {'unsupportedServiceKeys': ['privileged', 'redacted-key']})

    def test_ports_must_match_live_loopback_only(self):
        data = baseline(); data[1]['HostConfig']['PortBindings']['7860/tcp'][0]['HostIp'] = '0.0.0.0'
        self.reject(data, 'PORT_BINDINGS')

    def test_mount_source_or_permissions_drift(self):
        for field, value in [('Source', '/PRIVATE_DRIFT'), ('RW', False)]:
            data = baseline(); data[1]['Mounts'][0][field] = value
            self.reject(data, 'MOUNTS')

    def test_cpu_memory_and_security_constraints_are_not_lost(self):
        for field, value, code in [('NanoCpus', 1000000000, 'CPU_LIMIT'), ('Memory', 1024, 'RESOURCE_LIMITS'),
                                   ('Privileged', True, 'SECURITY_SETTINGS'), ('CapAdd', ['SYS_ADMIN'], 'SECURITY_SETTINGS')]:
            data = baseline(); data[1]['HostConfig'][field] = value
            self.reject(data, code)

    def test_working_user_restart_and_grace_are_preserved(self):
        for mutate, code in [(lambda x: x['Config'].update(User='1000'), 'USER'),
                             (lambda x: x['Config'].update(WorkingDir='/PRIVATE_OTHER'), 'WORKING_DIR'),
                             (lambda x: x['Config'].update(StopTimeout=10), 'STOP_GRACE'),
                             (lambda x: x['HostConfig']['RestartPolicy'].update(Name='always'), 'RESTART')]:
            data = baseline(); mutate(data[1]); self.reject(data, code)

    def test_existing_network_subnet_address_does_not_need_recreation(self):
        data = baseline(); data[0]['networks']['default']['external'] = True
        data[0]['networks']['default']['ipam'] = {}
        data[1]['NetworkSettings']['Networks']['queen_default']['IPAddress'] = '172.31.55.8'
        self.assertIsNone(guard_trial(*data))
        data[0]['networks']['default']['ipam'] = {'config': [{'subnet': '172.31.0.0/16'}]}
        self.reject(data, 'NETWORK_SETTINGS')
        data[0]['networks']['default']['ipam'] = None
        data[1]['NetworkSettings']['Networks']['other'] = {}
        self.reject(data, 'NETWORKS')

    def test_cache_cli_aliases_reject_but_private_flag_like_values_do_not(self):
        for flag in ('--cache-ram=0', '-cram', '--ctx-checkpoints', '--swa-checkpoints=0', '-ctxcp'):
            data = baseline(); data[3].append(flag); self.reject(data, 'CLI_CACHE_OVERRIDE')
        data = baseline(); data[3].extend(['--api-key', '--cache-ram=PRIVATE_KEY'])
        self.assertIsNone(guard_trial(*data))

    def test_image_identity_and_reference_drift(self):
        data = baseline(); data[1]['Image'] = 'sha256:' + 'b' * 64; self.reject(data, 'IMAGE_ID')
        data = baseline(); data[0]['services']['qwen']['image'] = 'different:tag'; self.reject(data, 'IMAGE_REFERENCE')

    def test_malformed_baseline_never_leaks_exception_values(self):
        self.reject(({'PRIVATE_SECRET': True}, {}, {}, []), 'MALFORMED_BASELINE')

    def test_normalized_healthcheck_matches_exec_command_and_nanosecond_fields(self):
        data = baseline()
        data[0]['services']['qwen']['healthcheck'] = {'test': ['CMD', 'curl', 'PRIVATE_URL'], 'interval': '30s', 'timeout': '2.5s', 'start_period': '1m30s', 'start_interval': '500ms', 'retries': 3}
        data[1]['Config']['Healthcheck'] = {'Test': ['CMD', 'curl', 'PRIVATE_URL'], 'Interval': 30000000000, 'Timeout': 2500000000, 'StartPeriod': 90000000000, 'StartInterval': 500000000, 'Retries': 3}
        self.assertIsNone(guard_trial(*data))
        data[1]['Config']['Healthcheck']['Timeout'] = 2000000000
        self.reject(data, 'HEALTHCHECK')

    def test_image_healthcheck_is_inherited_and_partial_compose_fields_override(self):
        data = baseline()
        inherited = {'Test': ['CMD-SHELL', 'PRIVATE_COMMAND'], 'Interval': 30000000000, 'Timeout': 1000000000, 'StartPeriod': 60000000000, 'StartInterval': 5000000000, 'Retries': 5}
        data[2]['Config']['Healthcheck'] = inherited
        data[1]['Config']['Healthcheck'] = copy.deepcopy(inherited)
        self.assertIsNone(guard_trial(*data))
        data[0]['services']['qwen']['healthcheck'] = {'test': [], 'interval': '0s', 'timeout': '2s', 'retries': 0}
        data[1]['Config']['Healthcheck']['Timeout'] = 2000000000
        self.assertIsNone(guard_trial(*data))

    def test_explicit_health_disable_and_none_preserve_inherited_numeric_settings(self):
        for definition in ({'disable': True}, {'test': ['NONE']}):
            data = baseline()
            data[2]['Config']['Healthcheck'] = {'Test': ['CMD', 'PRIVATE_COMMAND'], 'Interval': 30000000000}
            data[0]['services']['qwen']['healthcheck'] = definition
            data[1]['Config']['Healthcheck'] = {'Test': ['NONE'], 'Interval': 30000000000}
            self.assertIsNone(guard_trial(*data))

    def test_health_shell_form_and_strict_duration_units(self):
        data = baseline()
        data[0]['services']['qwen']['healthcheck'] = {'test': 'PRIVATE_COMMAND', 'interval': '1h2m3.004005006s', 'timeout': '500us', 'start_period': '1ns'}
        data[1]['Config']['Healthcheck'] = {'Test': ['CMD-SHELL', 'PRIVATE_COMMAND'], 'Interval': 3723004005006, 'Timeout': 500000, 'StartPeriod': 1}
        self.assertIsNone(guard_trial(*data))
        for value in ('30', 'nan', '-1s', '1s PRIVATE_SECRET', '0.5ns', '0.99999999999999999999999999999999999999ns', True):
            data[0]['services']['qwen']['healthcheck']['interval'] = value
            self.reject(data, 'HEALTHCHECK_FORMAT')

    def test_health_unsupported_fields_and_test_drift_fail_without_private_details(self):
        data = baseline()
        data[0]['services']['qwen']['healthcheck'] = {'test': ['CMD-SHELL', 'PRIVATE_COMMAND'], 'retries': 2}
        data[1]['Config']['Healthcheck'] = {'Test': ['CMD-SHELL', 'PRIVATE_OTHER_COMMAND'], 'Retries': 2}
        self.reject(data, 'HEALTHCHECK')
        data[0]['services']['qwen']['healthcheck']['unknown'] = 'PRIVATE_SECRET'
        self.reject(data, 'HEALTHCHECK_FORMAT')
        data = baseline(); data[1]['Config']['Healthcheck'] = False
        self.reject(data, 'HEALTHCHECK_FORMAT')

    def test_only_compose_health_tests_unescape_dollars_once_without_mutating_source(self):
        data = baseline()
        original = {'test': ['CMD-SHELL', 'curl -H "Authorization: Bearer $$LLAMA_API_KEY"; echo $$$$'], 'interval': '30s'}
        data[0]['services']['qwen']['healthcheck'] = copy.deepcopy(original)
        data[1]['Config']['Healthcheck'] = {'Test': ['CMD-SHELL', 'curl -H "Authorization: Bearer $LLAMA_API_KEY"; echo $$'], 'Interval': 30000000000}
        self.assertIsNone(guard_trial(*data))
        self.assertEqual(data[0]['services']['qwen']['healthcheck'], original)
        # Native image metadata has already passed Compose and stays literal.
        inherited = {'Test': ['CMD-SHELL', 'echo $$PRIVATE_LITERAL'], 'Interval': 30000000000}
        data[2]['Config']['Healthcheck'] = copy.deepcopy(inherited)
        data[1]['Config']['Healthcheck'] = copy.deepcopy(inherited)
        data[0]['services']['qwen']['healthcheck'] = {'timeout': '1s'}
        data[1]['Config']['Healthcheck']['Timeout'] = 1000000000
        self.assertIsNone(guard_trial(*data))

    def test_only_service_environment_unescapes_once_without_changing_frozen_or_image_values(self):
        data = baseline()
        data[2]['Config']['Env'].append('NATIVE=$$PRIVATE_IMAGE_LITERAL')
        data[0]['services']['qwen']['environment'] = {'LLAMA_API_KEY': 'PRIVATE$$KEY', 'OTHER': 'two$$$$DOLLARS'}
        original = copy.deepcopy(data[0]['services']['qwen']['environment'])
        data[1]['Config']['Env'] = ['BASE=private', 'NATIVE=$$PRIVATE_IMAGE_LITERAL', 'LLAMA_API_KEY=PRIVATE$KEY', 'OTHER=two$$DOLLARS']
        self.assertIsNone(guard_trial(*data))
        self.assertEqual(data[0]['services']['qwen']['environment'], original)
        self.assertEqual(data[2]['Config']['Env'][-1], 'NATIVE=$$PRIVATE_IMAGE_LITERAL')


if __name__ == '__main__':
    unittest.main()
