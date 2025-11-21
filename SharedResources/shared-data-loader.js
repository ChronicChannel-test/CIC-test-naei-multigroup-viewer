/**
 * Shared Data Loader for NAEI Charts
 * Handles loading and caching of common data used by both line and scatter charts
 * Prevents duplicate data loading when switching between charts
 */

// Determine whether to surface verbose logging (opt-in via URL params)
const __sharedDataDebugParams = (() => {
  try {
    return new URLSearchParams(window.location.search || '');
  } catch (error) {
    return new URLSearchParams('');
  }
})();

const __sharedDataDebugEnabled = ['sharedLogs', 'sharedDebug']
  .some(flag => __sharedDataDebugParams.has(flag));

const sharedDataDebugLog = __sharedDataDebugEnabled ? console.log.bind(console) : () => {};
const sharedDataInfoLog = (() => {
  const info = console.info ? console.info.bind(console) : console.log.bind(console);
  return (...args) => info('[SharedData]', ...args);
})();
const sharedDataNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function resolveExistingSharedCache() {
  if (window.SharedDataCache) {
    return window.SharedDataCache;
  }
  try {
    if (window.parent && window.parent !== window && window.parent.SharedDataCache) {
      return window.parent.SharedDataCache;
    }
  } catch (error) {
    // Access to parent may be blocked; ignore and proceed with local cache
  }
  return null;
}

// Global data cache (mirrors parent cache when available)
window.SharedDataCache = resolveExistingSharedCache() || {
  isLoaded: false,
  isLoading: false,
  fullBootstrapPromise: null,
  loadPromise: null,
  defaultSnapshot: null,
  snapshotData: null,
  heroCache: new Map(),
  data: {
    pollutants: [],
    groups: [],
    timeseries: [],
    nfrCodes: []
  },
  maps: {
    pollutantIdToName: {},
    pollutantNameToId: {},
    groupIdToName: {},
    groupNameToId: {},
    pollutantUnits: {}
  }
};

const DEFAULT_SNAPSHOT_PATHS = [
  'SharedResources/default-chart-data.json',
  '../SharedResources/default-chart-data.json',
  '../../SharedResources/default-chart-data.json'
];

let defaultSnapshotPromise = null;
const HERO_DEFAULT_ACTIVITY_NAME = 'Activity Data';

function uniqNumbers(values = []) {
  const deduped = [];
  const seen = new Set();
  values.forEach(val => {
    const num = Number(val);
    if (!Number.isFinite(num) || seen.has(num)) {
      return;
    }
    seen.add(num);
    deduped.push(num);
  });
  return deduped;
}

