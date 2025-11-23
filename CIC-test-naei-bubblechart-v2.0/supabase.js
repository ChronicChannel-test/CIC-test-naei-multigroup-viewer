/**
 * Supabase Data Module for Scatter Chart
 * Handles all Supabase database connections, data loading, and analytics tracking
 * v1.0 - Uses shared resources
 */

// Initialize Supabase client and analytics lazily to avoid dependency issues
let supabase = null;

const supabaseInitialParams = new URLSearchParams(window.location.search || '');
const supabaseDebugLoggingEnabled = ['debug', 'logs', 'debugLogs'].some(flag => supabaseInitialParams.has(flag));
const bubbleDataInfoLog = (() => {
  const info = console.info ? console.info.bind(console) : console.log.bind(console);
  return (...args) => info('[Bubble data]', ...args);
})();
const bubbleDataNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
window.__NAEI_DEBUG__ = window.__NAEI_DEBUG__ || supabaseDebugLoggingEnabled;

const bubbleLogger = (() => {
  if (window.BubbleLogger) {
    if (supabaseDebugLoggingEnabled) {
      window.BubbleLogger.setEnabled?.(true);
    }
    return window.BubbleLogger;
  }
  const fallback = {
    enabled: supabaseDebugLoggingEnabled,
    setEnabled() {},
    log: (...args) => {
      if (supabaseDebugLoggingEnabled) {
        console.log('[bubble]', ...args);
      }
    },
    warn: (...args) => {
      if (supabaseDebugLoggingEnabled) {
        console.warn('[bubble]', ...args);
      }
    }
  };
  return fallback;
})();

const supabaseDebugLog = (tag, ...args) => {
  if (!bubbleLogger?.enabled) {
    return;
  }
  const label = typeof tag === 'string' ? tag : 'log';
  const details = typeof tag === 'string' ? args : [tag, ...args];
  bubbleLogger.log(`[supabase:${label}]`, ...details);
};

const supabaseDebugWarn = (...args) => {
  if (!bubbleLogger?.enabled) {
    return;
  }
  bubbleLogger.warn('[supabase]', ...args);
};
let supabaseUnavailableLogged = false;
let localSessionId = null;

function readParentSearchParams() {
  let search = window.location.search || '';
  try {
    if (window.parent && window.parent !== window) {
      const parentSearch = window.parent.location?.search;
      if (typeof parentSearch === 'string') {
        search = parentSearch;
      }
    }
  } catch (error) {
    // Ignore cross-origin issues and fall back to iframe query string
  }
  return new URLSearchParams(search || '');
}

function normalizeChartId(value) {
  if (!value) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'bubble' || normalized === 'bubble-chart') {
    return '1';
  }
  if (normalized === '2' || normalized === 'line' || normalized === 'line-chart') {
    return '2';
  }
  return normalized;
}

function isBubbleChartActive(params) {
  const chartParam = normalizeChartId(params.get('chart'));
  if (!chartParam) {
    return true;
  }
  return chartParam === '1';
}

function getEffectiveBubbleUrlParams() {
  return readParentSearchParams();
}

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
let activeActDataGroups = [];
let activeActDataGroupIds = [];
let inactiveActDataGroupIds = [];
let pollutantsData = []; // Store raw pollutant data for ID lookups
let groupsData = []; // Store raw group data for ID lookups
let actDataPollutantId = null;

const ACTIVITY_POLLUTANT_NAME = 'Activity Data';
const DEFAULT_BUBBLE_POLLUTANT_NAME = 'PM2.5';
const DEFAULT_BUBBLE_POLLUTANT_ID = 5;
const DEFAULT_BUBBLE_GROUP_TITLES = [
  'Ecodesign Stove - Ready To Burn',
  'Gas Boilers'
];
const DEFAULT_BUBBLE_GROUP_IDS = [20, 37];
const DEFAULT_BUBBLE_YEAR = 2023;
let hasFullDataset = false;
let latestDatasetSource = null;
const hydrationListeners = new Set();
const urlOverrideParams = ['pollutant','pollutantId','group','groupId','groupIds','group_ids','activityGroup','actGroup','dataset','year'];
let groupMetadataCache = null;
let groupMetadataPromise = null;
let sharedLoaderReference = null;
let bubbleInitialDatasetInfo = null;
let bubbleFullDatasetPromise = null;
let fullDatasetToastShown = false;

function sortNumericList(values = []) {
  return values.slice().sort((a, b) => a - b);
}

function matchesNumericSet(values = [], defaults = []) {
  if (!values.length || !defaults.length) {
    return false;
  }
  const normalizedValues = sortNumericList(values);
  const normalizedDefaults = sortNumericList(defaults);
  if (normalizedValues.length !== normalizedDefaults.length) {
    return false;
  }
  return normalizedValues.every((value, index) => value === normalizedDefaults[index]);
}

