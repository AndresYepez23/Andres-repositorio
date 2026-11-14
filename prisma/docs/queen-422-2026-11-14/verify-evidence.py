"""Read saved artifacts only; no inference, network, or tool execution."""
import hashlib
import json
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

root = Path(__file__).resolve().parent
report = json.loads((root / 'real-pdf-word/results.json').read_text())
for artifact in report['artifacts']:
    name = artifact['name']
    assert Path(name).name == name
    data = (root / 'real-pdf-word' / name).read_bytes()
    assert len(data) == artifact['bytes']
    assert hashlib.sha256(data).hexdigest() == artifact['sha256']

docx = next(a for a in report['artifacts'] if a['name'].endswith('.docx'))
with ZipFile(root / 'real-pdf-word' / docx['name']) as archive:
    assert sum(i.file_size for i in archive.infolist()) <= 50 * 1024 * 1024
    document = ElementTree.fromstring(archive.read('word/document.xml'))
    text = ' '.join(n.text or '' for n in document.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
assert 'QUEEN SECOND PAGE 2026' in text
assert 'FIRST PAGE' not in text and 'THIRD PAGE' not in text
print(json.dumps({'savedArtifactHashesValid': True, 'requestedPageContent': True,
                  'otherPageContentAbsent': True, 'newInferenceRequests': 0,
                  'genericExecutionVerifiedHistorically': report['genericExecutionVerified']}))
