/**
 * Data Loader Module
 * Handles loading NAEI data from Supabase for the scatter chart viewer
 */

// Initialize Supabase client
const supabase = window.SupabaseConfig.initSupabaseClient();

// Global data storage
let allPollutants = [];
let allGroups = [];
let allData = [];
let pollutantUnits = {};
let activityDataId = null;

/**
 * Load all data from Supabase
 */
async function loadData() {
  console.log("Fetching data from Supabase...");

  try {
    // Fetch pollutants, groups, and the timeseries table separately
    const [pollutantsResp, groupsResp, dataResp] = await Promise.all([
      supabase.from('NAEI_global_Pollutants').select('*'),
      supabase.from('NAEI_global_t_Group').select('*'),
      supabase.from('NAEI_2023ds_t_Group_Data').select('*')
    ]);

    if (pollutantsResp.error) throw pollutantsResp.error;
    if (groupsResp.error) throw groupsResp.error;
    if (dataResp.error) throw dataResp.error;

    allPollutants = pollutantsResp.data || [];
    allGroups = groupsResp.data || [];
    allData = dataResp.data || [];

    // Build pollutant units map
    allPollutants.forEach(p => {
      if (p.pollutant && p["emission unit"]) {
        pollutantUnits[p.pollutant] = p["emission unit"];
      }
    });

    // Find Activity Data pollutant ID
    const activityDataPollutant = allPollutants.find(p => 
      p.pollutant && p.pollutant.toLowerCase() === 'activity data'
    );
    
    if (activityDataPollutant) {
      activityDataId = activityDataPollutant.id;
      console.log("Activity Data pollutant ID:", activityDataId);
    } else {
      console.warn("Activity Data not found in pollutants list");
    }

    console.log(`Loaded ${allPollutants.length} pollutants, ${allGroups.length} groups, ${allData.length} data rows`);
    
    return {
      pollutants: allPollutants,
      groups: allGroups,
      data: allData
    };
  } catch (error) {
    console.error('Error loading data:', error);
    throw error;
  }
}

/**
 * Get available years from the data
 * @returns {Array} Array of year numbers
 */
function getAvailableYears() {
  if (allData.length === 0) return [];
  
  // Get year columns from the data (f1970, f1971, etc.)
  const sampleRow = allData[0];
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
    const activityRow = allData.find(row => 
      row.pollutant_id === activityDataId && row.group_id === groupId
    );
    
    // Get pollutant data for this group
    const pollutantRow = allData.find(row => 
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
  const pollutantName = getPollutantName(pollutantId);
  return pollutantUnits[pollutantName] || '';
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

// Export data loader functions
window.DataLoader = {
  loadData,
  getAvailableYears,
  getScatterData,
  getPollutantName,
  getPollutantUnit,
  getGroupName,
  get allPollutants() { return allPollutants; },
  get allGroups() { return allGroups; },
  get activityDataId() { return activityDataId; }
};
