-- Simple site-wide analytics for CIC UK Air Pollution/Emissions Data Explorer
-- Run this script inside the Supabase SQL editor.

DROP VIEW IF EXISTS site_event_country_summary;
DROP VIEW IF EXISTS site_event_daily_summary;

CREATE TABLE IF NOT EXISTS site_events (
  id            BIGSERIAL PRIMARY KEY,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id    TEXT        NOT NULL,
  page_slug     TEXT        NOT NULL,
  event_type    TEXT        NOT NULL CHECK (event_type IN ('page_view', 'interaction')),
  event_label   TEXT,
  country       TEXT        DEFAULT 'Unknown',
  page_url      TEXT,
  referrer      TEXT,
  user_agent    TEXT,
  event_data    JSONB
);

CREATE INDEX IF NOT EXISTS idx_site_events_recorded_at ON site_events(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_page_slug   ON site_events(page_slug);
CREATE INDEX IF NOT EXISTS idx_site_events_event_type  ON site_events(event_type);
CREATE INDEX IF NOT EXISTS idx_site_events_country     ON site_events(country) WHERE country IS NOT NULL;

ALTER TABLE site_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_events_insert ON site_events;
DROP POLICY IF EXISTS site_events_select ON site_events;

CREATE POLICY site_events_insert ON site_events
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY site_events_select ON site_events
  FOR SELECT
  USING (true);

CREATE VIEW site_event_daily_summary WITH (security_invoker = on) AS
SELECT
  DATE_TRUNC('day', recorded_at) AS event_date,
  page_slug,
  event_type,
  COUNT(*) AS total_events,
  COUNT(DISTINCT session_id) AS unique_sessions
FROM site_events
GROUP BY 1, 2, 3
ORDER BY event_date DESC, total_events DESC;

CREATE VIEW site_event_country_summary WITH (security_invoker = on) AS
SELECT
  page_slug,
  country,
  COUNT(DISTINCT session_id) AS sessions
FROM site_events
WHERE country IS NOT NULL AND country <> 'Unknown'
GROUP BY 1, 2
ORDER BY sessions DESC;

COMMENT ON TABLE site_events IS 'Lightweight site-wide analytics (page views + interactions)';
COMMENT ON VIEW site_event_daily_summary IS 'Daily counts per page and event type';
COMMENT ON VIEW site_event_country_summary IS 'Aggregated sessions per country';

-- Optional: prune analytics older than one year
-- DELETE FROM site_events WHERE recorded_at < NOW() - INTERVAL '12 months';