function normalizeNames(list = []) {
  return list
    .map(item => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter(Boolean)
    .sort();
}

function matchesNameSet(values = [], defaults = []) {
  if (!values.length || !defaults.length) {
    return false;
  }
  const normalizedValues = normalizeNames(values);
  const normalizedDefaults = normalizeNames(defaults);
  if (normalizedValues.length !== normalizedDefaults.length) {
    return false;
  }
  return normalizedValues.every((value, index) => value === normalizedDefaults[index]);
}

function isDefaultBubbleSelection(params = getEffectiveBubbleUrlParams()) {
  const overrideExclusiveParams = ['dataset', 'activityGroup', 'actGroup'];
  if (!isBubbleChartActive(params)) {
    return true;
  }

  if (overrideExclusiveParams.some(param => params.has(param))) {
    return false;
  }

  const pollutantIds = parseIdList(
    params.get('pollutant_id')
    || params.get('pollutantId')
  );
  const pollutantNames = parseNameList(
    params.get('pollutant')
  );
  const groupIds = parseIdList(
    params.get('group_ids')
    || params.get('groupIds')
    || params.get('groupId')
  );
  const groupNames = parseNameList(
    params.get('groups')
    || params.get('group')
  );

  const pollutantIdsDefault = !pollutantIds.length
    || matchesNumericSet(pollutantIds, [DEFAULT_BUBBLE_POLLUTANT_ID]);
  const pollutantNamesDefault = !pollutantNames.length
    || matchesNameSet(pollutantNames, [DEFAULT_BUBBLE_POLLUTANT_NAME]);
  const groupIdsDefault = !groupIds.length
    || matchesNumericSet(groupIds, DEFAULT_BUBBLE_GROUP_IDS);
  const groupNamesDefault = !groupNames.length
    || matchesNameSet(groupNames, DEFAULT_BUBBLE_GROUP_TITLES);
  const yearParam = params.get('year');
  const yearDefault = !yearParam || Number(yearParam) === DEFAULT_BUBBLE_YEAR;

  return (
    pollutantIdsDefault
    && pollutantNamesDefault
    && groupIdsDefault
    && groupNamesDefault
    && yearDefault
  );
}

function hasUrlOverrides() {
  const params = getEffectiveBubbleUrlParams();
  if (!isBubbleChartActive(params)) {
    return false;
  }
  if (!urlOverrideParams.some(param => params.has(param))) {
    return false;
  }
  return !isDefaultBubbleSelection(params);
}

function mergeRecordCollections(primary = [], secondary = [], keyResolver) {
  const resolver = typeof keyResolver === 'function'
    ? keyResolver
    : (item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        if (item.id != null) {
          return item.id;
        }
        return keyResolver && item[keyResolver] ? item[keyResolver] : null;
      };
  const merged = new Map();

  const ingest = (collection, preferExisting) => {
    collection.forEach(entry => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const key = resolver(entry);
      if (key === null || key === undefined) {
        return;
      }
      if (merged.has(key) && !preferExisting) {
        return;
      }
      merged.set(key, entry);
    });
  };

  ingest(primary, true);
  ingest(secondary, false);

  return Array.from(merged.values());
}

async function loadDefaultSelectorMetadata(sharedLoader) {
  const loader = sharedLoader || window.SharedDataLoader;
  if (!loader?.loadDefaultSnapshot) {
    return null;
  }
  try {
    const snapshot = await loader.loadDefaultSnapshot();
    return snapshot?.data || null;
  } catch (error) {
    supabaseDebugWarn('Unable to load default selector metadata:', error.message || error);
    return null;
  }
}

function parseIdList(value) {
  if (!value) {
    return [];
  }
  return value.split(',').map(part => Number(part.trim())).filter(num => Number.isFinite(num));
}

