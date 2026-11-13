-- One server-side inference lease across Pages isolates; no prompts or secrets.
CREATE TABLE IF NOT EXISTS queen_leases (
 slot TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS queen_metrics (
 day TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
 duration_ms INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,event)
);

CREATE TABLE IF NOT EXISTS queen_request_limits (
 visitor TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(visitor,window_start)
);
CREATE TABLE IF NOT EXISTS queen_provider_observations (
 provider TEXT NOT NULL, model TEXT NOT NULL, capability TEXT NOT NULL,
 successes INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
 last_success_at INTEGER NOT NULL DEFAULT 0, last_failure_at INTEGER NOT NULL DEFAULT 0,
 last_status INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
 samples INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(provider,model,capability)
);
