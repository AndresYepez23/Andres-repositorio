-- Schema only, observed read-only from prisma-ai-limits at commit 3d3da5e.
-- Apply ONLY through the staging guard; no production rows are copied.
CREATE TABLE IF NOT EXISTS ai_provider_health (
 provider TEXT PRIMARY KEY, state TEXT NOT NULL, valid_until INTEGER NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_rate_limits (
 scope TEXT NOT NULL, window_start INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(scope,window_start)
);