function parseNameList(value) {
  if (!value) {
    return [];
  }
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

function buildBubbleHeroOptions() {
  const params = getEffectiveBubbleUrlParams();
  if (!isBubbleChartActive(params)) {
    return null;
  }

  const pollutantIds = parseIdList(
    params.get('pollutant_id')
    || params.get('pollutantId')
  );
  const pollutantNames = parseNameList(
    params.get('pollutant')
  );
  const groupIds = parseIdList(
    params.get('group_ids')
    || params.get('groupIds')
  );
  const groupNames = parseNameList(
    params.get('groups')
    || params.get('group')
  );

  if (!pollutantIds.length && !pollutantNames.length) {
    pollutantNames.push(DEFAULT_BUBBLE_POLLUTANT_NAME);
  }

  if (!groupIds.length && !groupNames.length) {
    groupNames.push(...DEFAULT_BUBBLE_GROUP_TITLES);
  }

  return {
    pollutantIds,
    pollutantNames,
    groupIds,
    groupNames,
    includeActivityData: true,
    activityPollutantName: ACTIVITY_POLLUTANT_NAME,
    defaultPollutantNames: [DEFAULT_BUBBLE_POLLUTANT_NAME],
    defaultGroupNames: DEFAULT_BUBBLE_GROUP_TITLES
  };
}

function resolveHeroLoader(sharedLoader) {
  if (sharedLoader?.loadHeroDataset) {
    return sharedLoader;
  }
  if (window.SharedDataLoader?.loadHeroDataset) {
    return window.SharedDataLoader;
  }
  return null;
}

async function loadBubbleHeroDataset(sharedLoader) {
  const loader = resolveHeroLoader(sharedLoader);
  if (!loader) {
    return null;
  }
  const options = buildBubbleHeroOptions();
  if (!options) {
    return null;
  }
  bubbleDataInfoLog('Requesting bubble hero dataset', {
    pollutants: options.pollutantIds.length || options.pollutantNames.length,
    groups: options.groupIds.length || options.groupNames.length
  });
  try {
    const heroDataset = await loader.loadHeroDataset(options);
    return heroDataset;
  } catch (error) {
    bubbleDataInfoLog('Bubble hero dataset unavailable', error.message || error);
    return null;
  }
}

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
async function resolveSharedLoader() {
  try {
    if (window.parent && window.parent.SharedDataLoader) {
      return window.parent.SharedDataLoader;
    }
  } catch (error) {
    // Reduce noise: only log high-level summaries
  }
  return window.SharedDataLoader || null;
}

function getCachedGroupMetadata(sharedLoader) {
  try {
    if (sharedLoader?.isDataLoaded()) {
      const cached = sharedLoader.getCachedData();
      if (Array.isArray(cached?.groups) && cached.groups.length) {
        return cached.groups;
      }
    }
  } catch (error) {
  }

  if (window.SharedDataCache?.data?.groups?.length) {
    return window.SharedDataCache.data.groups;
  }

  return null;
}

async function ensureAllGroupMetadata(sharedLoader) {
  if (Array.isArray(groupMetadataCache) && groupMetadataCache.length) {
    return groupMetadataCache;
  }

  const cachedGroups = getCachedGroupMetadata(sharedLoader);
  if (Array.isArray(cachedGroups) && cachedGroups.length) {
    groupMetadataCache = cachedGroups;
    return groupMetadataCache;
  }

  if (!groupMetadataPromise) {
    groupMetadataPromise = (async () => {
      const client = ensureInitialized();
      if (!client) {
        throw new Error('Supabase client not available for group metadata');
      }
      const response = await client.from('NAEI_global_t_Group').select('*');
      if (response.error) {
        throw response.error;
      }
      groupMetadataCache = response.data || [];
      return groupMetadataCache;
    })().catch(error => {
      console.error('Failed to fetch group metadata:', error);
      groupMetadataPromise = null;
      throw error;
    });
  }

  return groupMetadataPromise;
}

function mergeGroupCollections(primary = [], secondary = []) {
  const merged = [];
  const seen = new Set();

  const push = (group) => {
    if (!group || typeof group !== 'object') {
      return;
    }
    const key = group.id ?? group.group_id ?? group.group_title;
    if (key == null) {
      merged.push(group);
      return;
    }
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(group);
  };

  primary.forEach(push);
  secondary.forEach(push);

  return merged;
}

function waitForFirstDatasetCandidate(promises = [], logError = () => {}) {
  const activePromises = promises.filter(Boolean);
  if (!activePromises.length) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    let settled = false;
    let pending = activePromises.length;

    const maybeResolve = value => {
      if (settled) {
        return;
      }
      if (value) {
        settled = true;
        resolve(value);
        return;
      }
      pending -= 1;
      if (!settled && pending <= 0) {
        resolve(null);
      }
    };

    activePromises.forEach(promise => {
      Promise.resolve(promise)
        .then(maybeResolve)
        .catch(error => {
          logError(error);
          maybeResolve(null);
        });
    });
  });
}

