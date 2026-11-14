#!/usr/bin/env python3
"""Read the preserved evidence only: no network, Docker, SSH, or generation."""
import datetime as dt
import json
from pathlib import Path
import statistics


ROOT = Path(__file__).resolve().parent


def bounds(values):
    return {"min": min(values), "max": max(values), "mean": statistics.mean(values)}


def main():
    rows = [json.loads(line) for line in (ROOT / "host.jsonl").read_text().splitlines() if line.strip()]
    probe = json.loads((ROOT / "qwen-probe.json").read_text())
    provenance = json.loads((ROOT / "provenance.json").read_text())
    host_times = [dt.datetime.fromisoformat(row["at"]) for row in rows]
    probe_at = dt.datetime.fromisoformat(probe["at"])
    # 'at' precedes preflight, so this is a record-relative interval, not POST timing.
    active = [row for row, at in zip(rows, host_times)
              if 0 <= (at - probe_at).total_seconds() <= probe["elapsedMs"] / 1000]
    header, vm = None, []
    for line in (ROOT / "vmstat.txt").read_text().splitlines():
        parts = line.split()
        if parts[:2] == ["r", "b"]:
            header = parts
        elif parts and parts[0].isdigit():
            if header is None or len(parts) != len(header):
                raise ValueError("Unexpected vmstat row")
            vm.append(dict(zip(header, map(int, parts))))
    # vmstat's first numeric row is since boot, not a five-second interval.
    intervals = vm[1:]
    burst_indices = [i for i, row in enumerate(vm) if i > 0 and row["wa"] >= 50]
    burst = [vm[i] for i in burst_indices]
    pressure_lines = (ROOT / "pressure.txt").read_text().splitlines()
    if len(pressure_lines) != 6:
        raise ValueError("Expected documented cpu/memory/io PSI snapshot")
    pressure = {}
    for i, resource in enumerate(("cpu", "memory", "io")):
        pressure[resource] = {}
        for line in pressure_lines[i * 2:i * 2 + 2]:
            parts = line.split()
            pressure[resource][parts[0]] = {
                k: int(v) if k == "total" else float(v)
                for k, v in (part.split("=", 1) for part in parts[1:])}
    report = {
        "source": "Real user-supplied VPS records; no new requests",
        "host": {
            "samples": len(rows), "firstUtc": rows[0]["at"], "lastUtc": rows[-1]["at"],
            "durationSeconds": (host_times[-1] - host_times[0]).total_seconds(),
            "vcpus": sorted({row["hostVcpus"] for row in rows}),
            "totalRamBytes": rows[0]["hostMemory"]["MemTotalBytes"],
            "minimumAvailableRamBytes": min(row["hostMemory"]["MemAvailableBytes"] for row in rows),
            "swapTotalBytesObserved": sorted({row["hostMemory"]["SwapTotalBytes"] for row in rows}),
            "monitorErrorSamples": sum("containerError" in row or "stabilityError" in row for row in rows),
            "oomKilledSamples": sum(row["stability"]["OOMKilled"] is True for row in rows),
            "restartCounts": sorted({row["stability"]["restartCount"] for row in rows}),
            "containerStartedAt": sorted({row["stability"]["StartedAt"] for row in rows}),
            "firstBlockIO": rows[0]["container"]["BlockIO"],
            "lastBlockIO": rows[-1]["container"]["BlockIO"],
        },
        "vmstat": {
            "numericRows": len(vm), "intervalRows": len(intervals),
            "documentedIntervalSeconds": 5,
            "firstRowExcludedBecauseSinceBoot": True,
            "highIoWaitThresholdPercent": 50,
            "highIoWaitRowIndicesZeroBasedIncludingBootRow": burst_indices,
            "highIoWaitIntervals": len(burst),
            "highIoWaitDurationSeconds": len(burst) * 5,
            "highIoWaitStats": {key: bounds([row[key] for row in burst])
                                for key in ("wa", "bi", "b", "id", "us", "sy", "st")},
            "highIoWaitReadGiB": sum(row["bi"] * 5 * 1024 for row in burst) / 1024**3,
            "allIntervalsReadGiB": sum(row["bi"] * 5 * 1024 for row in intervals) / 1024**3,
            "allIntervalsStats": {key: bounds([row[key] for row in intervals])
                                  for key in ("wa", "bi", "st", "si", "so")},
            "timeAlignment": "No timestamps in vmstat. Relative interval indices only; do not invent exact UTC alignment.",
            "units": "bi in KiB/s for the documented Linux vmstat 5 120 command; volumes integrate rounded five-second reports.",
        },
        "probe": {"atUtc": probe["at"], "elapsedMs": probe["elapsedMs"],
                  "completionAttempted": probe["completionAttempted"], "outcome": probe["outcome"],
                  "code": probe["code"], "queueBefore": probe["queueBefore"],
                  "usage": probe["usage"], "timings": probe["timings"], "ttftMs": probe["ttftMs"]},
        "hostSamplesWithinProbeRecordRelative55s": [
            {"atUtc": row["at"], "containerCpu": row["container"]["CPUPerc"],
             "blockIO": row["container"]["BlockIO"], "availableRamBytes": row["hostMemory"]["MemAvailableBytes"]}
            for row in active],
        "psi": {"orderAssumedFromDocumentedCatCommand": ["cpu", "memory", "io"],
                "snapshot": pressure,
                "archiveMtimeUtc": provenance["files"]["pressure.txt"]["archiveMtimeUtc"],
                "limitation": "One untimestamped content snapshot; archive mtime is after the probe. Totals are since boot, not probe deltas."},
        "journal": {"content": (ROOT / "kernel-oom.txt").read_text().strip(),
                    "stderrBytes": (ROOT / "kernel-oom-errors.txt").stat().st_size,
                    "limitation": "No matching retained kernel entries; not proof of absence outside query/retention."},
        "missing": ["monitor exit status", "timed process/cgroup pgmajfault and workingset_refault_file deltas",
                    "GGUF mapped size versus resident pages", "actual anonymous/file/KV/compute/cache breakdown",
                    "per-device await/queue/utilization", "POST server admission/completion log", "generation tokens and TTFT"],
        "inferencesRunByAnalysis": 0,
    }
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
