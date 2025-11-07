/**
 * Shared Supabase Configuration
 * Used by all NAEI data viewer applications
 */

// Supabase project connection
const SUPABASE_URL = 'https://buqarqyqlugwaabuuyfy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cWFycXlxbHVnd2FhYnV1eWZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTczNDEsImV4cCI6MjA3Njg3MzM0MX0._zommN8QkzS0hY__N7KfuIaalKWG-PrSPq1BWg_BBjg';

/**
 * Initialize Supabase client
 * @returns {object} Supabase client instance or null if unavailable
 */
function initSupabaseClient() {
  if (window.supabase && window.supabase.createClient) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
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
