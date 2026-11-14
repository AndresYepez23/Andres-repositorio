"""Execute the documented Bash bootstrap with local curl fixtures, never a VPS."""
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
BOOTSTRAP = (ROOT / 'VPS-MEASUREMENTS.md').read_text().split('```bash\n', 1)[1].split('```', 1)[0]


class DownloadTests(unittest.TestCase):
    def run_fixture(self, fail='', corrupt=''):
        with tempfile.TemporaryDirectory() as name:
            temp = pathlib.Path(name)
            bin_path = temp / 'bin'
            bin_path.mkdir()
            tools = {
                'mktemp': "import os,tempfile; print(tempfile.mkdtemp(dir=os.environ['CASE_DIR']))\n",
                'curl': '''import os,pathlib,sys
args=sys.argv[1:]
target=pathlib.Path(args[args.index('-o')+1])
source=target.name.removesuffix('.part')
with open(os.environ['CASE_DIR']+'/calls','a') as log:log.write(source+'\\n')
if source==os.environ.get('FAIL_SCRIPT'):target.write_text('partial');sys.exit(22)
data=(pathlib.Path(os.environ['SCRIPT_ROOT'])/source).read_bytes()
if source==os.environ.get('CORRUPT_SCRIPT'):data+=b'\\n# modified source\\n'
target.write_bytes(data)
'''}
            for tool, body in tools.items():
                path = bin_path / tool
                path.write_text('#!' + sys.executable + '\n' + body)
                path.chmod(0o700)
            env = {**os.environ, 'PATH': str(bin_path) + ':' + os.environ.get('PATH', ''),
                   'QUEEN_REF': '0' * 40, 'CASE_DIR': name, 'SCRIPT_ROOT': str(ROOT),
                   'FAIL_SCRIPT': fail, 'CORRUPT_SCRIPT': corrupt}
            # A ready variable is required before any subsequent SSH commands.
            result = subprocess.run(['bash', '-c', BOOTSTRAP + '\ntest -n "${QUEEN_RUN:-}"\n'],
                                    env=env, capture_output=True, text=True, timeout=10)
            calls = (temp / 'calls').read_text().splitlines()
            markers = list(temp.glob('*/scripts.verified'))
            return result.returncode, calls, len(markers)

    def test_failed_first_download_stops_before_other_scripts(self):
        code, calls, markers = self.run_fixture(fail='monitor-vps.py')
        self.assertNotEqual(code, 0)
        self.assertEqual(calls, ['monitor-vps.py'])
        self.assertEqual(markers, 0)

    def test_bad_checksum_never_marks_sources_verified(self):
        code, calls, markers = self.run_fixture(corrupt='probe-qwen.py')
        self.assertNotEqual(code, 0)
        self.assertEqual(len(calls), 4)
        self.assertEqual(markers, 0)

    def test_verified_sources_compile_without_running_the_probe(self):
        code, calls, markers = self.run_fixture()
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 4)
        self.assertEqual(markers, 1)


if __name__ == '__main__':
    unittest.main()
