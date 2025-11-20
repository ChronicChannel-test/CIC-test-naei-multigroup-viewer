#!/usr/bin/env node
/*
 * Export the default "hero" dataset used for instant renders when no URL overrides are supplied.
 * The payload mirrors the Supabase tables but only includes:
 *  - Pollutants: PM2.5 + Activity Data
 *  - Groups: All, Ecodesign Stove - Ready To Burn, Gas Boilers
 *  - Timeseries rows for the pollutant/group combinations above
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NAEI_SUPABASE_URL
  || process.env.SUPABASE_URL
  || 'https://buqarqyqlugwaabuuyfy.supabase.co';
const SUPABASE_KEY = process.env.NAEI_SUPABASE_KEY
  || process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cWFycXlxbHVnd2FhYnV1eWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTczNDEsImV4cCI6MjA3Njg3MzM0MX0._zommN8QkzS0hY__N7KfuIaalKWG-PrSPq1BWg_BBjg';

const OUTPUT_PATH = path.join(__dirname, '..', 'SharedResources', 'default-chart-data.json');

const TARGET_POLLUTANTS = ['PM2.5', 'Activity Data'];
const TARGET_GROUPS = ['All', 'Ecodesign Stove - Ready To Burn', 'Gas Boilers'];
const DEFAULT_YEAR = 2023;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase credentials are missing. Set NAEI_SUPABASE_URL and NAEI_SUPABASE_KEY.');
  }

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  console.log('Fetching default pollutants:', TARGET_POLLUTANTS.join(', '));
  const { data: pollutantRows, error: pollutantError } = await client
    .from('NAEI_global_Pollutants')
    .select('*')
    .in('pollutant', TARGET_POLLUTANTS);
  if (pollutantError) throw pollutantError;

  if (!pollutantRows || pollutantRows.length < TARGET_POLLUTANTS.length) {
    throw new Error(`Expected ${TARGET_POLLUTANTS.length} pollutant rows, received ${pollutantRows?.length || 0}`);
  }

  const { data: groupRows, error: groupError } = await client
    .from('NAEI_global_t_Group')
    .select('*')
    .in('group_title', TARGET_GROUPS);
  if (groupError) throw groupError;

  if (!groupRows || groupRows.length < TARGET_GROUPS.length) {
    throw new Error(`Expected ${TARGET_GROUPS.length} group rows, received ${groupRows?.length || 0}`);
  }

  const pollutantIdMap = Object.fromEntries(pollutantRows.map(row => [row.pollutant, row.id]));
  const groupIdMap = Object.fromEntries(groupRows.map(row => [row.group_title, row.id]));

  const pollutantIds = Object.values(pollutantIdMap);
  const groupIds = Object.values(groupIdMap);

  console.log('Fetching timeseries rows for', pollutantIds.length, 'pollutants and', groupIds.length, 'groups');
  const { data: timeseriesRows, error: timeseriesError } = await client
    .from('NAEI_2023ds_t_Group_Data')
    .select('*')
    .in('pollutant_id', pollutantIds)
    .in('group_id', groupIds);
  if (timeseriesError) throw timeseriesError;

  if (!timeseriesRows || !timeseriesRows.length) {
    throw new Error('No timeseries data returned for default export.');
  }

  const sampleRow = timeseriesRows[0] || {};
  const yearKeys = Object.keys(sampleRow)
    .filter(key => /^f\d{4}$/.test(key))
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const years = yearKeys.map(key => key.slice(1));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'supabase',
    defaults: {
      lineChart: {
        pollutant: 'PM2.5',
        groups: ['All'],
        startYear: years[0] ? Number(years[0]) : null,
        endYear: years[years.length - 1] ? Number(years[years.length - 1]) : null
      },
      bubbleChart: {
        pollutant: 'PM2.5',
        activityPollutant: 'Activity Data',
        groups: TARGET_GROUPS.filter(name => name !== 'All'),
        year: DEFAULT_YEAR
      }
    },
    data: {
      pollutants: pollutantRows,
      groups: groupRows,
      timeseries: timeseriesRows,
      yearKeys,
      years
    }
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));

  console.log(`Default dataset written to ${OUTPUT_PATH}`);
  console.log(`Contains ${pollutantRows.length} pollutants, ${groupRows.length} groups, ${timeseriesRows.length} timeseries rows.`);
}

main().catch(error => {
  console.error('Failed to export default dataset:', error);
  process.exitCode = 1;
});
