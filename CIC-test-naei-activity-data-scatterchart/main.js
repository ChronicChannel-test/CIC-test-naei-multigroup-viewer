/**
 * Main Application Module
 * Handles UI initialization, user interactions, and coordination between modules
 */

// Application state
let selectedYear = null;
let selectedPollutantId = null;
let selectedGroupIds = [];
const MAX_GROUPS = 10;

/**
 * Initialize the application
 */
async function init() {
  try {
    // Show loading overlay
    document.getElementById('loadingOverlay').style.display = 'flex';
    document.getElementById('mainContent').setAttribute('aria-hidden', 'true');

    // Load data
    await window.DataLoader.loadData();

    // Setup UI
    setupYearSelector();
    setupPollutantSelector();
    setupGroupSelector();
    setupEventListeners();

    // Check for URL parameters
    loadFromURLParameters();

    // Hide loading overlay
    document.getElementById('loadingOverlay').classList.add('hidden');
    setTimeout(() => {
      document.getElementById('loadingOverlay').style.display = 'none';
      document.getElementById('mainContent').setAttribute('aria-hidden', 'false');
    }, 300);

    // Track page load
    if (window.Analytics && supabase) {
      window.Analytics.trackAnalytics(supabase, 'page_load', {
        app: 'scatter_chart'
      });
    }

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    alert('Failed to load data. Please refresh the page.');
  }
}

/**
 * Setup year selector
 */
function setupYearSelector() {
  const years = window.DataLoader.getAvailableYears();
  const select = document.getElementById('yearSelect');
  
  select.innerHTML = '<option value="">Select year</option>';
  years.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    select.appendChild(option);
  });

  // Default to most recent year
  if (years.length > 0) {
    selectedYear = years[0];
    select.value = selectedYear;
  }
}

/**
 * Setup pollutant selector
 */
function setupPollutantSelector() {
  const pollutants = window.DataLoader.allPollutants
    .filter(p => p.id !== window.DataLoader.activityDataId) // Exclude Activity Data
    .sort((a, b) => a.pollutant.localeCompare(b.pollutant));
  
  const select = document.getElementById('pollutantSelect');
  select.innerHTML = '<option value="">Select pollutant</option>';
  
  pollutants.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.pollutant;
    select.appendChild(option);
  });
}

/**
 * Setup group selector with checkboxes
 */
function setupGroupSelector() {
  const groups = window.DataLoader.allGroups
    .sort((a, b) => a.group_title.localeCompare(b.group_title));
  
  const container = document.getElementById('groupContainer');
  container.innerHTML = '';
  
  groups.forEach(group => {
    const label = document.createElement('label');
    label.className = 'group-label';
    label.dataset.groupId = group.id;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'group-checkbox';
    checkbox.value = group.id;
    checkbox.id = `group_${group.id}`;
    
    checkbox.addEventListener('change', (e) => {
      handleGroupSelection(e.target);
    });
    
    const text = document.createTextNode(` ${group.group_title}`);
    
    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);
  });
}

/**
 * Handle group checkbox selection
 */
function handleGroupSelection(checkbox) {
  if (checkbox.checked) {
    if (selectedGroupIds.length >= MAX_GROUPS) {
      checkbox.checked = false;
      window.ChartRenderer.showMessage(`Maximum ${MAX_GROUPS} groups allowed`, 'warning');
      return;
    }
    selectedGroupIds.push(parseInt(checkbox.value));
  } else {
    selectedGroupIds = selectedGroupIds.filter(id => id !== parseInt(checkbox.value));
  }
  
  // Update disabled state of unchecked checkboxes
  updateGroupCheckboxes();
}

/**
 * Update group checkbox disabled states
 */
function updateGroupCheckboxes() {
  const checkboxes = document.querySelectorAll('.group-checkbox');
  const atLimit = selectedGroupIds.length >= MAX_GROUPS;
  
  checkboxes.forEach(checkbox => {
    const label = checkbox.parentElement;
    if (!checkbox.checked && atLimit) {
      checkbox.disabled = true;
      label.classList.add('disabled');
    } else {
      checkbox.disabled = false;
      label.classList.remove('disabled');
    }
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Year change
  document.getElementById('yearSelect').addEventListener('change', (e) => {
    selectedYear = e.target.value ? parseInt(e.target.value) : null;
    updateURL();
  });

  // Pollutant change
  document.getElementById('pollutantSelect').addEventListener('change', (e) => {
    selectedPollutantId = e.target.value ? parseInt(e.target.value) : null;
    updateURL();
  });

  // Draw button
  document.getElementById('drawBtn').addEventListener('click', () => {
    drawChart();
  });

  // Share button
  document.getElementById('shareBtn').addEventListener('click', () => {
    window.ExportShare.showShareDialog();
  });

  // Download button
  document.getElementById('downloadBtn').addEventListener('click', () => {
    window.ExportShare.downloadChartPNG();
  });
}

/**
 * Draw the scatter chart
 */
function drawChart() {
  window.ChartRenderer.clearMessage();

  if (!selectedYear) {
    window.ChartRenderer.showMessage('Please select a year', 'warning');
    return;
  }

  if (!selectedPollutantId) {
    window.ChartRenderer.showMessage('Please select a pollutant', 'warning');
    return;
  }

  if (selectedGroupIds.length === 0) {
    window.ChartRenderer.showMessage('Please select at least one group', 'warning');
    return;
  }

  // Reset colors for new chart
  window.Colors.resetColorSystem();

  // Draw chart
  window.ChartRenderer.drawScatterChart(selectedYear, selectedPollutantId, selectedGroupIds);
  
  // Update URL
  updateURL();
}

/**
 * Update URL with current parameters
 */
function updateURL() {
  if (!selectedYear || !selectedPollutantId || selectedGroupIds.length === 0) {
    return;
  }

  const params = new URLSearchParams();
  params.set('year', selectedYear);
  params.set('pollutant_id', selectedPollutantId);
  params.set('group_ids', selectedGroupIds.join(','));

  const newURL = window.location.pathname + '?' + params.toString();
  window.history.replaceState({}, '', newURL);
}

/**
 * Load chart from URL parameters
 */
function loadFromURLParameters() {
  const params = new URLSearchParams(window.location.search);
  
  const year = params.get('year');
  const pollutantId = params.get('pollutant_id');
  const groupIds = params.get('group_ids');

  if (year && pollutantId && groupIds) {
    selectedYear = parseInt(year);
    selectedPollutantId = parseInt(pollutantId);
    selectedGroupIds = groupIds.split(',').map(id => parseInt(id));

    // Update UI
    document.getElementById('yearSelect').value = selectedYear;
    document.getElementById('pollutantSelect').value = selectedPollutantId;
    
    // Check appropriate group checkboxes
    selectedGroupIds.forEach(groupId => {
      const checkbox = document.getElementById(`group_${groupId}`);
      if (checkbox) {
        checkbox.checked = true;
      }
    });
    
    updateGroupCheckboxes();

    // Draw chart automatically
    setTimeout(() => {
      drawChart();
    }, 500);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
