/**
 * Supabase Data Module
 * Handles all Supabase database connections, data loading, and analytics tracking
 * Extracted from v2.2 index.html for modular architecture
 */

// Supabase project connection
const SUPABASE_URL = 'https://buqarqyqlugwaabuuyfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cWFycXlxbHVnd2FhYnV1eWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTczNDEsImV4cCI6MjA3Njg3MzM0MX0._zommN8QkzS0hY__N7KfuIaalKWG-PrSPq1BWg_BBjg';
const supabase = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
let supabaseUnavailableLogged = false;

// Analytics tracking variables
let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
let userFingerprint = null;
let userCountry = null;

// Global data storage
let globalRows = [];
let globalHeaders = [];
let pollutantUnits = {};
let groupedData = {};
let allGroupsList = [];
let allPollutants = [];
let allGroups = [];
let pollutantsData = []; // Store raw pollutant data for ID lookups
let groupsData = []; // Store raw group data for ID lookups

/**
 * Get user's country using privacy-friendly timezone method
 * @returns {string} Country code or 'Unknown'
 */
function getUserCountry() {
  if (userCountry) return userCountry;
  
  try {
    // Get timezone and map to likely country
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = navigator.language || 'en';
    
    // Simple mapping for common cases (privacy-friendly approach)
    const timezoneCountryMap = {
      'Europe/London': 'GB',
      'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
      'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/Madrid': 'ES',
      'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Kolkata': 'IN',
      'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU',
      'America/Toronto': 'CA', 'America/Vancouver': 'CA'
    };
    
    userCountry = timezoneCountryMap[timezone] || locale.split('-')[1] || 'Unknown';
    return userCountry;
  } catch (e) {
    return 'Unknown';
  }
}

/**
 * Generate a privacy-friendly user fingerprint for analytics
 * @returns {string} Base64 encoded fingerprint
 */
function generateUserFingerprint() {
  if (userFingerprint) return userFingerprint;

  // Get or create persistent UUID for this browser
  let uuid = localStorage.getItem('naei_analytics_uuid');
  if (!uuid) {
    uuid = ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
    localStorage.setItem('naei_analytics_uuid', uuid);
  }

  // Collect non-invasive browser info for analytics
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('Browser fingerprint', 2, 2);
  const canvasData = canvas.toDataURL();

  const fingerprint = [
    uuid,
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    canvasData.slice(-50)
  ].join('|');

  // Hash it for privacy
  userFingerprint = btoa(fingerprint).substr(0, 24);
  return userFingerprint;
}

/**
 * Track analytics events to Supabase
 * @param {string} eventType - Type of event to track
 * @param {Object} eventData - Additional event data
 */
async function trackAnalytics(eventName, details = {}) {
  // Check for analytics opt-out flag in URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('analytics') === 'off') {
    console.log('Analytics is turned off via URL parameter. Skipping event:', eventName);
    return; // Do not track if analytics=off is in the URL
  }

  if (!supabase) {
    if (!supabaseUnavailableLogged) {
      console.warn('Supabase client unavailable; analytics events will be skipped.');
      supabaseUnavailableLogged = true;
    }
    return;
  }

  const analyticsData = {
    session_id: sessionId,
    user_fingerprint: generateUserFingerprint(),
    event_type: eventName,
    event_data: {
      ...details,
      country: getUserCountry()
    },
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    page_url: window.location.href,
    referrer: document.referrer || null
  };

  console.log('📊 Analytics:', eventName, details);

  const { error } = await supabase
    .from('analytics_events')
    .insert([analyticsData]);

  if (error && !error.message?.includes('relation "analytics_events" does not exist')) {
    console.warn('Analytics tracking failed:', error);
  }
}

/**
 * Load pollutant units from Supabase
 */
async function loadUnits() {
  const { data, error } = await supabase.from('NAEI_global_Pollutants').select('*');
  if (error) throw error;
  pollutantUnits = {};
  data.forEach(r => {
    if (r.Pollutant && r["Emission Unit"]) {
      pollutantUnits[r.Pollutant] = r["Emission Unit"];
    } else if (r.pollutant) {
      pollutantUnits[r.pollutant] = r["emission unit"] || r['Emission Unit'] || '';
    }
  });
}

/**
 * Load all data from Supabase (pollutants, groups, timeseries)
 */
