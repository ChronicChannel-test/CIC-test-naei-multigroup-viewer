/**
 * Main Application Module
 * Handles UI initialization, user interactions, and coordination between modules
 */

console.log('main.js loaded');

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Application state
let selectedYear = null;
let selectedPollutantId = null;
let chartRenderCallback = null; // Callback for when chart finishes rendering
let selectedGroupIds = [];
const MAX_GROUPS = 10;

/**
 * Initialize the application
 */
async function init() {
  console.log('init() function called');
  console.log('Body classes at start:', document.body.className);
  
  // Ensure loading class is set
  document.body.classList.add('loading');
  console.log('Loading class added, body classes now:', document.body.className);
  
  try {
    // Loading overlay removed - data pre-loaded via shared loader
    document.getElementById('mainContent').setAttribute('aria-hidden', 'true');
    document.body.classList.add('loading');

    // Wait for supabaseModule to be available
    let attempts = 0;
    const maxAttempts = 50;
    while (!window.supabaseModule && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.supabaseModule) {
      throw new Error('supabaseModule not available after waiting');
    }

    // Load data using supabaseModule
    await window.supabaseModule.loadData();

    // Create window data stores EXACTLY like linechart v2.3
    window.allPollutants = window.supabaseModule.allPollutants;
    window.allGroups = window.supabaseModule.allGroups;
    console.log('Created window.allGroups with', window.allGroups.length, 'groups');

    // Create allGroupsList EXACTLY like linechart setupSelectors function
    const groups = window.supabaseModule.allGroups || [];
    const groupNames = [...new Set(groups.map(g => g.group_title))]
      .filter(Boolean)
      .sort((a, b) => {
        if (a.toLowerCase() === 'all') return -1;
        if (b.toLowerCase() === 'all') return 1;
        return a.localeCompare(b);
      });
    window.allGroupsList = groupNames;
    console.log('Created allGroupsList with', groupNames.length, 'groups:', groupNames.slice(0, 5));

    // Setup UI
    setupYearSelector();
    setupPollutantSelector();
    setupGroupSelector();
    setupEventListeners();

    // Render initial view based on URL parameters or defaults
    await renderInitialView();

    // Finally, reveal the main content and draw the chart
    await revealMainContent();

    // Chart ready signal is now sent from revealMainContent after loading overlay fades

    // Track page load
    await window.supabaseModule.trackAnalytics('page_load', {
      app: 'scatter_chart'
    });

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    showNotification('Failed to load data. Please refresh the page.', 'error');
  }
}

/**
 * Remove loading state
 */
function removeLoadingState() {
  console.log('removeLoadingState() called, body classes before:', document.body.className);
  // Loading overlay removed - just update body class
  document.body.classList.remove('loading');
  console.log('Loading class removed, body classes now:', document.body.className);
  console.log('Loading state removed (no overlay to hide)');
}

/**
 * Fallback function to show content directly
 */
function showContentDirectly() {
  console.log('showContentDirectly() called - using fallback method');
  const mainContent = document.getElementById('mainContent');
  
  if (mainContent) {
    console.log('Showing main content directly...');
    mainContent.style.display = 'block';
    mainContent.removeAttribute('aria-hidden');
    mainContent.classList.add('loaded');
    
    // Loading overlay removed - skip hiding step
    
    // Make chart visible
    const chartDiv = document.querySelector('.chart-wrapper');
    if (chartDiv) {
      chartDiv.classList.add('visible');
    }
    
    console.log('Content shown directly');
  } else {
    console.error('Could not find mainContent element');
  }
}

/**
 * Reveal main content (no loading overlay to manage)
 */