function triggerBubbleFullDatasetBootstrap(sharedLoader, reason = 'bubble-chart') {
  if (hasFullDataset) {
    return Promise.resolve({ source: 'already-hydrated' });
  }
  if (bubbleFullDatasetPromise) {
    return bubbleFullDatasetPromise;
  }

  const bootstrapReason = `bubble-${reason}`;
  const start = bubbleDataNow();
  const applyFromPayload = (payload, source) => {
    if (!payload) return payload;
    applyHydratedDataset({
      pollutants: payload.pollutants || [],
      groups: payload.groups || [],
      rows: payload.timeseries || payload.rows || payload.data || []
    }, source);
    return payload;
  };

  bubbleFullDatasetPromise = (async () => {
    const loader = sharedLoader || await resolveSharedLoader();

    if (loader?.bootstrapFullDataset) {
      const payload = await loader.bootstrapFullDataset(bootstrapReason);
      bubbleDataInfoLog('Bubble chart full dataset bootstrapped via SharedDataLoader', {
        durationMs: Number((bubbleDataNow() - start).toFixed(1)),
        rows: Array.isArray(payload?.timeseries) ? payload.timeseries.length : payload?.rows?.length || 0
      });
      return applyFromPayload(payload, 'shared-bootstrap');
    }

    if (loader?.loadSharedData) {
      const payload = await loader.loadSharedData();
      bubbleDataInfoLog('Bubble chart full dataset loaded via SharedDataLoader fallback', {
        durationMs: Number((bubbleDataNow() - start).toFixed(1)),
        rows: Array.isArray(payload?.timeseries) ? payload.timeseries.length : 0
      });
      return applyFromPayload(payload, 'shared-loader');
    }

    const directPayload = await loadDataDirectly();
    bubbleDataInfoLog('Bubble chart full dataset loaded directly (no shared loader)', {
      durationMs: Number((bubbleDataNow() - start).toFixed(1)),
      rows: Array.isArray(directPayload?.rows) ? directPayload.rows.length : 0
    });
    return applyFromPayload(directPayload, 'direct');
  })().catch(error => {
    bubbleFullDatasetPromise = null;
    console.error('Bubble chart full dataset bootstrap failed:', error);
    throw error;
  });

  return bubbleFullDatasetPromise;
}