async function loadData() {
  console.log("Fetching data from Supabase (separate tables for robustness)...");

  // Fetch pollutants, groups, and the timeseries table separately
  const [pollutantsResp, groupsResp, dataResp] = await Promise.all([
    supabase.from('NAEI_global_Pollutants').select('*'),
    supabase.from('NAEI_global_t_Group').select('*'),
    supabase.from('NAEI_2023ds_t_Group_Data').select('*')
  ]);

  if (pollutantsResp.error) throw pollutantsResp.error;
  if (groupsResp.error) throw groupsResp.error;
  if (dataResp.error) throw dataResp.error;

  const pollutants = pollutantsResp.data || [];
  const groups = groupsResp.data || [];
  const rows = dataResp.data || [];
  
  // Store globally for URL parameter lookups
  pollutantsData = pollutants;
  groupsData = groups;

  // Build ID -> name maps for joins
  const pollutantIdToName = {};
  pollutants.forEach(p => {
    const id = p.id;
    const name = p.Pollutant || p.pollutant || p['Pollutant'] || p['pollutant'];
    if (name) {
      pollutantIdToName[id] = name;
      // capture unit if present
      const unit = p["Emission Unit"] || p["emission unit"] || p['Emission Unit'] || p.emission_unit || '';
      if (unit) pollutantUnits[name] = unit;
    }
  });

  const groupIdToTitle = {};
  groups.forEach(g => {
    const id = g.id;
    const title = g.Group_Title || g.group_title || g['Group_Title'] || g.group_title;
    if (title) groupIdToTitle[id] = title;
  });

  // Build lists used for dropdowns
  allPollutants = [...new Set(Object.values(pollutantIdToName).filter(Boolean))].sort();
  allGroups = [...new Set(Object.values(groupIdToTitle).filter(Boolean))].sort((a, b) => {
    if (a.toLowerCase() === "all") return -1;
    if (b.toLowerCase() === "all") return 1;
    return a.localeCompare(b);
  });

  window.allGroupsList = allGroups;
  window.allPollutants = allPollutants;

  // Determine year headers from data rows (look for fYYYY fields)
  if (!rows || rows.length === 0) {
    window.globalHeaders = [];
    window.globalYears = [];
    window.globalYearKeys = [];
    groupedData = {};
    console.log('No timeseries rows found in NAEI_2023ds_t_Group_Data');
    return;
  }

  // Ensure consistent header ordering (f1970 ... f2023)
  const sample = rows[0];
  const headers = Object.keys(sample).filter(k => /^f\d{4}$/.test(k)).sort((a,b)=> +a.slice(1) - +b.slice(1));
  window.globalHeaders = headers;
  window.globalYears = headers.map(h => h.slice(1));
  window.globalYearKeys = headers;

  // Build groupedData using FK ids and the lookup maps
  groupedData = {};
  rows.forEach(r => {
    const polId = r.Pollutant_id ?? r.pollutant_id ?? r.PollutantId ?? r.pollutantid;
    const grpId = r.Group_id ?? r.group_id ?? r.GroupId ?? r.groupid;
    const polName = pollutantIdToName[polId];
    const grpName = groupIdToTitle[grpId];
    if (!polName || !grpName) return;
    if (!groupedData[polName]) groupedData[polName] = {};
    groupedData[polName][grpName] = r;
  });

  // Fallback to groups discovered in timeseries if groups table is empty
  const groupsFromData = [...new Set(Object.values(groupedData).flatMap(pol => Object.keys(pol)))];
  if ((!allGroups || allGroups.length === 0) && groupsFromData.length) {
    allGroups = groupsFromData.sort((a, b) => {
      if (a.toLowerCase() === "all") return -1;
      if (b.toLowerCase() === "all") return 1;
      return a.localeCompare(b);
    });
    window.allGroupsList = allGroups;
    console.warn('Groups list was empty from NAEI_global_t_Group — falling back to groups found in timeseries rows.');
  }

  console.log(`Loaded ${rows.length} timeseries rows; ${allPollutants.length} pollutants; ${allGroups.length} groups`);
}

/**
 * Load group information from Supabase and render it as a table
 */
