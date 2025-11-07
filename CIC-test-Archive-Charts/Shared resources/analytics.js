/**
 * Shared Analytics Module
 * Privacy-friendly analytics tracking for NAEI data viewers
 * Used by all NAEI viewer applications
 */

// Analytics tracking variables
let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
let userFingerprint = null;
let userCountry = null;

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
 * @param {object} supabaseClient - Supabase client instance
 * @param {string} eventName - Type of event to track
 * @param {Object} details - Additional event data
 */
async function trackAnalytics(supabaseClient, eventName, details = {}) {
  // Check for analytics opt-out flag in URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('analytics') === 'off') {
    console.log('Analytics is turned off via URL parameter. Skipping event:', eventName);
    return; // Do not track if analytics=off is in the URL
  }

  if (!supabaseClient) {
    console.warn('Supabase client unavailable; analytics events will be skipped.');
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

  const { error } = await supabaseClient
    .from('analytics_events')
    .insert([analyticsData]);

  if (error && !error.message?.includes('relation "analytics_events" does not exist')) {
    console.warn('Analytics tracking failed:', error);
  }
}

/**
 * Get session ID for this browsing session
 * @returns {string} Session ID
 */
function getSessionId() {
  return sessionId;
}

// Export analytics functions
window.Analytics = {
  trackAnalytics,
  getUserCountry,
  generateUserFingerprint,
  getSessionId
};
