/**
 * Shared Data Loader for NAEI Charts
 * Handles loading and caching of common data used by both line and scatter charts
 * Prevents duplicate data loading when switching between charts
 */

// Global data cache
window.SharedDataCache = window.SharedDataCache || {
  isLoaded: false,
  isLoading: false,
  loadPromise: null,
  data: {
    pollutants: [],
    groups: [],
    timeseries: []
  },
  maps: {
    pollutantIdToName: {},
    pollutantNameToId: {},
    groupIdToName: {},
    groupNameToId: {},
    pollutantUnits: {}
  }
};

/**
 * Initialize Supabase client (reuses existing SupabaseConfig)
 */
function getSupabaseClient() {
  if (!window.SupabaseConfig) {
    throw new Error('SupabaseConfig not available');
  }
  return window.SupabaseConfig.initSupabaseClient();
}

/**
 * Load all shared data from Supabase with caching
 * Returns a promise that resolves when data is loaded
 */
async function loadSharedData() {
  const cache = window.SharedDataCache;
  
  // If data is already loaded, return immediately
  if (cache.isLoaded) {
    console.log("Using cached shared data");
    return cache.data;
  }
  
  // If loading is in progress, return the existing promise
  if (cache.isLoading && cache.loadPromise) {
    console.log("Waiting for existing data load to complete");
    return await cache.loadPromise;
  }
  
  // Start loading data
  cache.isLoading = true;
  cache.loadPromise = loadDataFromSupabase();
  
  try {
    const result = await cache.loadPromise;
    cache.isLoaded = true;
    cache.isLoading = false;
    return result;
  } catch (error) {
    cache.isLoading = false;
    cache.loadPromise = null;
    throw error;
  }
}

/**
 * Actually fetch data from Supabase
 */
async function loadDataFromSupabase() {
  console.log("Loading shared data from Supabase...");
  
  const client = getSupabaseClient();
  const cache = window.SharedDataCache;
  
  // Fetch all required data in parallel
  const [pollutantsResp, groupsResp, dataResp] = await Promise.all([
    client.from('NAEI_global_Pollutants').select('*'),
    client.from('NAEI_global_t_Group').select('*'),
    client.from('NAEI_2023ds_t_Group_Data').select('*')
  ]);

  if (pollutantsResp.error) throw pollutantsResp.error;
  if (groupsResp.error) throw groupsResp.error;
  if (dataResp.error) throw dataResp.error;

  const pollutants = pollutantsResp.data || [];
  const groups = groupsResp.data || [];
  const timeseries = dataResp.data || [];
  
  // Store data in cache
  cache.data = { pollutants, groups, timeseries };
  
  // Build lookup maps for performance
  buildLookupMaps(pollutants, groups);
  
  // Store globally for backwards compatibility
  window.allPollutantsData = pollutants;
  window.allGroupsData = groups;
  
  console.log(`Loaded ${pollutants.length} pollutants, ${groups.length} groups, ${timeseries.length} data points`);
  
  return cache.data;
}

/**
 * Build lookup maps for fast data access
 */
function buildLookupMaps(pollutants, groups) {
  const maps = window.SharedDataCache.maps;
  
  // Clear existing maps
  Object.keys(maps).forEach(key => {
    if (typeof maps[key] === 'object') {
      Object.keys(maps[key]).forEach(prop => delete maps[key][prop]);
    }
  });
  
  // Build pollutant maps
  pollutants.forEach(p => {
    if (p.id && p.pollutant) {
      maps.pollutantIdToName[p.id] = p.pollutant;
      maps.pollutantNameToId[p.pollutant.toLowerCase()] = p.id;
      
      if (p["emission unit"]) {
        maps.pollutantUnits[p.pollutant] = p["emission unit"];
      }
    }
  });
  
  // Build group maps
  groups.forEach(g => {
    if (g.id && g.group_name) {
      maps.groupIdToName[g.id] = g.group_name;
      maps.groupNameToId[g.group_name.toLowerCase()] = g.id;
    }
  });
}

/**
 * Get cached data (must call loadSharedData() first)
 */
function getCachedData() {
  if (!window.SharedDataCache.isLoaded) {
    throw new Error('Shared data not loaded. Call loadSharedData() first.');
  }
  return window.SharedDataCache.data;
}

/**
 * Utility functions for accessing cached data
 */
function getPollutantName(id) {
  return window.SharedDataCache.maps.pollutantIdToName[id] || `Pollutant ${id}`;
}

function getPollutantId(name) {
  return window.SharedDataCache.maps.pollutantNameToId[name.toLowerCase()];
}

function getGroupName(id) {
  return window.SharedDataCache.maps.groupIdToName[id] || `Group ${id}`;
}

function getGroupId(name) {
  return window.SharedDataCache.maps.groupNameToId[name.toLowerCase()];
}

function getPollutantUnit(name) {
  return window.SharedDataCache.maps.pollutantUnits[name] || '';
}

function getAllPollutants() {
  return getCachedData().pollutants;
}

function getAllGroups() {
  return getCachedData().groups;
}

function getAllTimeseries() {
  return getCachedData().timeseries;
}

/**
 * Check if data is already loaded
 */
function isDataLoaded() {
  return window.SharedDataCache.isLoaded;
}

/**
 * Clear cache (useful for testing or forced refresh)
 */
function clearCache() {
  const cache = window.SharedDataCache;
  cache.isLoaded = false;
  cache.isLoading = false;
  cache.loadPromise = null;
  cache.data = { pollutants: [], groups: [], timeseries: [] };
  
  Object.keys(cache.maps).forEach(key => {
    if (typeof cache.maps[key] === 'object') {
      Object.keys(cache.maps[key]).forEach(prop => delete cache.maps[key][prop]);
    }
  });
}

// Export functions to global scope
window.SharedDataLoader = {
  loadSharedData,
  getCachedData,
  getPollutantName,
  getPollutantId,
  getGroupName,
  getGroupId,
  getPollutantUnit,
  getAllPollutants,
  getAllGroups,
  getAllTimeseries,
  isDataLoaded,
  clearCache
};

console.log('Shared Data Loader initialized');