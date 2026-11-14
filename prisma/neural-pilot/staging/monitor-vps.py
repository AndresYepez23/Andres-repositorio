#!/usr/bin/env python3
"""Read-only VPS measurements; no environment variables, keys or prompts read."""
import argparse,datetime,json,pathlib,subprocess,time,os
p=argparse.ArgumentParser();p.add_argument('--container',default='prisma-neural-qwen');p.add_argument('--samples',type=int,default=60);p.add_argument('--interval',type=float,default=5);p.add_argument('--output',default='queen-vps-metrics.jsonl');args=p.parse_args()
if not 1<=args.samples<=360 or not 1<=args.interval<=60: p.error('samples: 1..360; interval: 1..60 seconds')
output=pathlib.Path(args.output)
if output.exists(): p.error('Output already exists; choose a new filename to preserve measurements')
previous_cpu=None
def docker_read(arguments,timeout):
 try:
  result=subprocess.run(['docker']+arguments,capture_output=True,text=True,timeout=timeout)
  return json.loads(result.stdout) if result.returncode==0 else None
 except (OSError,subprocess.TimeoutExpired,json.JSONDecodeError):return None
with output.open('x') as log:
 for i in range(args.samples):
  mem={}
  for line in pathlib.Path('/proc/meminfo').read_text().splitlines():
   name,_,value=line.partition(':')
   if name in ('MemTotal','MemAvailable','SwapTotal','SwapFree'): mem[name+'Bytes']=int(value.split()[0])*1024
  data=docker_read(['stats','--no-stream','--format','{{json .}}',args.container],15)
  row={'hostVcpus':os.cpu_count(),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hostMemory':mem,'loadAverage':pathlib.Path('/proc/loadavg').read_text().split()[:3]}
  cpu=[int(v) for v in pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
  current_cpu=(sum(cpu),cpu[3]+cpu[4]);row['hostCpuPercent']=None
  if previous_cpu and current_cpu[0]>previous_cpu[0]:row['hostCpuPercent']=100*(1-(current_cpu[1]-previous_cpu[1])/(current_cpu[0]-previous_cpu[0]))
  previous_cpu=current_cpu
  if data is not None:
   row['container']={k:data.get(k) for k in ('Name','CPUPerc','MemUsage','MemPerc','PIDs','BlockIO','NetIO')}
  else: row['containerError']='DOCKER_STATS_FAILED'
  status=docker_read(['inspect','--format','{"state":{{json .State}},"restartCount":{{json .RestartCount}}}',args.container],10)
  if status is not None:
   state=status['state'];row['stability']={k:state.get(k) for k in ('Status','Running','OOMKilled','Restarting','StartedAt','FinishedAt','ExitCode')};row['stability']['restartCount']=status.get('restartCount')
  else:row['stabilityError']='DOCKER_INSPECT_FAILED'
  log.write(json.dumps(row)+'\n');log.flush();print(json.dumps(row),flush=True)
  if i+1<args.samples: time.sleep(args.interval)