async function loadGroupInfo() {
  try {
    let groupRows = [];
    let nfrRows = [];

    if (supabase) {
      const { data: supabaseGroups, error: groupError } = await supabase
        .from('NAEI_global_t_Group')
        .select('id,Group_Title,SourceName,ActivityName,NFRCode');

      if (groupError) {
        console.warn('Failed to load group info from Supabase:', groupError);
      } else {
        groupRows = supabaseGroups || [];
      }

      try {
        const { data: supabaseNfr, error: nfrError } = await supabase
          .from('NAEI_global_t_NFRCode')
          .select('*');

        if (nfrError) {
          console.warn('Failed to load NFR code descriptions from Supabase:', nfrError);
        } else {
          nfrRows = supabaseNfr || [];
        }
      } catch (nfrErr) {
        console.warn('Failed to load NFR code descriptions from Supabase:', nfrErr);
      }
    } else {
      console.warn('Supabase client unavailable; falling back to cached group rows.');
    }

    if (!groupRows.length && groupsData && groupsData.length) {
      groupRows = groupsData;
    }

    if (!groupRows.length) {
      throw new Error('No group information available from Supabase or cached data.');
    }

    const nfrMap = {};
    nfrRows.forEach(nfr => {
      const code = nfr?.NFRCode || nfr?.nfrcode || nfr?.nfr_code;
      const description = nfr?.Description || nfr?.description;
      if (code && description) {
        nfrMap[code] = description;
      }
    });

    const groupMap = {};

    groupRows.forEach(row => {
      const groupTitle = row?.Group_Title || row?.group_title || row?.Group || row?.group;
      const sourceName = row?.SourceName || row?.source_name || row?.Source || row?.source;
      const activityName = row?.ActivityName || row?.activity_name || row?.Activity || row?.activity;
      const nfrCodeField = row?.NFRCode || row?.nfrcode || row?.nfr_code;

      if (!groupTitle) return;

      if (!groupMap[groupTitle]) {
        groupMap[groupTitle] = {
          name: groupTitle,
          sources: new Set(),
          activities: new Set(),
          nfrCodes: new Set()
        };
      }

      if (sourceName) {
        groupMap[groupTitle].sources.add(sourceName);
      }

      if (activityName) {
        groupMap[groupTitle].activities.add(activityName);
      }

      if (nfrCodeField) {
        nfrCodeField
          .split(/[;,]/)
          .map(code => code.trim())
          .filter(Boolean)
          .forEach(code => groupMap[groupTitle].nfrCodes.add(code));
      }
    });

    const groups = Object.values(groupMap)
      .map(g => ({
        name: g.name,
        sources: Array.from(g.sources).sort(),
        activities: Array.from(g.activities).sort(),
        nfrCodes: Array.from(g.nfrCodes).sort()
      }))
      .sort((a, b) => {
        if (a.name.toLowerCase() === 'all') return -1;
        if (b.name.toLowerCase() === 'all') return 1;
        return a.name.localeCompare(b.name);
      });

    if (!groups.length) {
      throw new Error('Group information could not be aggregated.');
    }

    let html = `
      <table id="groupTable" style="border-collapse:collapse;width:100%;font-family:inherit;font-size:14px;color:#000;">
        <thead>
          <tr style="background:#d0d0d0;">
            <th style="border:1px solid #444;padding:8px;text-align:left;vertical-align:top;width:25%;">Group Name</th>
            <th style="border:1px solid #444;padding:8px;text-align:left;vertical-align:top;width:40%;">Sources</th>
            <th style="border:1px solid #444;padding:8px;text-align:left;vertical-align:top;width:35%;">Fuel Types (Activity in NAEI data)</th>
          </tr>
        </thead>
        <tbody>
    `;

    groups.forEach(g => {
        let sourcesHTML = '';
        const validNfrCodes = g.nfrCodes.filter(code => code && code !== 'NULL' && code !== '' && code !== null);
        if (validNfrCodes.length) {
          sourcesHTML += `<span style="text-decoration:underline;font-weight:600;display:block;margin-bottom:4px;">All Sources from the following NFR Code categories:</span>`;
          sourcesHTML += `<div style="white-space:pre-line;">`;
          validNfrCodes.forEach(code => {
            const description = nfrMap[code];
            if (description && description !== 'NULL') {
              sourcesHTML += `${code}: ${description}\n`;
            } else {
              sourcesHTML += `${code}\n`;
            }
          });
          sourcesHTML += `</div>`;
        } else {
          const validSources = g.sources.filter(s => s != null && s !== '' && s !== 'NULL');
          sourcesHTML = validSources.length ? validSources.join('\n') : 'All Sources';
        }

      const validActivities = g.activities.filter(a => a != null && a !== '' && a !== 'NULL');
      const activitiesText = validActivities.length ? validActivities.join('\n') : 'All Fuel Types';

      html += `
        <tr style="border:1px solid #444;">
          <td style="border:1px solid #444;padding:8px;white-space:pre-line;font-family:inherit;">${g.name}</td>
          <td style="border:1px solid #444;padding:8px;white-space:pre-line;font-family:inherit;">${sourcesHTML}</td>
          <td style="border:1px solid #444;padding:8px;white-space:pre-line;font-family:inherit;">${activitiesText}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';

    const container = document.getElementById('group-info');
    container.style.fontFamily = 'system-ui, sans-serif';
    container.style.fontSize = '14px';
    container.style.color = '#000';
    container.innerHTML = html;

    console.log(`Rendered group info for ${groups.length} groups (Supabase rows: ${groupRows.length}).`);
  } catch (err) {
    console.error('Error loading group info:', err);
    document.getElementById('group-info').innerHTML =
      "<p class='text-red-600'>⚠️ Could not load group or NFRCodes information.</p>";
  }
}
