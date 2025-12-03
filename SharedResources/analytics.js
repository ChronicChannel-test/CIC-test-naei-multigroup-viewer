/**
 * Lightweight site-wide analytics helper.
 * Tracks only page views and high-value interactions.
 */
(function () {
  'use strict';

  const TABLE_NAME = 'site_events';
  const SESSION_KEY = 'cic_site_session_id';
  const RESERVED_FIELDS = new Set(['label', 'event_label', 'pageSlug', 'page_slug']);
  const MAX_QUEUE_LENGTH = 25;
  const FLUSH_DELAY_MS = 2000;

  const searchParams = buildSearchParams();
  const debugEnabled = ['debug', 'debugLogs', 'analyticsDebug', 'logs']
    .some(flag => searchParams.has(flag));
  const analyticsDisabled = searchParams.get('analytics') === 'off';
  const logDebug = debugEnabled ? console.log.bind(console, '[Analytics]') : () => {};

  const eventQueue = [];
  let flushTimer = null;
  let pendingFlush = null;
  let cachedEndpoint = null;
  let cachedKey = null;
  let autoPageDrawnSent = false;
  let heartbeatTimer = null;

  const state = {
    sessionId: loadSessionId(),
    pageSlug: resolvePageSlug(),
    defaults: {}
  };

  function runSoon(callback) {
    if (typeof callback !== 'function') {
      return;
    }
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(callback);
    } else {
      Promise.resolve().then(callback);
    }
  }

  /** Configure defaults before first event. */
  function configure(options = {}) {
    if (!options || typeof options !== 'object') {
      return;
    }
    if (typeof options.pageSlug === 'string' && options.pageSlug.trim()) {
      state.pageSlug = sanitizeSlug(options.pageSlug);
    }
    if (options.defaults && typeof options.defaults === 'object') {
      state.defaults = {
        ...state.defaults,
        ...options.defaults
      };
    }
  }

  configure(window.__SITE_ANALYTICS_PRESET__);

  function buildSearchParams() {
    try {
      return new URLSearchParams(window.location.search || '');
    } catch (error) {
      return new URLSearchParams('');
    }
  }

  function loadSessionId() {
    try {
      const existing = window.sessionStorage.getItem(SESSION_KEY);
      if (existing) {
        return existing;
      }
      const nextId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, nextId);
      return nextId;
    } catch (error) {
      return `sess_${Date.now().toString(36)}`;
    }
  }

  function sanitizeSlug(slug) {
    if (!slug || typeof slug !== 'string') {
      return resolvePageSlug();
    }
    const trimmed = slug.trim();
    if (!trimmed) {
      return resolvePageSlug();
    }
    if (trimmed.startsWith('http')) {
      try {
        return new URL(trimmed).pathname || '/';
      } catch (error) {
        return resolvePageSlug();
      }
    }
    if (!trimmed.startsWith('/')) {
      return `/${trimmed}`;
    }
    return trimmed.replace(/\/+/g, '/');
  }

  function resolvePageSlug() {
    const bodySlug = (document.body && document.body.dataset && document.body.dataset.pageSlug) || '';
    if (bodySlug) {
      return sanitizeSlug(bodySlug);
    }
    try {
      return window.location.pathname || '/';
    } catch (error) {
      return '/';
    }
  }

  function getUserCountry() {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const locale = navigator.language || 'en';
      const timezoneCountryMap = {
        'Europe/London': 'GB',
        'America/New_York': 'US',
        'America/Chicago': 'US',
        'America/Denver': 'US',
        'America/Los_Angeles': 'US',
        'Europe/Paris': 'FR',
        'Europe/Berlin': 'DE',
        'Europe/Rome': 'IT',
        'Europe/Madrid': 'ES',
        'Asia/Tokyo': 'JP',
        'Asia/Shanghai': 'CN',
        'Asia/Kolkata': 'IN',
        'Australia/Sydney': 'AU',
        'Australia/Melbourne': 'AU',
        'America/Toronto': 'CA',
        'America/Vancouver': 'CA'
      };
      return timezoneCountryMap[timezone] || (locale.split('-')[1] || 'Unknown');
    } catch (error) {
      return 'Unknown';
    }
  }

  function buildViewportInfo() {
    try {
      const screenInfo = `${window.screen.width}x${window.screen.height}`;
      const viewportInfo = `${window.innerWidth}x${window.innerHeight}`;
      return { screen: screenInfo, viewport: viewportInfo };
    } catch (error) {
      return { screen: null, viewport: null };
    }
  }

  function sanitizeEventData(meta) {
    if (!meta || typeof meta !== 'object') {
      return null;
    }
    const clean = {};
    Object.keys(meta).forEach(key => {
      if (RESERVED_FIELDS.has(key)) {
        return;
      }
      const value = meta[key];
      if (value === undefined || typeof value === 'function') {
        return;
      }
      clean[key] = value;
    });
    if (!Object.keys(clean).length) {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(clean, (_, value) => {
        if (typeof value === 'function') {
          return undefined;
        }
        if (typeof value === 'bigint') {
          return Number(value);
        }
        return value;
      }));
    } catch (error) {
      return null;
    }
  }

  function buildRecord(eventType, meta = {}) {
    if (!eventType || analyticsDisabled) {
      return null;
    }
    const now = new Date().toISOString();
    const pageSlug = sanitizeSlug(meta.pageSlug || state.pageSlug);
    const data = sanitizeEventData({ ...state.defaults, ...meta, client_timestamp: now });
    const label = meta.label || meta.event_label || null;
    return {
      session_id: state.sessionId,
      page_slug: pageSlug,
      event_type: eventType,
      event_label: label,
      country: getUserCountry(),
      page_url: window.location ? window.location.href : null,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      event_data: data
    };
  }

  function queueEvent(record) {
    if (!record) {
      return false;
    }
    if (eventQueue.length >= MAX_QUEUE_LENGTH) {
      eventQueue.shift();
    }
    eventQueue.push(record);
    logDebug('Queued analytics event:', record.event_type, record.event_label, record.page_slug);
    scheduleFlush();
    return true;
  }

  function scheduleFlush() {
    if (flushTimer || eventQueue.length === 0) {
      return;
    }
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flushQueue();
    }, FLUSH_DELAY_MS);
  }

  function resolveSupabaseCredentials() {
    if (cachedEndpoint && cachedKey) {
      return { endpoint: cachedEndpoint, key: cachedKey };
    }
    const runtimeConfig = window.SupabaseConfig || {};
    const envConfig = window.__NAEI_SUPABASE_CONFIG || window.__NAEI_SUPABASE_CONFIG__ || {};
    const url = runtimeConfig.SUPABASE_URL || runtimeConfig.url || envConfig.url || envConfig.SUPABASE_URL || null;
    const key = runtimeConfig.SUPABASE_KEY || runtimeConfig.key || envConfig.key || envConfig.SUPABASE_KEY || null;
    if (!url || !key) {
      return null;
    }
    cachedEndpoint = `${url.replace(/\/$/, '')}/rest/v1/${TABLE_NAME}`;
    cachedKey = key;
    return { endpoint: cachedEndpoint, key: cachedKey };
  }

  function flushQueue(options = {}) {
    if (!eventQueue.length || analyticsDisabled) {
      return Promise.resolve(false);
    }
    if (pendingFlush) {
      return pendingFlush;
    }
    const credentials = resolveSupabaseCredentials();
    if (!credentials) {
      // Try again once credentials load.
      scheduleFlush();
      return Promise.resolve(false);
    }
    const payload = eventQueue.splice(0, eventQueue.length);
    const requestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: credentials.key,
        Authorization: `Bearer ${credentials.key}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload),
      keepalive: Boolean(options.keepalive)
    };

    pendingFlush = fetch(credentials.endpoint, requestInit)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Analytics request failed: ${response.status}`);
        }
        logDebug('Flushed analytics batch:', payload.length);
      })
      .catch(error => {
        console.warn('Analytics flush failed:', error);
        // Requeue on failure (dropping oldest if needed)
        payload.forEach(record => queueEvent(record));
      })
      .finally(() => {
        pendingFlush = null;
      });

    return pendingFlush;
  }

  function trackPageDrawn(meta = {}) {
    if (window.__SITE_ANALYTICS_DISABLE_AUTO_PAGEVIEW__) {
      return Promise.resolve(false);
    }
    const viewport = buildViewportInfo();
    const record = buildRecord('page_drawn', {
      ...meta,
      pageSlug: meta.pageSlug,
      screen_size: viewport.screen,
      viewport_size: viewport.viewport
    });
    return Promise.resolve(queueEvent(record));
  }

  function trackInteraction(label, meta = {}) {
    const record = buildRecord('interaction', {
      ...meta,
      label: label || 'interaction'
    });
    return Promise.resolve(queueEvent(record));
  }

  async function legacyTrackAnalytics(_client, eventName, details = {}) {
    if (eventName === 'page_load' || eventName === 'page_view' || eventName === 'page_drawn') {
      return trackPageDrawn(details);
    }
    return trackInteraction(eventName, details);
  }

  function autoTrackPageDrawn() {
    if (analyticsDisabled || window.__SITE_ANALYTICS_DISABLE_AUTO_PAGEVIEW__) {
      return;
    }
    if (autoPageDrawnSent) {
      return;
    }
    const fire = () => {
      if (autoPageDrawnSent) {
        return;
      }
      autoPageDrawnSent = true;
      trackPageDrawn();
      scheduleHeartbeat();
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      runSoon(fire);
    } else {
      document.addEventListener('DOMContentLoaded', fire, { once: true });
    }
  }

  function scheduleHeartbeat() {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = window.setTimeout(() => {
      heartbeatTimer = null;
      trackInteraction('page_seen', {
        dwell_seconds: 15
      });
    }, 15000);
  }

  function exposeApi() {
    const api = {
      configure,
      trackPageDrawn,
      trackPageView: trackPageDrawn,
      trackInteraction,
      flush: flushQueue,
      getSessionId: () => state.sessionId,
      getUserCountry,
      isEnabled: () => !analyticsDisabled
    };

    window.SiteAnalytics = api;
    window.Analytics = {
      trackAnalytics: legacyTrackAnalytics,
      getUserCountry,
      getSessionId: () => state.sessionId,
      trackPageDrawn,
      trackPageView: trackPageDrawn,
      trackInteraction
    };
  }

  function registerLifecycleHooks() {
    window.addEventListener('online', () => {
      flushQueue();
    });
    window.addEventListener('beforeunload', () => {
      flushQueue({ keepalive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushQueue({ keepalive: true });
      }
    });
  }

  exposeApi();
  registerLifecycleHooks();
  autoTrackPageDrawn();
})();