function uniqStrings(values = []) {
  const deduped = [];
  const seen = new Set();
  values.forEach(val => {
    if (typeof val !== 'string') {
      return;
    }
    const trimmed = val.trim();
    if (!trimmed) {
      return;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    deduped.push(trimmed);
  });
  return deduped;
}

async function loadDefaultSnapshot() {
  if (window.SharedDataCache.defaultSnapshot) {
    sharedDataInfoLog('Using cached default JSON snapshot', {
      generatedAt: window.SharedDataCache.defaultSnapshot.generatedAt || null
    });
    return window.SharedDataCache.defaultSnapshot;
  }

  if (!defaultSnapshotPromise) {
    defaultSnapshotPromise = (async () => {
      for (const candidate of DEFAULT_SNAPSHOT_PATHS) {
        try {
          sharedDataInfoLog('Attempting to fetch default snapshot', { candidate });
          const fetchStart = sharedDataNow();
          const response = await fetch(candidate, { cache: 'no-store' });
          if (!response.ok) {
            continue;
          }
          const snapshot = await response.json();
          window.SharedDataCache.defaultSnapshot = snapshot;
          window.SharedDataCache.snapshotData = snapshot?.data || null;
          const duration = (sharedDataNow() - fetchStart).toFixed(1);
          const counts = snapshot?.data
            ? {
                pollutants: snapshot.data.pollutants?.length || 0,
                groups: snapshot.data.groups?.length || 0,
                rows: snapshot.data.timeseries?.length || snapshot.data.rows?.length || 0,
                years: snapshot.data.years?.length || 0
              }
            : null;
          sharedDataInfoLog('Default snapshot loaded', {
            candidate,
            durationMs: Number(duration),
            counts
          });
          return snapshot;
        } catch (error) {
          sharedDataDebugLog(`Default snapshot fetch failed for ${candidate}:`, error);
        }
      }
      sharedDataInfoLog('Default snapshot unavailable after checking configured paths');
      return null;
    })();
  }

  try {
    const snapshot = await defaultSnapshotPromise;
    if (snapshot && !window.SharedDataCache.snapshotData) {
      window.SharedDataCache.snapshotData = snapshot.data || null;
    }
    return snapshot || null;
  } finally {
    if (window.SharedDataCache.defaultSnapshot) {
      defaultSnapshotPromise = Promise.resolve(window.SharedDataCache.defaultSnapshot);
    }
  }
}

function normalizeHeroOptions(rawOptions = {}) {
  const normalized = {
    pollutantIds: uniqNumbers(rawOptions.pollutantIds || []),
    pollutantNames: uniqStrings(rawOptions.pollutantNames || []),
    groupIds: uniqNumbers(rawOptions.groupIds || []),
    groupNames: uniqStrings(rawOptions.groupNames || []),
    includeActivityData: Boolean(rawOptions.includeActivityData),
    activityPollutantName: rawOptions.activityPollutantName || HERO_DEFAULT_ACTIVITY_NAME,
    defaultPollutantNames: uniqStrings(rawOptions.defaultPollutantNames || []),
    defaultGroupNames: uniqStrings(rawOptions.defaultGroupNames || [])
  };

  if (normalized.includeActivityData && normalized.activityPollutantName) {
    normalized.pollutantNames.push(normalized.activityPollutantName);
  }

  if (!normalized.pollutantIds.length && !normalized.pollutantNames.length && normalized.defaultPollutantNames.length) {
    normalized.pollutantNames = normalized.defaultPollutantNames.slice();
  }

  if (!normalized.groupIds.length && !normalized.groupNames.length && normalized.defaultGroupNames.length) {
    normalized.groupNames = normalized.defaultGroupNames.slice();
  }

  normalized.pollutantIds = uniqNumbers(normalized.pollutantIds);
  normalized.pollutantNames = uniqStrings(normalized.pollutantNames);
  normalized.groupIds = uniqNumbers(normalized.groupIds);
  normalized.groupNames = uniqStrings(normalized.groupNames);

  if (!normalized.pollutantIds.length && !normalized.pollutantNames.length) {
    throw new Error('Hero dataset requires at least one pollutant identifier');
  }

  if (!normalized.groupIds.length && !normalized.groupNames.length) {
    throw new Error('Hero dataset requires at least one group identifier');
  }

  normalized.cacheKey = JSON.stringify({
    pollutantIds: normalized.pollutantIds,
    pollutantNames: normalized.pollutantNames.map(name => name.toLowerCase()),
    groupIds: normalized.groupIds,
    groupNames: normalized.groupNames.map(name => name.toLowerCase())
  });

  return normalized;
}

async function loadHeroDataset(options = {}) {
  const cache = window.SharedDataCache;
  cache.heroCache = cache.heroCache || new Map();

  let normalized;
  try {
    normalized = normalizeHeroOptions(options);
  } catch (error) {
    sharedDataDebugLog('Hero dataset skipped:', error.message || error);
    throw error;
  }

  if (cache.heroCache.has(normalized.cacheKey)) {
    const cached = cache.heroCache.get(normalized.cacheKey);
    if (cached && typeof cached.then !== 'function') {
      sharedDataInfoLog('Hero dataset fulfilled from cache', {
        pollutants: cached.pollutants?.length || 0,
        groups: cached.groups?.length || 0,
        rows: cached.timeseries?.length || cached.rows?.length || 0
      });
      return cached;
    }
    return cached;
  }

  const heroPromise = (async () => {
    const client = getSupabaseClient();
    const pollutantQuery = client.from('NAEI_global_Pollutants').select('*');
    let pollutantResp;
    if (normalized.pollutantIds.length) {
      pollutantResp = await pollutantQuery.in('id', normalized.pollutantIds);
    } else {
      pollutantResp = await pollutantQuery.in('pollutant', normalized.pollutantNames);
    }
    if (pollutantResp.error) throw pollutantResp.error;

    const groupQuery = client.from('NAEI_global_t_Group').select('*');
    let groupResp;
    if (normalized.groupIds.length) {
      groupResp = await groupQuery.in('id', normalized.groupIds);
    } else {
      groupResp = await groupQuery.in('group_title', normalized.groupNames);
    }
    if (groupResp.error) throw groupResp.error;

    const pollutantIdSet = new Set(normalized.pollutantIds);
    (pollutantResp.data || []).forEach(row => {
      if (Number.isFinite(row.id)) {
        pollutantIdSet.add(row.id);
      }
    });

    const groupIdSet = new Set(normalized.groupIds);
    (groupResp.data || []).forEach(row => {
      if (Number.isFinite(row.id)) {
        groupIdSet.add(row.id);
      }
    });

    if (!pollutantIdSet.size || !groupIdSet.size) {
      throw new Error('Hero dataset lacked resolved pollutant or group IDs');
    }

    const timeseriesResp = await client
      .from('NAEI_2023ds_t_Group_Data')
      .select('*')
      .in('pollutant_id', Array.from(pollutantIdSet))
      .in('group_id', Array.from(groupIdSet));
    if (timeseriesResp.error) throw timeseriesResp.error;

    const payload = {
      pollutants: pollutantResp.data || [],
      groups: groupResp.data || [],
      timeseries: timeseriesResp.data || [],
      metadata: {
        pollutantIds: Array.from(pollutantIdSet),
        groupIds: Array.from(groupIdSet)
      }
    };

    sharedDataInfoLog('Hero dataset fetch completed', {
      pollutants: payload.pollutants.length,
      groups: payload.groups.length,
      rows: payload.timeseries.length
    });

    return payload;
  })().catch(error => {
    cache.heroCache.delete(normalized.cacheKey);
    throw error;
  });

  cache.heroCache.set(normalized.cacheKey, heroPromise);
  const heroData = await heroPromise;
  cache.heroCache.set(normalized.cacheKey, heroData);
  return heroData;
}

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
    sharedDataInfoLog('Shared data fulfilled from cache');
    return cache.data;
  }
  
  // If loading is in progress, return the existing promise
  if (cache.isLoading && cache.loadPromise) {
    sharedDataInfoLog('Awaiting in-flight shared data load');
    return await cache.loadPromise;
  }
  
  // Start loading data
  cache.isLoading = true;
  cache.loadPromise = loadDataFromSupabase();
  
  try {
    const result = await cache.loadPromise;
    cache.isLoaded = true;
    cache.isLoading = false;
    cache.fullBootstrapPromise = null;
    return result;
  } catch (error) {
    cache.isLoading = false;
    cache.loadPromise = null;
    cache.fullBootstrapPromise = null;
    throw error;
  }
}

