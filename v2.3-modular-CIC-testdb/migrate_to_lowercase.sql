-- Migration script to convert column names to PostgreSQL lowercase convention
-- Run these statements in your Supabase SQL Editor
-- IMPORTANT: Test on a backup first!

-- ============================================================================
-- Table: NAEI_global_Pollutants
-- ============================================================================
ALTER TABLE "NAEI_global_Pollutants" 
  RENAME COLUMN "Pollutant" TO "pollutant";

ALTER TABLE "NAEI_global_Pollutants" 
  RENAME COLUMN "Emission Unit" TO "emission_unit";

-- ============================================================================
-- Table: NAEI_global_t_Group
-- ============================================================================
ALTER TABLE "NAEI_global_t_Group" 
  RENAME COLUMN "Group_Title" TO "group_title";

ALTER TABLE "NAEI_global_t_Group" 
  RENAME COLUMN "SourceName" TO "source_name";

ALTER TABLE "NAEI_global_t_Group" 
  RENAME COLUMN "ActivityName" TO "activity_name";

ALTER TABLE "NAEI_global_t_Group" 
  RENAME COLUMN "NFRCode" TO "nfr_code";

-- ============================================================================
-- Table: NAEI_global_t_NFRCode
-- ============================================================================
-- Check if this table has any mixed-case columns that need renaming
-- Common ones might be:
ALTER TABLE "NAEI_global_t_NFRCode" 
  RENAME COLUMN "NFRCode" TO "nfr_code";

ALTER TABLE "NAEI_global_t_NFRCode" 
  RENAME COLUMN "Description" TO "description";

-- ============================================================================
-- Table: NAEI_2023ds_t_Group_Data
-- ============================================================================
-- This table has foreign key columns that should be lowercase
ALTER TABLE "NAEI_2023ds_t_Group_Data" 
  RENAME COLUMN "Pollutant_id" TO "pollutant_id";

ALTER TABLE "NAEI_2023ds_t_Group_Data" 
  RENAME COLUMN "Group_id" TO "group_id";

-- ============================================================================
-- Verification queries - Run these after migration to confirm changes
-- ============================================================================
-- Check NAEI_global_Pollutants columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'NAEI_global_Pollutants' 
ORDER BY ordinal_position;

-- Check NAEI_global_t_Group columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'NAEI_global_t_Group' 
ORDER BY ordinal_position;

-- Check NAEI_global_t_NFRCode columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'NAEI_global_t_NFRCode' 
ORDER BY ordinal_position;

-- Check NAEI_2023ds_t_Group_Data columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'NAEI_2023ds_t_Group_Data' 
ORDER BY ordinal_position;

-- ============================================================================
-- Rollback script (in case you need to revert)
-- ============================================================================
-- Uncomment and run these if you need to rollback:

/*
ALTER TABLE "NAEI_global_Pollutants" RENAME COLUMN "pollutant" TO "Pollutant";
ALTER TABLE "NAEI_global_Pollutants" RENAME COLUMN "emission_unit" TO "Emission Unit";

ALTER TABLE "NAEI_global_t_Group" RENAME COLUMN "group_title" TO "Group_Title";
ALTER TABLE "NAEI_global_t_Group" RENAME COLUMN "source_name" TO "SourceName";
ALTER TABLE "NAEI_global_t_Group" RENAME COLUMN "activity_name" TO "ActivityName";
ALTER TABLE "NAEI_global_t_Group" RENAME COLUMN "nfr_code" TO "NFRCode";

ALTER TABLE "NAEI_global_t_NFRCode" RENAME COLUMN "nfr_code" TO "NFRCode";
ALTER TABLE "NAEI_global_t_NFRCode" RENAME COLUMN "description" TO "Description";

ALTER TABLE "NAEI_2023ds_t_Group_Data" RENAME COLUMN "pollutant_id" TO "Pollutant_id";
ALTER TABLE "NAEI_2023ds_t_Group_Data" RENAME COLUMN "group_id" TO "Group_id";
*/
