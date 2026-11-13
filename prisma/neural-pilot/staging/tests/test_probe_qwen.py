"""Local-only probe deadline and single-inference regressions."""
import importlib.util
import json
import pathlib
import signal
import time
import unittest
import urllib.error
from unittest import mock

SPEC = importlib.util.spec_from_file_location(
    'probe_qwen', pathlib.Path(__file__).resolve().parents[1] / 'probe-qwen.py')
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class FakeResponse:
    def __init__(self, body, dribble=False):
        self.body = body.encode() if isinstance(body, str) else body
        self.dribble = dribble

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, limit):
        if self.dribble:
            # Each byte arrives before the socket timeout, but the full body does not.
            for _ in range(100):
                time.sleep(0.005)
        return self.body[:limit]


class FakeOpener:
    def __init__(self, *, busy=False, slow_path=None, slow_headers=False):
        self.calls = []
        self.busy = busy
        self.slow_path = slow_path
        self.slow_headers = slow_headers

    def open(self, req, timeout):
        self.calls.append((req, timeout))
        path = req.full_url.removeprefix('http://127.0.0.1:7860')
        if path == self.slow_path and self.slow_headers:
            try:
                for _ in range(100):
                    time.sleep(0.005)
            except OSError as exc:
                # urllib wraps OSError while opening a request/reading its headers.
                raise urllib.error.URLError(exc) from exc
        bodies = {
            '/slots': json.dumps([{'is_processing': self.busy}]),
            '/v1/models': json.dumps({'data': [{'id': 'local-model'}]}),
            '/metrics': 'llamacpp:requests_processing 0\n',
            '/v1/chat/completions': json.dumps({
                'choices': [{'message': {'content': 'private-output'}, 'finish_reason': 'stop'}],
                'usage': {'prompt_tokens': 2, 'completion_tokens': 1, 'total_tokens': 3}}),
        }
        return FakeResponse(bodies[path], dribble=path == self.slow_path and not self.slow_headers)

    @property
    def posts(self):
        return [(req, timeout) for req, timeout in self.calls if req.get_method() == 'POST']


