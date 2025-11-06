/**
 * Data Loader Module (DEPRECATED)
 * This module is kept for compatibility but functionality has been moved to supabase.js
 * The scatter chart now uses window.supabaseModule for all data operations
 */

// For backwards compatibility, create a wrapper that delegates to supabaseModule
window.DataLoader = {
  async loadData() {
    return await window.supabaseModule.loadData();
  },
  
  getAvailableYears() {
    return window.supabaseModule.getAvailableYears();
  },
  
  getScatterData(year, pollutantId, groupIds) {
    return window.supabaseModule.getScatterData(year, pollutantId, groupIds);
  },
  
  getPollutantName(pollutantId) {
    return window.supabaseModule.getPollutantName(pollutantId);
  },
  
  getPollutantUnit(pollutantId) {
    return window.supabaseModule.getPollutantUnit(pollutantId);
  },
  
  getGroupName(groupId) {
    return window.supabaseModule.getGroupName(groupId);
  },
  
  get allPollutants() { 
    return window.supabaseModule.allPollutants; 
  },
  
  get allGroups() { 
    return window.supabaseModule.allGroups; 
  },
  
  get activityDataId() { 
    return window.supabaseModule.activityDataId; 
  }
};
