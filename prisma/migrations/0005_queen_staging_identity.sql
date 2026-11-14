-- Staging identity guard; this migration is applied only to the isolated staging D1.
CREATE TABLE IF NOT EXISTS queen_staging_identity (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 database_id TEXT NOT NULL,
 environment TEXT NOT NULL CHECK (environment = 'staging')
);
INSERT OR REPLACE INTO queen_staging_identity (id,database_id,environment)
VALUES (1,'6a3256b2-c016-4650-9759-79aca3b4446f','staging');
