-- Check Analytics Setup Status
-- Run this in Supabase SQL editor to verify your analytics setup

-- 1. Check if the main table exists and its structure
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'analytics_events' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Check if indexes exist
SELECT 
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename = 'analytics_events' 
  AND schemaname = 'public';

-- 3. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE tablename = 'analytics_events' 
  AND schemaname = 'public';

-- 4. Check RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'analytics_events' 
  AND schemaname = 'public';

-- 5. Check if views exist
SELECT 
  table_name,
  view_definition
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name IN ('analytics_summary', 'popular_pollutants', 'popular_groups', 'export_stats');

-- 6. Check if there's any sample data
SELECT 
  COUNT(*) as total_events,
  COUNT(DISTINCT event_type) as unique_event_types,
  MIN(timestamp) as earliest_event,
  MAX(timestamp) as latest_event
FROM analytics_events;

-- 7. Check event types if data exists
SELECT 
  event_type,
  COUNT(*) as count
FROM analytics_events 
GROUP BY event_type
ORDER BY count DESC;