/**
 * Supabase Data Module for Scatter Chart
 * Handles all Supabase database connections, data loading, and analytics tracking
 * v1.0 - Uses shared resources
 */

// Initialize Supabase client and analytics lazily to avoid dependency issues
let supabase = null;
let supabaseUnavailableLogged = false;
let localSessionId = null;

// Initialize client and session ID when first needed
function ensureInitialized() {
  if (!supabase && window.SupabaseConfig) {
    supabase = window.SupabaseConfig.initSupabaseClient();
  }
  if (!localSessionId && window.Analytics) {
    localSessionId = window.Analytics.getSessionId();
  }
  return supabase;
}

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
let activityDataId = null;

/**
 * Track analytics events to Supabase (wrapper for shared Analytics module)
 * @param {string} eventName - Type of event to track
 * @param {Object} details - Additional event data
 */
async function trackAnalytics(eventName, details = {}) {
  // Use shared Analytics module
  const client = ensureInitialized();
  if (client && window.Analytics) {
    await window.Analytics.trackAnalytics(client, eventName, details);
  }
}

/**
 * Load all data from Supabase for scatter chart (using shared data loader)
 */
async function loadData() {
  console.log("Loading scatter chart data using shared data loader...");

  try {
    // Track page load
    await trackAnalytics('page_load', { 
      page: 'scatter_chart',
      timestamp: new Date().toISOString()
    });

    // Check if parent window has shared data loader
    let sharedLoader = null;
    try {
      if (window.parent && window.parent.SharedDataLoader) {
        sharedLoader = window.parent.SharedDataLoader;
        console.log("Using parent window's shared data loader");
      } else if (window.SharedDataLoader) {
        sharedLoader = window.SharedDataLoader;
        console.log("Using local shared data loader");
      }
    } catch (e) {
      console.log("Cannot access parent window, using fallback data loading");
    }

    let pollutants, groups, rows;

    if (sharedLoader && sharedLoader.isDataLoaded()) {
      // Use cached data from shared loader
      console.log("Using cached data from shared loader");
      const cachedData = sharedLoader.getCachedData();
      pollutants = cachedData.pollutants;
      groups = cachedData.groups;
      rows = cachedData.timeseries;
    } else if (sharedLoader) {
      // Load data through shared loader
      console.log("Loading data through shared loader");
      try {
        const sharedData = await sharedLoader.loadSharedData();
        pollutants = sharedData.pollutants;
        groups = sharedData.groups;
        rows = sharedData.timeseries;
      } catch (error) {
        console.error("Failed to load through shared loader, falling back to direct loading:", error);
        // Fallback to direct loading
        const result = await loadDataDirectly();
        pollutants = result.pollutants;
        groups = result.groups;
        rows = result.rows;
      }
    } else {
      // Fallback to direct loading
      console.log("No shared loader available, loading data directly");
      const result = await loadDataDirectly();
      pollutants = result.pollutants;
      groups = result.groups;
      rows = result.rows;
    }
    
    // Store globally for URL parameter lookups
    window.allPollutantsData = pollutants;
    window.allGroupsData = groups;

    // Build pollutant units map
    pollutants.forEach(p => {
      if (p.pollutant && p["emission unit"]) {
        pollutantUnits[p.pollutant] = p["emission unit"];
      }
    });

    // Find Activity Data pollutant ID
    const activityDataPollutant = pollutants.find(p => 
      p.pollutant && p.pollutant.toLowerCase() === 'activity data'
    );
    
    if (activityDataPollutant) {
      activityDataId = activityDataPollutant.id;
      console.log("Activity Data pollutant ID:", activityDataId);
    } else {
      console.warn("Activity Data not found in pollutants list");
    }

    // Store data globally for access by other modules
    allPollutants = pollutants;
    allGroups = groups;
    globalRows = rows;
    pollutantsData = pollutants;
    groupsData = groups;

    // Get available years from data columns
    if (rows.length > 0) {
      const sample = rows[0];
      const headers = Object.keys(sample).filter(k => /^f\d{4}$/.test(k)).sort((a,b)=> +a.slice(1) - +b.slice(1));
      globalHeaders = headers;
      window.globalHeaders = headers;
      window.globalYears = headers.map(h => h.slice(1));
      window.globalYearKeys = headers;
    }

    // Build groups list for dropdowns
    allGroupsList = groups.map(g => ({
      id: g.id,
      name: g.group_title || `Group ${g.id}`
    })).sort((a, b) => a.name.localeCompare(b.name));

    console.log(`Loaded ${pollutants.length} pollutants, ${groups.length} groups, ${rows.length} data rows`);
    
    return {
      pollutants: allPollutants,
      groups: allGroups,
      data: globalRows
    };

  } catch (error) {
    console.error('Error loading scatter chart data:', error);
    
    // Track error
    await trackAnalytics('error', {
      error_type: 'data_load_error',
      error_message: error.message,
      page: 'scatter_chart'
    });
    
    throw error;
  }
}

/**
 * Get available years from the data
 * @returns {Array} Array of year numbers
 */
