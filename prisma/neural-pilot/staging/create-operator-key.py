#!/usr/bin/env python3
"""Create a private operator key and its digest. Never print either value."""
import argparse,hashlib,os,pathlib,secrets
p=argparse.ArgumentParser();p.add_argument('--directory',required=True);args=p.parse_args()
directory=pathlib.Path(args.directory);directory.mkdir(parents=True,exist_ok=True,mode=0o700)
paths=[directory/'operator-key',directory/'operator-key.sha256']
if any(path.exists() for path in paths):p.error('Refusing to overwrite an existing key or digest')
key=secrets.token_hex(32)
for path,value in zip(paths,[key,hashlib.sha256(key.encode()).hexdigest()]):
 with os.fdopen(os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:f.write(value+'\n')
print('Created private operator-key and operator-key.sha256 in '+str(directory))
print('Configure only the digest as QUEEN_STAGING_KEY_SHA256 in isolated Production; redeploy to activate it.')
