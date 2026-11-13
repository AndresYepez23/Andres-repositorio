#!/usr/bin/env python3
"""Summarize the read-only monitor's real measurements; no tuning performed."""
import argparse,json,pathlib,re,statistics
p=argparse.ArgumentParser();p.add_argument('input');args=p.parse_args()
rows=[json.loads(line) for line in pathlib.Path(args.input).read_text().splitlines() if line.strip()]
def number(value):
 try:return float(str(value).removesuffix('%'))
 except ValueError:return None
def memory(value):
 match=re.fullmatch(r'([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)',value.strip())
 if not match:return None
 scale={'B':1,'KiB':1024,'MiB':1024**2,'GiB':1024**3,'KB':1000,'MB':1000**2,'GB':1000**3}
 return round(float(match[1])*scale[match[2]])
cpu=[number(r.get('container',{}).get('CPUPerc')) for r in rows];cpu=[x for x in cpu if x is not None]
ram=[memory(r.get('container',{}).get('MemUsage','').split('/')[0]) for r in rows];ram=[x for x in ram if x is not None]
available=[r['hostMemory']['MemAvailableBytes'] for r in rows if 'MemAvailableBytes' in r.get('hostMemory',{})]
print(json.dumps({'samples':len(rows),'first':rows[0]['at'] if rows else None,'last':rows[-1]['at'] if rows else None,
 'hostVcpus':rows[0].get('hostVcpus') if rows else None,'dockerCpuPercentOfOneCore':{'mean':statistics.mean(cpu) if cpu else None,'max':max(cpu) if cpu else None},
 'containerRamBytes':{'mean':round(statistics.mean(ram)) if ram else None,'max':max(ram) if ram else None},'minimumHostAvailableRamBytes':min(available) if available else None,
 'oomKilledObserved':any(r.get('stability',{}).get('OOMKilled') is True for r in rows),'containerRestartsObserved':any(r.get('stability',{}).get('Restarting') is True for r in rows),
 'monitorErrors':sum('containerError' in r for r in rows),'hardwareOrModelChanged':False},indent=2))