async function revealMainContent() {
  console.log('revealMainContent() called');
  return new Promise(resolve => {
    const mainContent = document.getElementById('mainContent');
    const loadingOverlay = document.getElementById('loadingOverlay');

    console.log('mainContent element:', mainContent);

    if (!mainContent) {
      console.error('Missing mainContent element for reveal');
      resolve();
      return;
    }

    // Hide loading overlay
    if (loadingOverlay) {
      console.log('Hiding loading overlay...');
      loadingOverlay.style.display = 'none';
    }

    // Make content visible
    console.log('Making mainContent visible...');
    mainContent.style.display = 'block';
    mainContent.removeAttribute('aria-hidden');
    
    // Render the chart
    console.log('Drawing chart...');
    console.log('Pre-draw sanity:', { selectedYear, selectedPollutantId, groups: getSelectedGroups() });
    drawChart();
    
    // Wait for chart to render, then complete the loading process
    setTimeout(() => {
      console.log('Scatter chart transition starting...');
      
      // Start fade in of main content
      requestAnimationFrame(() => {
        mainContent.classList.add('loaded');
      });
      
      // Complete after transition
      setTimeout(() => {
        console.log('Scatter chart fully loaded');
        resolve();
      }, 400);
    }, 250); // Allow time for chart render
  });
}

/**
 * Auto-load with default selections
 */
/**
 * Render initial view based on URL parameters or defaults (matching linechart v2.3)
 */
async function renderInitialView() {
  return new Promise(resolve => {
    const params = parseUrlParameters();
    const pollutantSelect = document.getElementById('pollutantSelect');
    
    // Use a small timeout to allow the DOM to update with options
    setTimeout(() => {
      console.log('renderInitialView: params=', params);
      console.log('renderInitialView: pollutantSelect has', pollutantSelect.options.length, 'options');
      
      if (params.pollutantName) {
        const pollutant = window.supabaseModule.allPollutants.find(p => p.pollutant === params.pollutantName);
        if (pollutant) {
          selectedPollutantId = pollutant.id;
          pollutantSelect.value = String(pollutant.id);
          console.log('Set pollutant from URL to', params.pollutantName, 'ID:', selectedPollutantId);
        }
      } else {
        // Default to PM2.5 if no pollutant is in the URL
        const pm25 = window.supabaseModule.allPollutants.find(p => p.pollutant === 'PM2.5');
        console.log('Found PM2.5 pollutant:', pm25);
        if (pm25) {
          selectedPollutantId = pm25.id;
          pollutantSelect.value = String(pm25.id);
          console.log('Set default pollutant to PM2.5, ID:', selectedPollutantId, 'dropdown value:', pollutantSelect.value);
        }
      }

      // Clear existing group selectors and add new ones based on URL or defaults
      const groupContainer = document.getElementById('groupContainer');
      groupContainer.innerHTML = '';

      if (params.groupNames && params.groupNames.length > 0) {
        params.groupNames.forEach(name => addGroupSelector(name, false));
      } else {
        // Add default groups if none are in the URL
        const allGroups = window.allGroupsList || [];
        console.log('Adding default groups from', allGroups.length, 'available groups');
        
        // Find specific "Ecodesign Stove - Ready To Burn" group
        const ecodesignGroups = allGroups.filter(g => 
          g === 'Ecodesign Stove - Ready To Burn'
        );
        console.log('Found Ecodesign Stove - Ready To Burn group:', ecodesignGroups);
        
        // Find "Gas Boilers"  
        const gasBoilerGroups = allGroups.filter(g => 
          g.toLowerCase().includes('gas boilers')
        );
        console.log('Found Gas Boilers groups:', gasBoilerGroups);
        
        if (ecodesignGroups.length > 0) {
          console.log('Adding Ecodesign Stove Ready To Burn group:', ecodesignGroups[0]);
          addGroupSelector(ecodesignGroups[0], false);
        }
        
        if (gasBoilerGroups.length > 0) {
          console.log('Adding Gas Boilers group:', gasBoilerGroups[0]);
          addGroupSelector(gasBoilerGroups[0], false);
        }
        
        // If we didn't find the specific groups, add some fallbacks
        if (ecodesignGroups.length === 0 && gasBoilerGroups.length === 0 && allGroups.length > 0) {
          console.log('Adding fallback groups:', allGroups.slice(0, 2));
          addGroupSelector(allGroups[0], false);
          if (allGroups.length > 1) {
            addGroupSelector(allGroups[1], false);
          }
        }
      }

      // Set year from URL params or default to latest
      const yearSelect = document.getElementById('yearSelect');
      if (params.year && yearSelect.querySelector(`option[value="${params.year}"]`)) {
        yearSelect.value = String(params.year);
      } else {
        // Default to latest year (first option)
        const latestOption = yearSelect.options[1]; // Skip "Select year" placeholder
        if (latestOption) {
          yearSelect.value = latestOption.value;
        }
      }
      
      // Always set selectedYear from the dropdown value
      selectedYear = yearSelect.value ? parseInt(yearSelect.value) : null;
      console.log('Initial selectedYear:', selectedYear);
      
      // Refresh group dropdowns and buttons after adding default groups
      refreshGroupDropdowns();
      refreshButtons();
      
      resolve();
    }, 50);
  });
}