function getAvailableYears() {
  if (globalRows.length === 0) return [];
  
  // Get year columns from the data (f1970, f1971, etc.)
  const sampleRow = globalRows[0];
  const yearColumns = Object.keys(sampleRow)
    .filter(key => key.startsWith('f') && !isNaN(parseInt(key.substring(1))))
    .map(key => parseInt(key.substring(1)))
    .sort((a, b) => b - a); // Sort descending (newest first)
  
  return yearColumns;
}

/**
 * Get data for a specific year, pollutant, and groups
 * @param {number} year - Year to get data for
 * @param {number} pollutantId - Pollutant ID
 * @param {Array} groupIds - Array of group IDs
 * @returns {Array} Array of data points {group, activityData, pollutantValue}
 */
function getScatterData(year, pollutantId, groupIds) {
  const yearColumn = `f${year}`;
  const dataPoints = [];

  groupIds.forEach(groupId => {
    // Get activity data for this group
    const activityRow = globalRows.find(row => 
      row.pollutant_id === activityDataId && row.group_id === groupId
    );
    
    // Get pollutant data for this group
    const pollutantRow = globalRows.find(row => 
      row.pollutant_id === pollutantId && row.group_id === groupId
    );

    if (activityRow && pollutantRow) {
      const activityValue = activityRow[yearColumn];
      const pollutantValue = pollutantRow[yearColumn];
      
      // Only include if both values are valid numbers
      if (activityValue != null && pollutantValue != null && 
          !isNaN(activityValue) && !isNaN(pollutantValue)) {
        
        const group = allGroups.find(g => g.id === groupId);
        dataPoints.push({
          groupId: groupId,
          groupName: group ? group.group_title : `Group ${groupId}`,
          activityData: parseFloat(activityValue),
          pollutantValue: parseFloat(pollutantValue)
        });
      }
    }
  });

  return dataPoints;
}

/**
 * Get pollutant name by ID
 * @param {number} pollutantId - Pollutant ID
 * @returns {string} Pollutant name
 */
function getPollutantName(pollutantId) {
  const pollutant = allPollutants.find(p => p.id === pollutantId);
  return pollutant ? pollutant.pollutant : `Pollutant ${pollutantId}`;
}

/**
 * Get pollutant unit by ID
 * @param {number} pollutantId - Pollutant ID
 * @returns {string} Pollutant unit
 */
function getPollutantUnit(pollutantId) {
  console.log('Getting unit for pollutant ID:', pollutantId);
  const pollutant = allPollutants.find(p => p.id === pollutantId);
  console.log('Found pollutant:', pollutant);
  const unit = pollutant?.emission_unit || '';
  console.log('Returning unit:', unit);
  return unit;
}

/**
 * Get group name by ID
 * @param {number} groupId - Group ID
 * @returns {string} Group name
 */
function getGroupName(groupId) {
  const group = allGroups.find(g => g.id === groupId);
  return group ? group.group_title : `Group ${groupId}`;
}

/**
 * Load group information by ID
 * @param {number} groupId - Group ID to lookup
 * @returns {Object} Group information object
 */
function loadGroupInfo(groupId) {
  // Find the group in our cached data
  const group = groupsData.find(g => g.id === parseInt(groupId));
  
  if (!group) {
    console.warn(`Group ${groupId} not found in data`);
    return null;
  }

  return {
    id: group.id,
    name: group.group_title || `Group ${group.id}`,
    description: group.description || '',
    group_title: group.group_title
  };
}

/**
 * Fallback function for direct data loading (when shared loader fails)
 */
async function loadDataDirectly() {
  console.log("Fetching scatter chart data directly from Supabase...");

  const client = ensureInitialized();
  if (!client) {
    throw new Error('Supabase client not available');
  }

  // Fetch pollutants, groups, and the timeseries table separately
  const [pollutantsResp, groupsResp, dataResp] = await Promise.all([
    client.from('NAEI_global_Pollutants').select('*'),
    client.from('NAEI_global_t_Group').select('*'),
    client.from('NAEI_2023ds_t_Group_Data').select('*')
  ]);

  if (pollutantsResp.error) throw pollutantsResp.error;
  if (groupsResp.error) throw groupsResp.error;
  if (dataResp.error) throw dataResp.error;

  return {
    pollutants: pollutantsResp.data || [],
    groups: groupsResp.data || [],
    rows: dataResp.data || []
  };
}

// Create the main export object for this module (defined after all functions)
try {
  window.supabaseModule = {
    get client() { return ensureInitialized(); },
    loadData,
    loadDataDirectly,
    loadGroupInfo,
    trackAnalytics,
    getAvailableYears,
    getScatterData,
    getPollutantName,
    getPollutantUnit,
    getGroupName,
    get allPollutants() { return allPollutants; },
    get allGroups() { return allGroups; },
    get allGroupsList() { return allGroupsList; },
    get activityDataId() { return activityDataId; }
  };
  console.log('supabaseModule for scatter chart initialized successfully');
} catch (error) {
  console.error('Failed to initialize supabaseModule for scatter chart:', error);
}