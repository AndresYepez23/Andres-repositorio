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
            env = json.loads(subprocess.check_output(['docker', 'inspect', '--format',
                '{{json .Config.Env}}', container], stderr=subprocess.DEVNULL, timeout=10))
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


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--container', default='prisma-neural-qwen')
    args = parser.parse_args(argv)
    print(json.dumps(run_probe(args.container), indent=2))


if __name__ == '__main__':
    main()