@unittest.skipUnless(hasattr(signal, 'setitimer'), 'VPS probe uses POSIX wall timers')
class ProbeTests(unittest.TestCase):
    def tearDown(self):
        self.assertEqual(signal.getitimer(signal.ITIMER_REAL), (0.0, 0.0))

    def run_fake(self, opener, env=None, **timeouts):
        env = ['LLAMA_API_KEY=local-test-key'] if env is None else env
        timeouts = {'PROBE_TIMEOUT': 100, 'REQUEST_TIMEOUT': 5, 'GENERATION_TIMEOUT': 55, **timeouts}
        with mock.patch.object(probe.subprocess, 'check_output', return_value=json.dumps(env).encode()), \
             mock.patch.object(probe.urllib.request, 'build_opener', return_value=opener), \
             mock.patch.multiple(probe, **timeouts):
            return probe.run_probe('test-container')

    def test_dribbling_metadata_has_wall_deadline_and_never_posts(self):
        opener = FakeOpener(slow_path='/slots')
        started = time.monotonic()
        report = self.run_fake(opener, REQUEST_TIMEOUT=0.03)
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(report['code'], 'REQUEST_DEADLINE')
        self.assertFalse(report['completionAttempted'])
        self.assertEqual(opener.posts, [])

    def test_metrics_read_is_bounded_and_probe_still_posts_once(self):
        opener = FakeOpener(slow_path='/metrics')
        started = time.monotonic()
        report = self.run_fake(opener, REQUEST_TIMEOUT=0.03)
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(report['outcome'], 'response-received')
        self.assertFalse(report['queueBefore']['metricsAvailable'])
        self.assertFalse(report['queueAfter']['metricsAvailable'])
        self.assertEqual(len(opener.posts), 1)

    def test_outer_probe_deadline_is_not_swallowed_by_metrics(self):
        for slow_headers in (False, True):
            with self.subTest(slow_headers=slow_headers):
                opener = FakeOpener(slow_path='/metrics', slow_headers=slow_headers)
                started = time.monotonic()
                report = self.run_fake(opener, PROBE_TIMEOUT=0.03, REQUEST_TIMEOUT=0.2)
                self.assertLess(time.monotonic() - started, 1.0)
                self.assertEqual(report['code'], 'PROBE_DEADLINE')
                self.assertEqual(report['errorType'], 'TimeoutError')
                self.assertFalse(report['completionAttempted'])
                self.assertEqual(opener.posts, [])

    def test_generation_has_its_own_shorter_deadline_and_no_retry(self):
        opener = FakeOpener(slow_path='/v1/chat/completions')
        started = time.monotonic()
        report = self.run_fake(opener, PROBE_TIMEOUT=0.3, GENERATION_TIMEOUT=0.03)
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(report['code'], 'GENERATION_DEADLINE')
        self.assertEqual(report['outcome'], 'unknown')
        self.assertEqual(len(opener.posts), 1)

    def test_nested_deadline_restores_remaining_outer_time_and_handler(self):
        previous_handler = signal.getsignal(signal.SIGALRM)
        started = time.monotonic()
        with self.assertRaisesRegex(probe.WallDeadlineExceeded, '^OUTER$'):
            with probe.wall_deadline(0.08, 'OUTER'):
                outer_handler = signal.getsignal(signal.SIGALRM)
                with probe.wall_deadline(0.02, 'INNER'):
                    time.sleep(0.01)
                self.assertIs(signal.getsignal(signal.SIGALRM), outer_handler)
                remaining, _ = signal.getitimer(signal.ITIMER_REAL)
                self.assertLess(remaining, 0.075)
                time.sleep(0.1)
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertIs(signal.getsignal(signal.SIGALRM), previous_handler)

    def test_longer_nested_deadline_does_not_renew_generation_limit(self):
        started = time.monotonic()
        with self.assertRaisesRegex(probe.WallDeadlineExceeded, '^GENERATION_DEADLINE$'):
            with probe.wall_deadline(0.05, 'GENERATION_DEADLINE'):
                time.sleep(0.02)
                with probe.wall_deadline(0.2, 'REQUEST_DEADLINE'):
                    time.sleep(0.1)
        self.assertLess(time.monotonic() - started, 1.0)

    def test_busy_slot_and_missing_key_never_post(self):
        for busy, env, code in (
            (True, ['LLAMA_API_KEY=local-test-key'], 'SLOT_BUSY_OR_STATE_UNKNOWN'),
            (False, [], 'LOCAL_API_KEY_UNAVAILABLE'),
        ):
            with self.subTest(code=code):
                opener = FakeOpener(busy=busy)
                report = self.run_fake(opener, env)
                self.assertEqual(report['code'], code)
                self.assertFalse(report['completionAttempted'])
                self.assertEqual(opener.posts, [])

    def test_success_posts_once_with_existing_generation_limits(self):
        opener = FakeOpener()
        report = self.run_fake(opener)
        self.assertEqual(report['outcome'], 'response-received')
        self.assertEqual(len(opener.posts), 1)
        req, timeout = opener.posts[0]
        body = json.loads(req.data)
        self.assertEqual(timeout, 55)
        self.assertEqual(body['max_tokens'], 8)
        self.assertFalse(body['stream'])
        self.assertFalse(body['chat_template_kwargs']['enable_thinking'])
        self.assertIsNone(report['ttftMs'])
        self.assertNotIn('local-test-key', json.dumps(report))
        self.assertNotIn('private-output', json.dumps(report))
        self.assertTrue(all(req.full_url.startswith('http://127.0.0.1:7860/')
                            for req, _ in opener.calls))


if __name__ == '__main__':
    unittest.main()