async function loadData(options = {}) {
  const { useDefaultSnapshot = !hasUrlOverrides() } = options;

  const defaultChartMode = Boolean(useDefaultSnapshot);
  const sharedLoader = await resolveSharedLoader();
  let snapshotRequestedAt = null;
  let snapshotPromise = null;

  try {
    await trackAnalytics('page_load', {
      page: 'bubble_chart',
      timestamp: new Date().toISOString()
    });

    let pollutants = [];
    let groups = [];
    let rows = [];
    let metadataPollutants = [];
    let metadataGroups = [];

    let selectorMetadata = null;
    let selectorMetadataLoaded = false;
    const ensureSelectorMetadata = async () => {
      if (selectorMetadataLoaded) {
        return selectorMetadata;
      }
      selectorMetadata = await loadDefaultSelectorMetadata(sharedLoader);
      if (!selectorMetadata && window.SharedDataCache?.snapshotData) {
        selectorMetadata = window.SharedDataCache.snapshotData;
      }
      selectorMetadataLoaded = true;
      return selectorMetadata;
    };

    const haveData = () => pollutants.length && groups.length && rows.length;

    if (sharedLoader?.isDataLoaded()) {
      const cachedData = sharedLoader.getCachedData();
      pollutants = cachedData.pollutants;
      groups = cachedData.groups;
      rows = cachedData.timeseries;
      hasFullDataset = true;
      latestDatasetSource = 'cache';
      bubbleDataInfoLog('Bubble chart hydrated from shared cache', {
        pollutants: pollutants.length,
        groups: groups.length,
        rows: rows.length
      });
    }

    if (!haveData() && sharedLoader) {
      const raceCandidates = [];
      if (!sharedLoader.isDataLoaded?.()) {
        const bootstrapPromise = triggerBubbleFullDatasetBootstrap(sharedLoader, 'initial-race');
        raceCandidates.push(
          bootstrapPromise
            .then(payload => {
              if (payload?.pollutants?.length || payload?.timeseries?.length) {
                return { source: 'supabase', payload };
              }
              return null;
            })
            .catch(error => {
              bubbleDataInfoLog('Initial Supabase bootstrap candidate failed', {
                message: error?.message || String(error)
              });
              return null;
            })
        );
      }

      if (defaultChartMode && sharedLoader.loadDefaultSnapshot) {
        snapshotRequestedAt = bubbleDataNow();
        if (!snapshotPromise) {
          snapshotPromise = sharedLoader.loadDefaultSnapshot();
        }
        raceCandidates.push(
          snapshotPromise
            .then(snapshot => {
              if (snapshot?.data) {
                return { source: 'snapshot', snapshot, requestedAt: snapshotRequestedAt };
              }
              return null;
            })
            .catch(error => {
              bubbleDataInfoLog('Default snapshot race candidate failed', {
                message: error?.message || String(error)
              });
              return null;
            })
        );
      }

      if (raceCandidates.length) {
        const initialResult = await waitForFirstDatasetCandidate(raceCandidates, error => {
          bubbleDataInfoLog('Initial dataset candidate rejected', {
            message: error?.message || String(error)
          });
        });

        if (initialResult?.source === 'supabase') {
          const payload = initialResult.payload || {};
          pollutants = payload.pollutants || [];
          groups = payload.groups || [];
          rows = payload.timeseries || payload.rows || payload.data || [];
          hasFullDataset = true;
          latestDatasetSource = 'shared-bootstrap';
          bubbleDataInfoLog('Bubble chart fulfilled via initial Supabase bootstrap', {
            pollutants: pollutants.length,
            groups: groups.length,
            rows: rows.length
          });
        } else if (initialResult?.source === 'snapshot') {
          const snapshot = initialResult.snapshot;
          pollutants = snapshot.data.pollutants || [];
          groups = snapshot.data.groups || [];
          rows = snapshot.data.timeseries || snapshot.data.rows || snapshot.data.data || [];
          hasFullDataset = false;
          latestDatasetSource = 'snapshot';
          const snapshotDuration = initialResult.requestedAt
            ? Number((bubbleDataNow() - initialResult.requestedAt).toFixed(1))
            : null;
          bubbleDataInfoLog('Bubble chart using default JSON snapshot', {
            durationMs: snapshotDuration,
            generatedAt: snapshot.generatedAt || null,
            summary: {
              pollutants: pollutants.length,
              groups: groups.length,
              rows: rows.length
            }
          });
        }
      }
    }

    if (!haveData()) {
      const heroDataset = await loadBubbleHeroDataset(sharedLoader);
      if (heroDataset?.pollutants?.length && heroDataset.groups?.length) {
        pollutants = heroDataset.pollutants;
        groups = heroDataset.groups;
        rows = heroDataset.timeseries || heroDataset.rows || [];
        hasFullDataset = false;
        latestDatasetSource = 'hero';
        bubbleDataInfoLog('Bubble chart hydrated via Supabase hero dataset', {
          pollutants: pollutants.length,
          groups: groups.length,
          rows: rows.length
        });
        triggerBubbleFullDatasetBootstrap(sharedLoader, defaultChartMode ? 'snapshot-fallback' : 'hero');
      }
    }

    if (!haveData()) {
      if (sharedLoader) {
        try {
          const sharedData = await sharedLoader.loadSharedData();
          pollutants = sharedData.pollutants;
          groups = sharedData.groups;
          rows = sharedData.timeseries;
          hasFullDataset = true;
          latestDatasetSource = 'shared-loader';
          bubbleDataInfoLog('Bubble chart hydrated via SharedDataLoader', {
            pollutants: pollutants.length,
            groups: groups.length,
            rows: rows.length
          });
        } catch (error) {
          console.error('Shared loader failed, falling back to direct load:', error);
          const result = await loadDataDirectly();
          pollutants = result.pollutants;
          groups = result.groups;
          rows = result.rows;
          hasFullDataset = true;
          latestDatasetSource = 'direct';
          bubbleDataInfoLog('Bubble chart fulfilled by direct Supabase fetch after shared loader failure', {
            pollutants: pollutants.length,
            groups: groups.length,
            rows: rows.length
          });
        }
      } else {
        const result = await loadDataDirectly();
        pollutants = result.pollutants;
        groups = result.groups;
        rows = result.rows;
        hasFullDataset = true;
        latestDatasetSource = 'direct';
        bubbleDataInfoLog('Bubble chart fulfilled by direct Supabase fetch (no shared loader)', {
          pollutants: pollutants.length,
          groups: groups.length,
          rows: rows.length
        });
      }
    }

    if (!hasFullDataset) {
      const selectorMetadata = await ensureSelectorMetadata();
      if (selectorMetadata) {
        metadataPollutants = Array.isArray(selectorMetadata.pollutants)
          ? selectorMetadata.pollutants
          : metadataPollutants;
        metadataGroups = Array.isArray(selectorMetadata.groups)
          ? selectorMetadata.groups
          : metadataGroups;

        if (metadataPollutants.length) {
          pollutants = mergeRecordCollections(
            metadataPollutants,
            pollutants,
            record => {
              if (record?.id != null) {
                return record.id;
              }
              const name = record?.pollutant || record?.Pollutant || '';
              return name ? name.toLowerCase() : null;
            }
          );
        }

        if (metadataGroups.length) {
          groups = mergeRecordCollections(
            metadataGroups,
            groups,
            record => {
              if (record?.id != null) {
                return record.id;
              }
              const title = record?.group_title || record?.group_name || '';
              return title ? title.toLowerCase() : null;
            }
          );
        }
      }
      bubbleDataInfoLog('Applied selector metadata for bubble dropdowns', {
        metadataPollutants: metadataPollutants.length,
        metadataGroups: metadataGroups.length,
        groupsAfterMerge: groups.length
      });
    }

    const dataset = applyDataset({ pollutants, groups, rows }, {
      enforceActivityDataFilter: hasFullDataset,
      activityMetadata: !hasFullDataset && metadataGroups.length ? metadataGroups : null
    });

    if (!hasFullDataset) {
      ensureAllGroupMetadata(sharedLoader)
        .then(metadata => {
          if (!Array.isArray(metadata) || !metadata.length) {
            return;
          }
          groupMetadataCache = mergeGroupCollections(metadata, groupMetadataCache || []);
        })
        .catch(error => {
          supabaseDebugWarn('Unable to load full group metadata before hydration:', error.message || error);
        });
    }

    return dataset;

  } catch (error) {
    console.error('Error loading scatter chart data:', error);
    
    // Track error
    await trackAnalytics('error', {
      error_type: 'data_load_error',
      error_message: error.message,
      page: 'bubble_chart'
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
 * @returns {Array} Array of data points {group, actDataValue, pollutantValue}
 */
function getScatterData(year, pollutantId, groupIds) {
  const yearColumn = `f${year}`;
  const dataPoints = [];

  groupIds.forEach(groupId => {
    // Get Activity Data for this group
    const actDataRow = globalRows.find(row => 
      row.pollutant_id === actDataPollutantId && row.group_id === groupId
    );
    
    // Get pollutant data for this group
    const pollutantRow = globalRows.find(row => 
      row.pollutant_id === pollutantId && row.group_id === groupId
    );

    if (actDataRow && pollutantRow) {
      const actDataValue = actDataRow[yearColumn];
      const pollutantValue = pollutantRow[yearColumn];
      
      // Only include if both values are valid numbers
      if (actDataValue != null && pollutantValue != null && 
          !isNaN(actDataValue) && !isNaN(pollutantValue)) {
        
        const group = allGroups.find(g => g.id === groupId);
        dataPoints.push({
          groupId: groupId,
          groupName: group ? group.group_title : `Group ${groupId}`,
          actDataValue: parseFloat(actDataValue),
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
  const pollutant = allPollutants.find(p => p.id === pollutantId);
  return pollutant?.emission_unit || '';
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

function getPollutantShortName(identifier) {
  if (identifier === null || identifier === undefined) {
    return null;
  }

  const normalized = typeof identifier === 'string'
    ? identifier.trim().toLowerCase()
    : null;

  const pollutant = allPollutants.find(p => {
    if (typeof identifier === 'number') {
      return p.id === identifier;
    }
    if (normalized) {
      const candidate = (p.pollutant || p.Pollutant || '').toLowerCase();
      return candidate === normalized;
    }
    return false;
  }) || null;

  const shortName = typeof pollutant?.short_pollutant === 'string'
    ? pollutant.short_pollutant.trim()
    : '';

  if (shortName) {
    return shortName;
  }

  return (pollutant?.pollutant || pollutant?.Pollutant || null);
}

function getGroupShortTitle(identifier) {
  if (identifier === null || identifier === undefined) {
    return null;
  }

  const normalized = typeof identifier === 'string'
    ? identifier.trim().toLowerCase()
    : null;

  const group = allGroups.find(g => {
    if (typeof identifier === 'number') {
      return g.id === identifier;
    }
    if (normalized) {
      const title = (g.group_title || g.group_name || '').toLowerCase();
      return title === normalized;
    }
    return false;
  }) || null;

  const shortTitle = typeof group?.short_group_title === 'string'
    ? group.short_group_title.trim()
    : '';

  if (shortTitle) {
    return shortTitle;
  }

  return (group?.group_title || group?.group_name || null);
}

function applyDataset({ pollutants = [], groups = [], rows = [] }, options = {}) {
  const {
    enforceActivityDataFilter = true,
    activityMetadata = null
  } = options || {};
  window.allPollutantsData = pollutants;
  window.allGroupsData = groups;

  pollutantUnits = {};
  pollutants.forEach(p => {
    if (p.pollutant && p["emission unit"]) {
      pollutantUnits[p.pollutant] = p["emission unit"];
    }
  });

  const actDataPollutant = pollutants.find(p =>
    p.pollutant && p.pollutant.toLowerCase() === ACTIVITY_POLLUTANT_NAME.toLowerCase()
  );

  if (actDataPollutant) {
    actDataPollutantId = actDataPollutant.id;
  } else {
    supabaseDebugWarn('Activity Data not found in pollutants list');
    actDataPollutantId = null;
  }

  allPollutants = pollutants;
  allGroups = groups;
  if (Array.isArray(groups) && groups.length) {
    if (!Array.isArray(groupMetadataCache) || groups.length > groupMetadataCache.length) {
      groupMetadataCache = groups;
    }
  }
  globalRows = rows;
  pollutantsData = pollutants;
  groupsData = groups;

  if (rows.length > 0) {
    const sample = rows[0];
    const headers = Object.keys(sample)
      .filter(k => /^f\d{4}$/i.test(k))
      .sort((a, b) => +a.slice(1) - +b.slice(1));
    globalHeaders = headers;
    window.globalHeaders = headers;
    window.globalYears = headers.map(h => h.slice(1));
    window.globalYearKeys = headers;
  } else {
    globalHeaders = [];
    window.globalHeaders = [];
    window.globalYears = [];
    window.globalYearKeys = [];
  }

  activeActDataGroups = [];
  activeActDataGroupIds = [];
  inactiveActDataGroupIds = [];

  const metadataEntries = Array.isArray(activityMetadata)
    ? activityMetadata.filter(entry => entry && Number.isFinite(entry.id))
    : [];
  const metadataById = metadataEntries.length
    ? new Map(metadataEntries.map(entry => [entry.id, entry]))
    : null;

  const metadataHasActivity = (entry) => {
    if (!entry) {
      return true;
    }
    const rawFlag = entry.hasActivityData ?? entry.has_activity_data;
    if (rawFlag === undefined || rawFlag === null) {
      return true;
    }
    if (typeof rawFlag === 'string') {
      const normalized = rawFlag.trim().toLowerCase();
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
      }
      if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return true;
      }
      return true;
    }
    return Boolean(rawFlag);
  };

  if (enforceActivityDataFilter && actDataPollutantId && globalHeaders.length > 0) {
    const actDataRowsByGroup = new Map();
    globalRows.forEach(row => {
      if (row.pollutant_id === actDataPollutantId) {
        actDataRowsByGroup.set(row.group_id, row);
      }
    });

    groups.forEach(group => {
      const actDataRow = actDataRowsByGroup.get(group.id);

      if (!actDataRow) {
        inactiveActDataGroupIds.push(group.id);
        return;
      }

      const hasActData = globalHeaders.some(header => {
        const value = actDataRow[header];
        if (value === null || value === undefined) return false;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return false;
        return numeric !== 0;
      });

      if (hasActData) {
        activeActDataGroups.push(group);
        activeActDataGroupIds.push(group.id);
      } else {
        inactiveActDataGroupIds.push(group.id);
      }
    });

    if (activeActDataGroups.length === 0 && groups.length > 0) {
      supabaseDebugWarn('No groups reported Activity Data; reverting to full group list.');
      activeActDataGroups = [...groups];
      activeActDataGroupIds = activeActDataGroups.map(g => g.id);
      inactiveActDataGroupIds = [];
    }
  } else if (!enforceActivityDataFilter && metadataById) {
    const groupsWithActData = groups.filter(group => metadataHasActivity(metadataById.get(group.id)));
    if (groupsWithActData.length) {
      activeActDataGroups = groupsWithActData;
      activeActDataGroupIds = activeActDataGroups.map(g => g.id);
      const activeIdSet = new Set(activeActDataGroupIds);
      inactiveActDataGroupIds = groups
        .filter(group => !activeIdSet.has(group.id))
        .map(group => group.id);
    } else {
      activeActDataGroups = [...groups];
      activeActDataGroupIds = activeActDataGroups.map(g => g.id);
      inactiveActDataGroupIds = [];
    }
  } else {
    activeActDataGroups = [...groups];
    activeActDataGroupIds = activeActDataGroups.map(g => g.id);
    inactiveActDataGroupIds = [];
  }

  const allGroupEntry = groups.find(g => typeof g.group_title === 'string' && g.group_title.trim().toLowerCase() === 'all');
  if (allGroupEntry) {
    const allGroupId = allGroupEntry.id;
    activeActDataGroups = activeActDataGroups.filter(g => g.id !== allGroupId);
    activeActDataGroupIds = activeActDataGroupIds.filter(id => id !== allGroupId);
    if (!inactiveActDataGroupIds.includes(allGroupId)) {
      inactiveActDataGroupIds.push(allGroupId);
    }
  }

  const baseGroupsForDropdown = activeActDataGroups.length > 0 ? activeActDataGroups : groups;
  const groupsForDropdown = baseGroupsForDropdown.filter(g => {
    if (typeof g.group_title !== 'string') return true;
    return g.group_title.trim().toLowerCase() !== 'all';
  });
  allGroupsList = groupsForDropdown
    .map(g => ({
      id: g.id,
      name: g.group_title || `Group ${g.id}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (inactiveActDataGroupIds.length > 0) {
    const inactiveNames = inactiveActDataGroupIds
      .map(id => groups.find(g => g.id === id)?.group_title || `Group ${id}`)
      .filter(Boolean)
      .sort();
    window.groupsWithoutActData = inactiveNames;
    window.groupsWithoutActivityData = inactiveNames;
  } else {
    window.groupsWithoutActData = [];
    window.groupsWithoutActivityData = [];
  }

  return {
    pollutants: allPollutants,
    groups: allGroups,
    data: globalRows
  };
}

function triggerFullDatasetHydrated(metadata = {}) {
  hydrationListeners.forEach(listener => {
    try {
      listener(metadata);
    } catch (error) {
      console.error('Hydration listener failed:', error);
    }
  });
}

function onFullDatasetHydrated(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }
  hydrationListeners.add(listener);
  return () => hydrationListeners.delete(listener);
}

function applyHydratedDataset(dataset, source = 'shared-loader') {
  if (!dataset) return;
  const normalizedRows = dataset.rows || dataset.timeseries || dataset.data || [];
  if (!Array.isArray(normalizedRows) || normalizedRows.length === 0) {
    supabaseDebugWarn('Hydrated dataset missing rows; skipping update');
    return;
  }

  const result = applyDataset({
    pollutants: dataset.pollutants || [],
    groups: dataset.groups || [],
    rows: normalizedRows
  }, {
    enforceActivityDataFilter: true
  });

  hasFullDataset = true;
  latestDatasetSource = source;
  triggerFullDatasetHydrated({ source, dataset: result, timestamp: Date.now() });
}

function scheduleFullDatasetLoad(sharedLoader, reason = 'manual') {
  return triggerBubbleFullDatasetBootstrap(sharedLoader, reason);
}


/**
 * Fallback function for direct data loading (when shared loader fails)
 */
async function loadDataDirectly() {
  const client = ensureInitialized();
  if (!client) {
    throw new Error('Supabase client not available');
  }

  const batchStart = bubbleDataNow();
  bubbleDataInfoLog('Starting direct Supabase fetch for bubble chart');
  const timedQuery = (label, promise) => {
    const start = bubbleDataNow();
    bubbleDataInfoLog('Supabase query started', { label });
    return promise.then(response => {
      const duration = Number((bubbleDataNow() - start).toFixed(1));
      if (response?.error) {
        bubbleDataInfoLog('Supabase query failed', {
          label,
          durationMs: duration,
          message: response.error.message || String(response.error)
        });
      } else {
        bubbleDataInfoLog('Supabase query completed', {
          label,
          durationMs: duration,
          rows: Array.isArray(response?.data) ? response.data.length : 0
        });
      }
      return response;
    });
  };

  const [pollutantsResp, groupsResp, dataResp] = await Promise.all([
    timedQuery('NAEI_global_Pollutants', client.from('NAEI_global_Pollutants').select('*')),
    timedQuery('NAEI_global_t_Group', client.from('NAEI_global_t_Group').select('*')),
    timedQuery('NAEI_2023ds_t_Group_Data', client.from('NAEI_2023ds_t_Group_Data').select('*'))
  ]);

  if (pollutantsResp.error) throw pollutantsResp.error;
  if (groupsResp.error) throw groupsResp.error;
  if (dataResp.error) throw dataResp.error;

  const payload = {
    pollutants: pollutantsResp.data || [],
    groups: groupsResp.data || [],
    rows: dataResp.data || []
  };

  bubbleDataInfoLog('Direct Supabase fetch completed', {
    durationMs: Number((bubbleDataNow() - batchStart).toFixed(1)),
    summary: {
      pollutants: payload.pollutants.length,
      groups: payload.groups.length,
      rows: payload.rows.length
    }
  });

  return payload;
}

// Create the main export object for this module (defined after all functions)
try {
  window.supabaseModule = {
    get client() { return ensureInitialized(); },
    loadData,
    loadDataDirectly,
    trackAnalytics,
    getAvailableYears,
    getScatterData,
    getPollutantName,
    getPollutantUnit,
    getGroupName,
    getPollutantShortName,
    getGroupShortTitle,
    get allPollutants() { return allPollutants; },
    get allGroups() { return allGroups; },
    get allGroupsList() { return allGroupsList; },
    get actDataPollutantId() { return actDataPollutantId; },
    get activeActDataGroups() { return activeActDataGroups; },
    get activeActDataGroupIds() { return activeActDataGroupIds; },
    get inactiveActDataGroupIds() { return inactiveActDataGroupIds; },
    // Legacy getters maintained temporarily for backwards compatibility
    get activityDataId() { return actDataPollutantId; },
    get activeGroups() { return activeActDataGroups; },
    get activeGroupIds() { return activeActDataGroupIds; },
    get inactiveActivityGroupIds() { return inactiveActDataGroupIds; },
    get hasFullDataset() { return hasFullDataset; },
    get latestDatasetSource() { return latestDatasetSource; },
    scheduleFullDatasetLoad,
    onFullDatasetHydrated
  };
  supabaseDebugLog('module', 'supabaseModule for scatter chart initialized successfully');
} catch (error) {
  console.error('Failed to initialize supabaseModule for scatter chart:', error);
}