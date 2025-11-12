/**
 * Shared Supabase Configuration
 * Used by all NAEI data viewer applications
 */

// Supabase project connection
const SUPABASE_URL = 'https://buqarqyqlugwaabuuyfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cWFycXlxbHVnd2FhYnV1eWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTczNDEsImV4cCI6MjA3Njg3MzM0MX0._zommN8QkzS0hY__N7KfuIaalKWG-PrSPq1BWg_BBjg';
const SUPABASE_STORAGE_KEY_BASE = 'sb-buqarqyqlugwaabuuyfy-auth-token';

function buildScopedStorageKey() {
  try {
    const pathname = (window.location && window.location.pathname) || '';
    const slug = pathname
      .split('/')
      .filter(Boolean)
      .join('-')
      .replace(/[^a-z0-9-]/gi, '-')
      .replace(/-{2,}/g, '-')
      .toLowerCase() || 'root';
    return `${SUPABASE_STORAGE_KEY_BASE}::${slug}`;
  } catch (error) {
    console.warn('Unable to build scoped Supabase storage key, falling back to base key:', error);
    return SUPABASE_STORAGE_KEY_BASE;
  }
}

/**
 * Initialize Supabase client
 * @returns {object} Supabase client instance or null if unavailable
 */
function initSupabaseClient() {
  if (window.supabase && window.supabase.createClient) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storageKey: buildScopedStorageKey()
      }
    });
  }
  console.error('Supabase library not loaded');
  return null;
}

// Export configuration
window.SupabaseConfig = {
  SUPABASE_URL,
  SUPABASE_KEY,
  initSupabaseClient
};
