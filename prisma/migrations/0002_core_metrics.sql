-- Aggregate first-party counters; no visitor IDs, prompts or file data.
CREATE TABLE IF NOT EXISTS core_metrics (
 day TEXT NOT NULL, tool_id TEXT NOT NULL, event TEXT NOT NULL,
 count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
 files INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day, tool_id, event)
);