function bootstrapFullDataset(reason = 'chart') {
  const cache = window.SharedDataCache;
  if (cache.isLoaded) {
    return Promise.resolve(cache.data);
  }
  if (cache.fullBootstrapPromise) {
    return cache.fullBootstrapPromise;
  }
  sharedDataInfoLog('Full dataset bootstrap requested', { reason });
  cache.fullBootstrapPromise = loadSharedData()
    .catch(error => {
      cache.fullBootstrapPromise = null;
      throw error;
    });
  return cache.fullBootstrapPromise;
}

/**
 * Actually fetch data from Supabase
 */
async function loadDataFromSupabase() {
  sharedDataInfoLog('Starting shared Supabase fetch');
  
  const client = getSupabaseClient();
  const cache = window.SharedDataCache;
  const batchStart = sharedDataNow();

  const timedQuery = (label, promise) => {
    const start = sharedDataNow();
    sharedDataInfoLog(`Supabase query started`, { label });
    return promise.then(response => {
      const duration = (sharedDataNow() - start).toFixed(1);
      if (response?.error) {
        sharedDataInfoLog('Supabase query failed', {
          label,
          durationMs: Number(duration),
          message: response.error.message || String(response.error)
        });
      } else {
        sharedDataInfoLog('Supabase query completed', {
          label,
          durationMs: Number(duration),
          rows: Array.isArray(response?.data) ? response.data.length : 0
        });
      }
      return response;
    });
  };
  
  // Fetch all required data in parallel
  const [pollutantsResp, groupsResp, dataResp, nfrResp] = await Promise.all([
    timedQuery('NAEI_global_Pollutants', client.from('NAEI_global_Pollutants').select('*')),
    timedQuery('NAEI_global_t_Group', client.from('NAEI_global_t_Group').select('*')),
    timedQuery('NAEI_2023ds_t_Group_Data', client.from('NAEI_2023ds_t_Group_Data').select('*')),
    timedQuery('NAEI_global_t_NFRCode', client.from('NAEI_global_t_NFRCode').select('*'))
  ]);

  if (pollutantsResp.error) throw pollutantsResp.error;
  if (groupsResp.error) throw groupsResp.error;
  if (dataResp.error) throw dataResp.error;
  if (nfrResp.error) throw nfrResp.error;

  const pollutants = pollutantsResp.data || [];
  const groups = groupsResp.data || [];
  const timeseries = dataResp.data || [];
  const nfrCodes = nfrResp.data || [];
  
  // Store data in cache
  cache.data = { pollutants, groups, timeseries, nfrCodes };
  cache.snapshotData = cache.snapshotData || { pollutants, groups };
  
  // Build lookup maps for performance
  buildLookupMaps(pollutants, groups);
  
  // Store globally for backwards compatibility
  window.allPollutantsData = pollutants;
  window.allGroupsData = groups;
  
  sharedDataInfoLog('Shared Supabase fetch completed', {
    totalDurationMs: Number((sharedDataNow() - batchStart).toFixed(1)),
    summary: {
      pollutants: pollutants.length,
      groups: groups.length,
      rows: timeseries.length,
      nfrCodes: nfrCodes.length
    }
  });
  
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
      
      const emissionUnit = p["emission unit"] || p.emission_unit || p["Emission Unit"];
      if (emissionUnit) {
        maps.pollutantUnits[p.pollutant] = emissionUnit;
      }
    }
  });
  
  // Build group maps
  groups.forEach(g => {
    const name = g.group_title || g.group_name;
    if (g.id && name) {
      maps.groupIdToName[g.id] = name;
      maps.groupNameToId[name.toLowerCase()] = g.id;
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

function getAllNfrCodes() {
  return getCachedData().nfrCodes || [];
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
  loadDefaultSnapshot,
  bootstrapFullDataset,
  loadHeroDataset,
  getCachedData,
  hasDefaultSnapshot: () => Boolean(window.SharedDataCache.defaultSnapshot),
  getPollutantName,
  getPollutantId,
  getGroupName,
  getGroupId,
  getPollutantUnit,
  getAllPollutants,
  getAllGroups,
  getAllTimeseries,
  getAllNfrCodes,
  isDataLoaded,
  clearCache
};

sharedDataDebugLog('Shared Data Loader initialized');