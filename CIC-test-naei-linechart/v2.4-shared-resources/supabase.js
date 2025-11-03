/**
 * Supabase Data Module
 * Handles all Supabase database connections, data loading, and analytics tracking
 * v2.4 - Now uses shared resources
 */

// Initialize Supabase client using shared configuration
const supabase = window.SupabaseConfig.initSupabaseClient();
let supabaseUnavailableLogged = false;

// Analytics session tracking (uses shared Analytics module)
let sessionId = window.Analytics.getSessionId();

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

// Create the main export object for this module
window.supabase = {
  client: supabase,
  loadData,
  loadGroupInfo,
  trackAnalytics,
};

/**
 * Track analytics events to Supabase (wrapper for shared Analytics module)
 * @param {string} eventName - Type of event to track
 * @param {Object} details - Additional event data
 */
async function trackAnalytics(eventName, details = {}) {
  // Use shared Analytics module
  await window.Analytics.trackAnalytics(supabase, eventName, details);
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
  window.allPollutantsData = pollutants;
  window.allGroupsData = groups;

  // Build ID -> name maps for joins
  const pollutantIdToName = {};
  pollutants.forEach(p => {
    const id = p.id;
    const name = p.pollutant;
    if (name) {
      pollutantIdToName[id] = name;
      // Capture emission unit
      const unit = p.emission_unit || '';
      if (unit) pollutantUnits[name] = unit;
    }
  });

  const groupIdToTitle = {};
  groups.forEach(g => {
    const id = g.id;
    const title = g.group_title;
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
    return { pollutants, groups };
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
    const polId = r.pollutant_id;
    const grpId = r.group_id;
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
  
  // Return all the processed data for init() to use
  return { pollutants, groups, yearKeys: headers, pollutantUnits, groupedData };
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
        .select('id,group_title,source_name,activity_name,nfr_code');

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
      const code = nfr.nfr_code;
      const description = nfr.description;
      if (code && description) {
        nfrMap[code] = description;
      }
    });

    const groupMap = {};

    groupRows.forEach(row => {
      const groupTitle = row.group_title;
      const sourceName = row.source_name;
      const activityName = row.activity_name;
      const nfrCodeField = row.nfr_code;

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