/**
 * Parse URL parameters (simplified version for scatter chart)
 */
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  const pollutantId = params.get('pollutant_id');
  const groupIds = params.get('group_ids')?.split(',').map(Number).filter(Boolean);
  const year = params.get('year');

  const pollutants = window.supabaseModule.allPollutants || [];
  const groups = window.supabaseModule.allGroups || [];

  let pollutantName = null;
  if (pollutantId) {
    const pollutant = pollutants.find(p => String(p.id) === String(pollutantId));
    if (pollutant) {
      pollutantName = pollutant.pollutant;
    }
  }

  let groupNames = [];
  if (groupIds && groupIds.length > 0) {
    groupNames = groupIds.map(id => {
      const group = groups.find(g => String(g.id) === String(id));
      return group ? group.group_title : null;
    }).filter(Boolean);
  }

  return {
    pollutantName,
    groupNames,
    year
  };
}

/**
 * Setup year selector
 */
function setupYearSelector() {
  const years = window.supabaseModule.getAvailableYears();
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
  const pollutants = window.supabaseModule.allPollutants
    .filter(p => p.id !== window.supabaseModule.activityDataId) // Exclude Activity Data
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

// Get selected groups from dropdown selectors (like linechart)
function getSelectedGroups(){ 
  const selects = document.querySelectorAll('#groupContainer select');
  console.log('getSelectedGroups: found', selects.length, 'select elements');
  
  const values = [...selects].map((s, i) => {
    console.log(`Select ${i}: value="${s.value}", options=${s.options.length}`);
    return s.value;
  }).filter(Boolean);
  
  console.log('getSelectedGroups returning:', values);
  return values;
}

// Add group selector dropdown (adapted from linechart)
function addGroupSelector(defaultValue = "", usePlaceholder = true){
  const groupName = (defaultValue && typeof defaultValue === 'object')
    ? defaultValue.group_title
    : defaultValue;
  const container = document.getElementById('groupContainer');
  const div = document.createElement('div');
  div.className = 'groupRow';

  // drag handle (like linechart)
  const dragHandle = document.createElement('span');
  dragHandle.className = 'dragHandle';
  dragHandle.textContent = '⠿';
  dragHandle.style.marginRight = '6px';
  
  // group control wrapper (keeps drag handle and select together)
  const controlWrap = document.createElement('div');
  controlWrap.className = 'group-control';

  // convert drag handle into an accessible button so it's keyboard-focusable
  const handleBtn = document.createElement('button');
  handleBtn.type = 'button';
  handleBtn.className = 'dragHandle';
  handleBtn.setAttribute('aria-label', 'Reorder group (use arrow keys)');
  handleBtn.title = 'Drag to reorder (or focus and use Arrow keys)';
  handleBtn.textContent = '⠿';
  handleBtn.style.marginRight = '6px';
  controlWrap.appendChild(handleBtn);

  // group select
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', 'Group selector');
  sel.name = 'groupSelector';
  if (usePlaceholder){
    const ph = new Option('Select group','');
    ph.disabled = true; ph.selected = true;
    sel.add(ph);
  }
  
  const allGroups = window.allGroupsList || [];
  console.log('addGroupSelector: total groups available:', allGroups.length);
  console.log('addGroupSelector: looking for groupName:', groupName);

  const selected = getSelectedGroups();
  allGroups.forEach(groupTitle => {
    if (!selected.includes(groupTitle) || groupTitle === groupName) {
      sel.add(new Option(groupTitle, groupTitle));
    }
  });
  
  console.log('addGroupSelector: options added, total options:', sel.options.length);
  
  if (groupName) {
    console.log('addGroupSelector: setting value to:', groupName);
    sel.value = groupName;
    console.log('addGroupSelector: value after setting:', sel.value);
    
    // Verify the option exists
    const optionExists = [...sel.options].some(opt => opt.value === groupName);
    console.log('addGroupSelector: option exists for groupName:', optionExists);
  }
  sel.addEventListener('change', () => { 
    refreshGroupDropdowns(); 
    refreshButtons();
    updateChart(); 
  });

  controlWrap.appendChild(sel);
  div.appendChild(controlWrap);

  container.appendChild(div);
  refreshGroupDropdowns();
  refreshButtons();
}

// Refresh group dropdown options (like linechart)
function refreshGroupDropdowns() {
  const allGroups = window.supabaseModule.allGroups || [];
  const allGroupNames = allGroups.map(g => g.group_title).sort();
  const selected = getSelectedGroups();
  
  document.querySelectorAll('#groupContainer select').forEach(select => {
    const currentValue = select.value;
    // Clear and rebuild options
    select.innerHTML = '';
    
    // Add placeholder
    const ph = new Option('Select group','');
    ph.disabled = true;
    if (!currentValue) ph.selected = true;
    select.add(ph);
    
    // Add available groups
    allGroupNames.forEach(groupTitle => {
      if (!selected.includes(groupTitle) || groupTitle === currentValue) {
        const option = new Option(groupTitle, groupTitle);
        if (groupTitle === currentValue) option.selected = true;
        select.add(option);
      }
    });
  });
}

// Add button management like linechart
function refreshButtons() {
  const container = document.getElementById('groupContainer');
  // Remove any existing Add/Remove buttons to rebuild cleanly
  container.querySelectorAll('.add-btn, .remove-btn').forEach(n => n.remove());

  const rows = container.querySelectorAll('.groupRow');

  // Add remove buttons only if there are 2 or more groups
  if (rows.length >= 2) {
    rows.forEach(row => {
      if (!row.querySelector('.remove-btn')) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn';
        removeBtn.innerHTML = '<span class="remove-icon">−</span> Remove Group';
        // make ARIA label include the current group name if available
        const sel = row.querySelector('select');
        const groupName = sel ? (sel.value || (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || '') : '';
        removeBtn.setAttribute('aria-label', groupName ? `Remove group ${groupName}` : 'Remove group');
        removeBtn.onclick = () => {
          row.remove();
          refreshButtons();
          refreshGroupDropdowns();
          updateChart();
        };
        // Append remove button as a sibling to the control wrapper
        row.appendChild(removeBtn);

        // Remove all existing checkboxes for group comparison
        const existingCheckboxes = row.querySelectorAll('.group-checkbox');
        existingCheckboxes.forEach(checkbox => checkbox.parentElement.remove());

        // Add a single checkbox labeled "Include in comparison statement"
        const comparisonCheckbox = document.createElement('label');
        comparisonCheckbox.style.marginLeft = '10px';
        comparisonCheckbox.innerHTML = '<input type="checkbox" class="group-checkbox" checked> Include in comparison statement';
        row.appendChild(comparisonCheckbox);
      }
    });
  }

  // Add "Add Group" button just below the last group box
  let addBtn = container.querySelector('.add-btn');
  if (!addBtn) {
    addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.innerHTML = '<span class="add-icon">+</span> Add Group';
    addBtn.onclick = () => addGroupSelector("", true);
    container.appendChild(addBtn);
  }

  // Disable button if 10 groups are present
  if (rows.length >= 10) {
    addBtn.disabled = true;
    addBtn.textContent = 'Maximum 10 groups';
  } else {
    addBtn.disabled = false;
    addBtn.innerHTML = '<span class="add-icon">+</span> Add Group';
  }
}

// Ensure checkboxes are only checked for two groups at once
function refreshCheckboxes() {
  const checkboxes = document.querySelectorAll('.group-checkbox');
  const checkedBoxes = Array.from(checkboxes).filter(checkbox => checkbox.checked);

  if (checkedBoxes.length > 2) {
    checkedBoxes.forEach((checkbox, index) => {
      if (index >= 2) {
        checkbox.checked = false;
      }
    });
  }
}

// Update checkbox behavior when adding a new group
function addGroup() {
  const container = document.getElementById('groupContainer');
  const newGroupRow = document.createElement('div');
  newGroupRow.className = 'groupRow';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'group-checkbox';
  checkbox.checked = false; // Default unchecked for new groups

  newGroupRow.appendChild(checkbox);
  container.appendChild(newGroupRow);

  refreshCheckboxes();
}

/**
 * Setup group selector with dropdown approach like linechart
 */
function setupGroupSelector() {
  const container = document.getElementById('groupContainer');
  container.innerHTML = '';
  
  // Add initial group selector
  addGroupSelector();
}

/**
 * Update chart when selections change
 */
function updateChart() {
  // This will be called automatically when groups change
  console.log('Chart update triggered');

  // Reset the color system to ensure consistent color assignments
  window.Colors.resetColorSystem();

  // Get selected groups and assign colors
  const selectedGroupNames = getSelectedGroups();
  const colors = selectedGroupNames.map(groupName => window.Colors.getColorForGroup(groupName));
  console.log('Assigned colors for groups:', colors);

  // Redraw the chart to reflect the new selections
  drawChart();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Year change
  document.getElementById('yearSelect').addEventListener('change', (e) => {
    selectedYear = e.target.value ? parseInt(e.target.value) : null;
    updateChart();
  });

  // Pollutant change
  document.getElementById('pollutantSelect').addEventListener('change', (e) => {
    selectedPollutantId = e.target.value ? parseInt(e.target.value) : null;
    updateChart();
  });

  // Share button
  document.getElementById('shareBtn').addEventListener('click', () => {
    window.ExportShare.showShareDialog();
  });

  // Download button
  document.getElementById('downloadBtn').addEventListener('click', () => {
    window.ExportShare.downloadChartPNG();
  });

  // Resize handler
  window.addEventListener('resize', debounce(() => {
    console.log('Window resized, redrawing chart...');
    drawChart();
  }, 250));
}

/**
 * Draw the scatter chart
 */
function drawChart() {
  console.log('drawChart() called');
  window.ChartRenderer.clearMessage();

  if (!selectedYear) {
    console.warn('No year selected');
    window.ChartRenderer.showMessage('Please select a year', 'warning');
    return;
  }

  if (!selectedPollutantId) {
    console.warn('No pollutant selected');
    window.ChartRenderer.showMessage('Please select a pollutant', 'warning');
    return;
  }

  // Get selected groups from dropdowns
  const selectedGroupNames = getSelectedGroups();
  console.log('Selected group names:', selectedGroupNames);
  
  if (selectedGroupNames.length === 0) {
    console.warn('No groups selected');
    window.ChartRenderer.showMessage('Please select at least one group', 'warning');
    return;
  }

  // Convert group names to IDs
  const allGroups = window.supabaseModule.allGroups || [];
  console.log('All groups available:', allGroups.length);
  
  const selectedGroupIds = selectedGroupNames.map(name => {
    const group = allGroups.find(g => g.group_title === name);
    console.log(`Looking for group "${name}":`, group ? 'found' : 'not found');
    return group ? group.id : null;
  }).filter(id => id !== null);

  console.log('Selected group IDs:', selectedGroupIds);

  if (selectedGroupIds.length === 0) {
    console.warn('No valid group IDs found');
    window.ChartRenderer.showMessage('Selected groups not found', 'warning');
    return;
  }

  // Reset colors for new chart
  window.Colors.resetColorSystem();

  console.log('Calling ChartRenderer.drawScatterChart with:', {
    year: selectedYear,
    pollutantId: selectedPollutantId,
    groupIds: selectedGroupIds
  });

  // Draw chart
  window.ChartRenderer.drawScatterChart(selectedYear, selectedPollutantId, selectedGroupIds);

  // Update the comparison statement now that data is ready
  const dataPoints = window.supabaseModule.getScatterData(selectedYear, selectedPollutantId, selectedGroupIds);
  if (dataPoints.length >= 2) {
    const group1 = dataPoints[0];
    const group2 = dataPoints[1];

    const higherPolluter = group1.pollutantValue > group2.pollutantValue ? group1 : group2;
    const lowerPolluter = group1.pollutantValue > group2.pollutantValue ? group2 : group1;

    const pollutionRatio = lowerPolluter.pollutantValue !== 0 ? higherPolluter.pollutantValue / lowerPolluter.pollutantValue : Infinity;
    const heatRatio = higherPolluter.activityData !== 0 ? lowerPolluter.activityData / higherPolluter.activityData : Infinity;

    const pollutantName = window.supabaseModule.getPollutantName(selectedPollutantId);

    const statement = `${higherPolluter.groupName} emits ${pollutionRatio.toFixed(1)} times more ${pollutantName} pollution than ${lowerPolluter.groupName}. ${lowerPolluter.groupName} provides ${heatRatio.toFixed(1)} times more heat.`;
    updateComparisonStatement(statement);
  } else {
    updateComparisonStatement("Select two groups to see a comparison.");
  }
  
  // Update URL
  updateURL();
  
  // Track chart draw event
  window.supabaseModule.trackAnalytics('scatter_chart_drawn', {
    year: selectedYear,
    pollutant: window.supabaseModule.getPollutantName(selectedPollutantId),
    group_count: selectedGroupIds.length
  });
}

function ensureComparisonDivExists() {
  let comparisonContainer = document.getElementById('comparisonContainer');
  if (!comparisonContainer) {
    comparisonContainer = document.createElement('div');
    comparisonContainer.id = 'comparisonContainer';
    comparisonContainer.style.textAlign = 'center';
    comparisonContainer.style.marginTop = '2px';
    
    const customLegend = document.getElementById('customLegend');
    if (customLegend) {
      customLegend.parentNode.insertBefore(comparisonContainer, customLegend.nextSibling);
    } else {
      console.error('customLegend element not found. Cannot append comparisonContainer.');
    }
  }

  let comparisonDiv = document.getElementById('comparisonDiv');
  if (!comparisonDiv) {
    comparisonDiv = document.createElement('div');
    comparisonDiv.id = 'comparisonDiv';
    comparisonDiv.className = 'comparison-statement';
    comparisonContainer.appendChild(comparisonDiv);
  }
  
  return comparisonDiv;
}

function updateComparisonStatement(statement) {
  const comparisonDiv = ensureComparisonDivExists();
  if (comparisonDiv) {
    comparisonDiv.textContent = statement;
    comparisonDiv.className = 'comparison-statement';
  }
}

/**
 * Show a notification message
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (e.g., 'error', 'success')
 */
function showNotification(message, type) {
  const container = document.querySelector('.notification-container') || document.createElement('div');
  if (!container.className) {
    container.className = 'notification-container';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  container.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
      if (!container.hasChildNodes()) {
        container.remove();
      }
    }, 300);
  }, 5000);
}

/**
 * Update URL with current parameters
 */
function updateURL() {
  const selectedGroupNames = getSelectedGroups();
  if (!selectedYear || !selectedPollutantId || selectedGroupNames.length === 0) {
    return;
  }

  // Convert group names to IDs for URL
  const allGroups = window.supabaseModule.allGroups || [];
  const selectedGroupIds = selectedGroupNames.map(name => {
    const group = allGroups.find(g => g.group_title === name);
    return group ? group.id : null;
  }).filter(id => id !== null);

  const query = `year=${selectedYear}&pollutant_id=${selectedPollutantId}&group_ids=${selectedGroupIds.join(',')}`;
  const newURL = window.location.pathname + '?' + query;
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

// Listen for parent window messages
// Listen for parent window messages (if needed for future features)  
window.addEventListener('message', (event) => {
  // Message handling can be added here for future features
  // Charts now handle their own loading completion
});

// Initialize when DOM is ready
console.log('Setting up init event listener, document.readyState:', document.readyState);
if (document.readyState === 'loading') {
  console.log('Document still loading, adding DOMContentLoaded listener');
  document.addEventListener('DOMContentLoaded', init);
} else {
  console.log('Document already loaded, calling init immediately');
  init();
}
