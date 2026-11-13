#!/usr/bin/env python3
"""Read-only VPS measurements; no environment variables, keys or prompts read."""
import argparse,datetime,json,pathlib,subprocess,time,os
p=argparse.ArgumentParser();p.add_argument('--container',default='prisma-neural-qwen');p.add_argument('--samples',type=int,default=60);p.add_argument('--interval',type=float,default=5);p.add_argument('--output',default='queen-vps-metrics.jsonl');args=p.parse_args()
if not 1<=args.samples<=360 or not 1<=args.interval<=60: p.error('samples: 1..360; interval: 1..60 seconds')
output=pathlib.Path(args.output)
if output.exists(): p.error('Output already exists; choose a new filename to preserve measurements')
with output.open('x') as log:
 for i in range(args.samples):
  mem={}
  for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
   name,_,value=line.partition(':')
   if name in ('MemTotal','MemAvailable','SwapTotal','SwapFree'): mem[name+'Bytes']=int(value.split()[0])*1024
  result=subprocess.run(['docker','stats','--no-stream','--format','{{json .}}',args.container],capture_output=True,text=True,timeout=15)
  row={'hostVcpus':os.cpu_count(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hostMemory':mem,'loadAverage':pathlib.Path('/proc/loadavg').read_text().split()[:3]}
  if result.returncode==0:
   data=json.loads(result.stdout);row['container']={k:data.get(k) for k in ('Name','CPUPerc','MemUsage','MemPerc','PIDs','BlockIO','NetIO')}
  else: row['containerError']='DOCKER_STATS_FAILED'
  status=subprocess.run(['docker','inspect','--format','{{json .State}}',args.container],capture_output=True,text=True,timeout=10)
  if status.returncode==0:
   state=json.loads(status.stdout);row['stability']={k:state.get(k) for k in ('Status','Running','OOMKilled','Restarting','StartedAt','FinishedAt','ExitCode')}
  log.write(json.dumps(row)+'\n');log.flush();print(json.dumps(row),flush=True)
  if i+1<args.samples: time.sleep(args.interval)
