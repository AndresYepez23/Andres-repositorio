#!/usr/bin/env python3
"""Manual local VPS probe: one tiny completion, no tuning or secret output."""
import argparse, datetime, json, subprocess, time, signal, urllib.request, urllib.error

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--container', default='prisma-neural-qwen')
container = parser.parse_args().container
report = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'completionAttempted': False, 'usage': None, 'timings': None}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('LOCAL_REDIRECT_BLOCKED')

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

def request(path, body=None, timeout=5):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request('http://127.0.0.1:7860' + path, data=data,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    with opener.open(req, timeout=timeout) as response:
        data = response.read(65537)
    if len(data) > 65536:
        raise ValueError('RESPONSE_LIMIT')
    return data.decode()

def queue_snapshot():
    try:
        metrics = request('/metrics')
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
        return {'metricsAvailable': False, 'errorType': type(exc).__name__,
                'httpStatus': getattr(exc, 'code', None), 'counters': None}

def deadline(*_):
    raise TimeoutError('GENERATION_DEADLINE')

try:
    # Existing local credential stays in memory; no environment values are printed.
    env = json.loads(subprocess.check_output(['docker', 'inspect', '--format',
        '{{json .Config.Env}}', container], stderr=subprocess.DEVNULL, timeout=10))
    key = next((item.split('=', 1)[1] for item in env if item.startswith('LLAMA_API_KEY=')), '')
    if not key:
        raise ValueError('LOCAL_API_KEY_UNAVAILABLE')
    slots = json.loads(request('/slots'))
    if not isinstance(slots, list) or len(slots) != 1 or slots[0].get('is_processing') is not False:
        raise ValueError('SLOT_BUSY_OR_STATE_UNKNOWN')
    models = json.loads(request('/v1/models')).get('data', [])
    if len(models) != 1 or not models[0].get('id'):
        raise ValueError('MODEL_ID_UNAVAILABLE_OR_AMBIGUOUS')
    report['queueBefore'] = queue_snapshot()
    report['model'] = models[0]['id']
    signal.signal(signal.SIGALRM, deadline)
    started = time.monotonic()
    signal.alarm(55)
    report['completionAttempted'] = True
    try:
        result = json.loads(request('/v1/chat/completions', {
            'model': models[0]['id'], 'messages': [{'role': 'user', 'content': 'Responde: OK'}],
            'temperature': 0, 'max_tokens': 8, 'stream': False,
            'chat_template_kwargs': {'enable_thinking': False}}, timeout=55))
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
        signal.alarm(0)
        report['elapsedMs'] = round((time.monotonic() - started) * 1000)
    report['queueAfter'] = queue_snapshot()
except Exception as exc:
    signal.alarm(0)
    report['outcome'] = 'unknown' if report['completionAttempted'] else 'not-attempted'
    report['errorType'] = type(exc).__name__
    report['httpStatus'] = getattr(exc, 'code', None)
    known = {'RESPONSE_LIMIT', 'LOCAL_API_KEY_UNAVAILABLE', 'SLOT_BUSY_OR_STATE_UNKNOWN',
             'MODEL_ID_UNAVAILABLE_OR_AMBIGUOUS', 'COMPLETION_RESPONSE_MISSING',
             'GENERATION_DEADLINE', 'LOCAL_REDIRECT_BLOCKED'}
    report['code'] = str(exc) if str(exc) in known else None
report['ttftMs'] = None  # Non-streaming probe: do not invent a TTFT.
print(json.dumps(report, indent=2))
