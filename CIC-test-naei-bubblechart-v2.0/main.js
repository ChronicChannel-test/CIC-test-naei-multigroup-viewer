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
let initialComparisonFlags = []; // Store comparison flags from URL for initial checkbox state
const MAX_GROUPS = 10;
let chartReadyNotified = false;

// Track parent height coordination so we avoid chatty postMessage loops.
const MIN_HEIGHT_DELTA = 8; // px difference required before re-sending height

let lastSentHeight = 0;
let lastKnownViewportWidth = 0;

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
  app: 'bubble_chart'
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
    const chartWrapper = document.querySelector('.chart-wrapper');
    if (chartWrapper) {
      chartWrapper.classList.add('visible');
    }

    const chartDiv = document.getElementById('chart_div');
    if (chartDiv) {
      chartDiv.classList.add('visible');
    }
    
    console.log('Content shown directly');
    notifyParentChartReady();
  } else {
    console.error('Could not find mainContent element');
  }
}

function sendContentHeightToParent(force = false) {
  try {
    if (window.parent && window.parent !== window) {
      const body = document.body;
      let measuredHeight = Math.max(
        body?.scrollHeight || 0,
        body?.offsetHeight || 0
      );

      if (!measuredHeight || measuredHeight < 300) {
        const mainContent = document.getElementById('mainContent');
        const contentHeight = Math.max(
          mainContent?.scrollHeight || 0,
          mainContent?.offsetHeight || 0
        );
        measuredHeight = Math.max(contentHeight, 1100);
        console.warn('Bubble chart content height below threshold; using fallback height:', measuredHeight);
      }

      if (!force && lastSentHeight && Math.abs(measuredHeight - lastSentHeight) < MIN_HEIGHT_DELTA) {
        return; // ignore insignificant updates to avoid resize thrash
      }

      lastSentHeight = measuredHeight;

      console.log('📐 Sending bubble chart height to parent:', measuredHeight + 'px');

      window.parent.postMessage({
        type: 'contentHeight',
        chart: 'bubble',
        height: measuredHeight
      }, '*');
    }
  } catch (error) {
    console.warn('Unable to send bubble chart height to parent:', error);
  }
}

function notifyParentChartReady() {
  if (chartReadyNotified) {
    sendContentHeightToParent();
    return;
  }

  chartReadyNotified = true;

  try {
    if (window.parent && window.parent !== window) {
      console.log('📤 Notifying parent that bubble chart is ready');
      window.parent.postMessage({
        type: 'chartReady',
        chart: 'bubble'
      }, '*');
      // Send initial height immediately after signalling readiness
      setTimeout(sendContentHeightToParent, 100);
    }
  } catch (error) {
    console.warn('Unable to notify parent window:', error);
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
      console.log('Bubble chart transition starting...');
      
      // Start fade in of main content
      requestAnimationFrame(() => {
        mainContent.classList.add('loaded');
      });
      
      // Complete after transition
      setTimeout(() => {
        console.log('Bubble chart fully loaded');
        notifyParentChartReady();
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
        // Store comparison flags from URL for use in refreshButtons
        initialComparisonFlags = params.comparisonFlags || [];
        params.groupNames.forEach(name => addGroupSelector(name, false));
      } else {
        // Clear comparison flags for default groups (will be set to checked by default)
        initialComparisonFlags = [];
        // Add default groups if none are in the URL
        const allGroups = window.allGroupsList || [];
        console.log('Adding default groups from', allGroups.length, 'available groups:', allGroups);
        
        // Find specific "Ecodesign Stove - Ready To Burn" group
        const ecodesignGroup = allGroups.find(g => 
          g === 'Ecodesign Stove - Ready To Burn'
        );
        console.log('Found Ecodesign Stove - Ready To Burn group:', ecodesignGroup);
        
        // Find "Gas Boilers"  
        const gasBoilerGroup = allGroups.find(g => 
          g.toLowerCase().includes('gas boiler')
        );
        console.log('Found Gas Boilers group:', gasBoilerGroup);
        
        // Always try to add both default groups
        if (ecodesignGroup) {
          console.log('Adding Ecodesign Stove Ready To Burn group:', ecodesignGroup);
          addGroupSelector(ecodesignGroup, false);
        } else {
          console.warn('Could not find Ecodesign Stove - Ready To Burn group');
        }
        
        if (gasBoilerGroup) {
          console.log('Adding Gas Boilers group:', gasBoilerGroup);
          addGroupSelector(gasBoilerGroup, false);
        } else {
          console.warn('Could not find Gas Boilers group');
        }
        
        // If we didn't find either specific group, add first 2 available groups
        if (!ecodesignGroup && !gasBoilerGroup && allGroups.length > 0) {
          console.log('Adding fallback groups:', allGroups.slice(0, 2));
          addGroupSelector(allGroups[0], false);
          if (allGroups.length > 1) {
            addGroupSelector(allGroups[1], false);
          }
        } else if (!ecodesignGroup && gasBoilerGroup && allGroups.length > 0) {
          // If we only found Gas Boilers, add first available group as well
          const firstGroup = allGroups[0];
          if (firstGroup !== gasBoilerGroup) {
            console.log('Adding first group as fallback:', firstGroup);
            addGroupSelector(firstGroup, false);
          }
        } else if (ecodesignGroup && !gasBoilerGroup && allGroups.length > 1) {
          // If we only found Ecodesign, add second available group as well
          const secondGroup = allGroups.find(g => g !== ecodesignGroup);
          if (secondGroup) {
            console.log('Adding second group as fallback:', secondGroup);
            addGroupSelector(secondGroup, false);
          }
        }
      }

      // Set year from URL params or default to latest
      const yearSelect = document.getElementById('yearSelect');
      const availableYears = window.supabaseModule.getAvailableYears() || [];
      const mostRecentYear = availableYears.length > 0 ? Math.max(...availableYears) : null;

      if (Number.isInteger(params.year) && yearSelect.querySelector(`option[value="${params.year}"]`)) {
        yearSelect.value = String(params.year);
        selectedYear = params.year;
      } else {
        // Default to most recent available year
        if (mostRecentYear) {
          yearSelect.value = String(mostRecentYear);
          selectedYear = mostRecentYear;
        } else {
          selectedYear = null;
        }
      }
      
      console.log('Initial selectedYear:', selectedYear, 'available years:', availableYears);
      
      // Refresh group dropdowns and buttons after adding default groups
      refreshGroupDropdowns();
      refreshButtons();
      
      resolve();
    }, 50);
  });
}

/**
 * Parse URL parameters (simplified version for scatter chart)
 * Read from parent window if embedded in iframe
 */
function parseUrlParameters() {
  // Try to get params from parent window if in iframe, otherwise use own window
  let searchParams;
  try {
    if (window.parent && window.parent !== window && window.parent.location.search) {
      searchParams = window.parent.location.search;
      console.log('Reading URL params from parent:', searchParams);
    } else {
      searchParams = window.location.search;
      console.log('Reading URL params from own window:', searchParams);
    }
  } catch (e) {
    // Cross-origin restriction, use own window
    searchParams = window.location.search;
    console.log('Cross-origin restriction, using own window params:', searchParams);
  }
  
  const params = new URLSearchParams(searchParams);
  
  // Check if this is the active chart - only parse params if chart=1 (bubble chart)
  const chartParam = params.get('chart');
  if (chartParam && chartParam !== '1') {
    console.log('URL is for chart', chartParam, 'not chart 1 (bubble). Using defaults.');
    // Return empty params so defaults will be used
    return {
      pollutantName: null,
      groupNames: [],
      comparisonFlags: [],
      year: null
    };
  }
  
  const pollutantId = params.get('pollutant_id');
  const groupIdsParam = params.get('group_ids')?.split(',') || [];
  const yearParamRaw = params.get('year');
  const yearParam = yearParamRaw ? parseInt(yearParamRaw, 10) : null;

  const pollutants = window.supabaseModule.allPollutants || [];
  const groups = window.supabaseModule.allGroups || [];
  const availableYears = window.supabaseModule.getAvailableYears() || [];

  let pollutantName = null;
  if (pollutantId) {
    const pollutant = pollutants.find(p => String(p.id) === String(pollutantId));
    if (pollutant) {
      pollutantName = pollutant.pollutant;
    }
  }

  // Parse group IDs and comparison flags (e.g., "20c" means group 20 with comparison checked)
  let groupNames = [];
  let comparisonFlags = []; // Track which groups should have comparison checkbox checked
  
  if (groupIdsParam && groupIdsParam.length > 0) {
    groupIdsParam.forEach(idStr => {
      const hasComparisonFlag = idStr.endsWith('c');
      const id = parseInt(hasComparisonFlag ? idStr.slice(0, -1) : idStr);
      
      if (id) {
        const group = groups.find(g => g.id === id);
        if (group) {
          groupNames.push(group.group_title);
          comparisonFlags.push(hasComparisonFlag);
        }
      }
    });
  }

  // Validate year against available years
  let year = null;
  if (availableYears.length > 0) {
    const mostRecentYear = Math.max(...availableYears);
    if (Number.isInteger(yearParam) && availableYears.includes(yearParam)) {
      // Year is valid
      year = yearParam;
    } else if (Number.isInteger(yearParam)) {
      // Year provided but invalid - use most recent available
      console.warn('Invalid year in URL: ' + yearParam + '. Using most recent year.');
      year = mostRecentYear;
    } else {
      // No year provided - use most recent
      year = mostRecentYear;
    }
  }

  return {
    pollutantName,
    groupNames,
    comparisonFlags,
    year
  };
}

/**
 * Setup year selector
 */
function setupYearSelector() {
  const years = window.supabaseModule.getAvailableYears();
  // Sort years in ascending order (smallest first, 2023 at bottom)
  const sortedYears = [...years].sort((a, b) => a - b);
  const select = document.getElementById('yearSelect');
  
  select.innerHTML = '<option value="">Select year</option>';
  sortedYears.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    select.appendChild(option);
  });

  // Default to most recent year (which will be the last in the sorted array)
  if (sortedYears.length > 0) {
    selectedYear = sortedYears[sortedYears.length - 1];
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
  div.draggable = true; // Make row draggable

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
  
  // Keyboard handlers for reordering when handleBtn is focused
  handleBtn.addEventListener('keydown', (e) => {
    try {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        let prev = div.previousElementSibling;
        while (prev && !prev.classList.contains('groupRow')) prev = prev.previousElementSibling;
        if (prev) {
          container.insertBefore(div, prev);
          refreshGroupDropdowns();
          refreshButtons();
          updateChart();
          // Move focus back to the handle for continued keyboard moves
          handleBtn.focus();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        let next = div.nextElementSibling;
        while (next && !next.classList.contains('groupRow')) next = next.nextElementSibling;
        if (next) {
          container.insertBefore(div, next.nextElementSibling);
          refreshGroupDropdowns();
          refreshButtons();
          updateChart();
          handleBtn.focus();
        }
      }
    } catch (err) {
      console.warn('Keyboard reorder failed', err);
    }
  });
  
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
  addDragAndDropHandlers(div); // Add drag-and-drop event listeners
  
  // Delay the refresh to avoid conflicts during initialization
  setTimeout(() => {
    refreshGroupDropdowns();
    refreshButtons();
    // alignComparisonHeader();
  }, 10);
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

  // Process all rows to add remove buttons and checkboxes
  rows.forEach(row => {
    // Store current checkbox state before removing (to preserve state when rebuilding)
    const existingCheckbox = row.querySelector('.comparison-checkbox');
    const wasChecked = existingCheckbox ? existingCheckbox.checked : false;
    
    // Remove all existing checkboxes and buttons to rebuild them cleanly
    const existingCheckboxes = row.querySelectorAll('.group-checkbox');
    existingCheckboxes.forEach(checkbox => checkbox.remove());
    const existingRemoveButtons = row.querySelectorAll('.remove-btn');
    existingRemoveButtons.forEach(btn => btn.remove());

    // Add remove button only if there are 2 or more groups
    if (rows.length >= 2) {
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
      row.appendChild(removeBtn);
    }
    
    // Comparison statement checkboxes disabled per requirements
    // if (rows.length >= 2) {
    //   const comparisonCheckbox = document.createElement('input');
    //   comparisonCheckbox.type = 'checkbox';
    //   comparisonCheckbox.className = 'group-checkbox comparison-checkbox';
    //   
    //   // Determine checked state
    //   const rowIndex = Array.from(rows).indexOf(row);
    //   
    //   // Priority: 1) Preserve existing state, 2) Use URL flags on initial load, 3) Default to unchecked
    //   if (existingCheckbox) {
    //     // Preserve the current state for existing rows
    //     comparisonCheckbox.checked = wasChecked;
    //   } else if (initialComparisonFlags.length > 0 && rowIndex < initialComparisonFlags.length) {
    //     // Use comparison flag from URL (on initial load only)
    //     comparisonCheckbox.checked = initialComparisonFlags[rowIndex];
    //   } else {
    //     // Default to unchecked for new groups
    //     comparisonCheckbox.checked = false;
    //   }
    //   
    //   comparisonCheckbox.style.width = '18px';
    //   comparisonCheckbox.style.height = '18px';
    //   comparisonCheckbox.style.marginLeft = '50px';
    //   comparisonCheckbox.title = 'Include in comparison statement';
    //   comparisonCheckbox.addEventListener('change', refreshCheckboxes);
    //   row.appendChild(comparisonCheckbox);
    // }
  });
  
  // Clear initialComparisonFlags after first use
  if (initialComparisonFlags.length > 0) {
    initialComparisonFlags = [];
  }
  
  // Align the comparison header with the checkboxes
  // alignComparisonHeader();
  
  // Apply checkbox limit logic (disable unchecked boxes if 2 are already checked)
  refreshCheckboxes();

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
  console.log('📋 refreshCheckboxes called');
  const checkboxes = document.querySelectorAll('.comparison-checkbox');
  const checkedBoxes = Array.from(checkboxes).filter(checkbox => checkbox.checked);

  // Limit to max 2 checked boxes
  if (checkedBoxes.length > 2) {
    // Uncheck boxes beyond the first 2
    checkedBoxes.forEach((checkbox, index) => {
      if (index >= 2) {
        checkbox.checked = false;
      }
    });
  }
  
  // Recalculate after limiting
  const finalCheckedBoxes = Array.from(checkboxes).filter(checkbox => checkbox.checked);
  
  // Disable unchecked boxes if already at limit (2 checked)
  checkboxes.forEach(checkbox => {
    if (!checkbox.checked && finalCheckedBoxes.length >= 2) {
      checkbox.disabled = true;
      checkbox.style.opacity = '0.5';
      checkbox.style.cursor = 'not-allowed';
    } else {
      checkbox.disabled = false;
      checkbox.style.opacity = '1';
      checkbox.style.cursor = 'pointer';
    }
  });
  
  // Update the comparison statement based on checked boxes count
  console.log(`📊 Checked boxes count: ${finalCheckedBoxes.length}`);
  drawChart();
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
  
  // Don't add initial group here - let renderInitialView handle defaults
  // addGroupSelector();
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

  // Download PNG button
  document.getElementById('downloadBtn').addEventListener('click', () => {
    window.ExportShare.downloadChartPNG();
  });

  // Download CSV button
  document.getElementById('downloadCSVBtn').addEventListener('click', () => {
    window.ExportShare.exportData('csv');
  });

  // Download Excel button
  document.getElementById('downloadXLSXBtn').addEventListener('click', () => {
    window.ExportShare.exportData('xlsx');
  });

  // Resize handler – only redraw when width changes to avoid loops with parent height updates
  lastKnownViewportWidth = window.innerWidth || lastKnownViewportWidth;
  window.addEventListener('resize', debounce(() => {
    const currentWidth = window.innerWidth || 0;
    if (currentWidth === lastKnownViewportWidth) {
      console.debug('📐 Height-only resize detected; skipping redraw to prevent postMessage loop');
      return;
    }

    lastKnownViewportWidth = currentWidth;
    console.log('📐 Width changed - redrawing chart');
    drawChart(true); // Pass skipHeightUpdate flag to prevent immediate update
    
    // After chart redraws and layout settles, check if height actually changed
    setTimeout(() => {
      const currentHeight = Math.max(
        document.body?.scrollHeight || 0,
        document.body?.offsetHeight || 0
      );
      if (lastSentHeight && Math.abs(currentHeight - lastSentHeight) >= MIN_HEIGHT_DELTA) {
        console.log('📐 Height changed after resize from', lastSentHeight, 'to', currentHeight, '- sending update');
        sendContentHeightToParent(true);
      }
    }, 200);
  }, 250));
}

/**
 * Draw the scatter chart
 * @param {boolean} skipHeightUpdate - If true, don't send height update to parent (for resize events)
 */
function drawChart(skipHeightUpdate = false) {
  console.log('drawChart() called', skipHeightUpdate ? '(skip height update)' : '');
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

  console.log('Calling ChartRenderer.drawBubbleChart with:', {
    year: selectedYear,
    pollutantId: selectedPollutantId,
    groupIds: selectedGroupIds
  });

  // Draw chart
  window.ChartRenderer.drawBubbleChart(selectedYear, selectedPollutantId, selectedGroupIds);

  // Update the comparison statement based on checked comparison checkboxes
  const checkedCheckboxes = document.querySelectorAll('.comparison-checkbox:checked');
  const checkedCount = checkedCheckboxes.length;
  
  console.log(`🔍 Checked comparison checkboxes: ${checkedCount}`);
  
  if (checkedCount >= 2) {
    const dataPoints = window.supabaseModule.getScatterData(selectedYear, selectedPollutantId, selectedGroupIds);
    const group1 = dataPoints[0];
    const group2 = dataPoints[1];

    const higherPolluter = group1.pollutantValue > group2.pollutantValue ? group1 : group2;
    const lowerPolluter = group1.pollutantValue > group2.pollutantValue ? group2 : group1;

    const pollutionRatio = lowerPolluter.pollutantValue !== 0 ? higherPolluter.pollutantValue / lowerPolluter.pollutantValue : Infinity;
    const heatRatio = higherPolluter.activityData !== 0 ? lowerPolluter.activityData / higherPolluter.activityData : Infinity;

    const pollutantName = window.supabaseModule.getPollutantName(selectedPollutantId);

    // Get display names for groups
    const higherPolluter_displayName = getGroupDisplayName(higherPolluter.groupName);
    const lowerPolluter_displayName = getGroupDisplayName(lowerPolluter.groupName);

    // Create enhanced comparison statement with arrows and calculated values
    const statement = {
      line1: `${higherPolluter_displayName} emit ${pollutionRatio.toFixed(1)} times more ${pollutantName} than ${lowerPolluter_displayName}`,
      line2: `yet produce around ${heatRatio.toFixed(1)} times less heat nationally`,
      pollutionRatio: pollutionRatio,
      heatRatio: heatRatio,
      pollutantName: pollutantName
    };
    updateComparisonStatement(statement);
  } else {
    // Hide comparison statement when less than 2 checkboxes checked
    hideComparisonStatement();
  }
  
  // Update URL
  updateURL();
  
  // Track chart draw event
  window.supabaseModule.trackAnalytics('bubble_chart_drawn', {
    year: selectedYear,
    pollutant: window.supabaseModule.getPollutantName(selectedPollutantId),
    group_count: selectedGroupIds.length
  });

  // Only send height update if not triggered by resize (prevents growing gap)
  if (!skipHeightUpdate) {
    setTimeout(sendContentHeightToParent, 150);
  }
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

// Get custom display name for comparison statements
function getGroupDisplayName(groupName) {
  const displayNames = {
    'Ecodesign Stove - Ready To Burn': 'Ecodesign stoves burning Ready to Burn wood',
    'Gas Boilers': 'gas boilers'
  };
  return displayNames[groupName] || groupName.toLowerCase();
}

function updateComparisonStatement(statement) {
  console.log('🔥 updateComparisonStatement called with:', statement);
  const comparisonDiv = ensureComparisonDivExists();
  if (comparisonDiv) {
    comparisonDiv.style.display = 'block'; // Make sure it's visible
    if (typeof statement === 'object' && statement.line1 && statement.line2) {
      // Responsive design using JavaScript-calculated sizes based on window width
      const windowWidth = window.innerWidth;
      console.log('🔧 Window width in updateComparisonStatement:', windowWidth); // Debug info
      
      // Responsive scaling - optimized breakpoints
      let baseScale;
      if (windowWidth <= 480) {
        baseScale = 0.5; // Mobile phones
      } else if (windowWidth <= 768) {
        baseScale = 0.65; // Tablets
      } else if (windowWidth <= 1024) {
        baseScale = 0.8; // Small laptops
      } else if (windowWidth <= 1440) {
        baseScale = 0.9; // Standard desktops
      } else {
        baseScale = 1.0; // Large screens
      }
      
      const triangleWidth = Math.floor(180 * baseScale);
      const triangleHeight = Math.floor(140 * baseScale);
      const triangleBorder = Math.floor(90 * baseScale);
      const triangleBorderHeight = Math.floor(140 * baseScale);
      const triangleTextSize = Math.max(Math.floor(18 * baseScale), 12); // Minimum 12px
      const centerTextSize = Math.max(Math.floor(26 * baseScale), 16); // Minimum 16px
      const containerPadding = Math.floor(25 * baseScale);
      const containerHeight = Math.floor(140 * baseScale);
      const centerPadding = Math.floor(30 * baseScale);
      
      console.log('Calculated sizes:', {
        triangleWidth, triangleHeight, triangleBorder, triangleTextSize, centerTextSize
      }); // Debug info
      
      comparisonDiv.innerHTML = `
        <div style="background: #FEAE00 !important; background-image: none !important; padding: ${containerPadding}px; margin: 0 auto; border-radius: 25px; display: flex; justify-content: space-between; align-items: center; min-height: ${containerHeight}px; box-sizing: border-box; width: calc(100% - 140px); position: relative; border: none; box-shadow: none;">
          
          <!-- Left Triangle (UP) -->
          <div style="position: relative; width: ${triangleWidth}px; height: ${triangleHeight}px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 0; height: 0; border-left: ${triangleBorder}px solid transparent; border-right: ${triangleBorder}px solid transparent; border-bottom: ${triangleBorderHeight}px solid #dc2626; position: relative;">
            </div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -25%); color: white; font-weight: bold; font-size: ${triangleTextSize}px; text-align: center; line-height: 1.2;">
              ${statement.pollutionRatio.toFixed(1)} x<br>${statement.pollutantName}
            </div>
          </div>

          <!-- Center Text -->
          <div style="flex: 1; text-align: center; color: white; font-weight: bold; font-size: ${centerTextSize}px; line-height: 1.4; padding: 0 ${centerPadding}px;">
            ${statement.line1}<br><br>${statement.line2}
          </div>

          <!-- Right Triangle (DOWN) -->
          <div style="position: relative; width: ${triangleWidth}px; height: ${triangleHeight}px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 0; height: 0; border-left: ${triangleBorder}px solid transparent; border-right: ${triangleBorder}px solid transparent; border-top: ${triangleBorderHeight}px solid #dc2626; position: relative;">
            </div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -75%); color: white; font-weight: bold; font-size: ${triangleTextSize}px; text-align: center; line-height: 1.2;">
              ${statement.heatRatio.toFixed(1)}x<br>less<br>heat
            </div>
          </div>

        </div>
      `;
    } else {
      // Simple format for fallback
      comparisonDiv.innerHTML = `
        <div style="background: #f97316; padding: 15px; margin: 15px auto; border-radius: 8px; text-align: center; color: white; font-weight: bold; max-width: 1000px;">
          ${statement}
        </div>
      `;
    }
    comparisonDiv.className = 'comparison-statement';
  }
}

/**
 * Hide the comparison statement
 */
function hideComparisonStatement() {
  console.log('🚫 hideComparisonStatement called');
  const comparisonDiv = document.getElementById('comparisonDiv');
  if (comparisonDiv) {
    console.log('✅ Found comparisonDiv, hiding it');
    comparisonDiv.style.display = 'none';
  } else {
    console.log('❌ comparisonDiv not found');
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
  const groupRows = document.querySelectorAll('.groupRow');
  
  const groupIdsWithFlags = selectedGroupNames.map((name, index) => {
    const group = allGroups.find(g => g.group_title === name);
    if (!group) return null;
    
    // Check if the corresponding checkbox is checked
    const row = groupRows[index];
    const checkbox = row?.querySelector('.comparison-checkbox');
    const isChecked = checkbox?.checked || false;
    
    // Add 'c' suffix if checkbox is checked
    return isChecked ? `${group.id}c` : `${group.id}`;
  }).filter(id => id !== null);

  // Build params array - use raw strings to avoid encoding commas
  const params = [
    `pollutant_id=${selectedPollutantId}`,
    `group_ids=${groupIdsWithFlags.join(',')}`,  // Comma NOT encoded
    `year=${selectedYear}`
  ];
  
  // Update iframe's own URL (for standalone use)
  const query = params.join('&');
  const newURL = window.location.pathname + '?' + query;
  window.history.replaceState({}, '', newURL);
  
  // Send message to parent to update its URL (for embedded use)
  // But ONLY if this is the active chart (chart=1 in parent URL)
  if (window.parent && window.parent !== window) {
    try {
      const parentParams = new URLSearchParams(window.parent.location.search);
      const chartParam = parentParams.get('chart');
      
      // Only send if chart=1 (bubble) or no chart param (default to bubble)
      if (!chartParam || chartParam === '1') {
        window.parent.postMessage({
          type: 'updateURL',
          params: params  // Send as array of raw strings
        }, '*');
        console.log('📤 Sent URL update to parent:', params);
      } else {
        console.log('🚫 Not active chart (chart=' + chartParam + '), not sending URL update');
      }
    } catch (e) {
      // Cross-origin restriction - send anyway (standalone mode)
      window.parent.postMessage({
        type: 'updateURL',
        params: params
      }, '*');
    }
  }
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

/* ---------------- Drag and drop handlers ---------------- */
function addDragAndDropHandlers(div){
  div.addEventListener('dragstart', e => {
    e.dataTransfer.setData('text/plain', '');
    div.classList.add('dragging');
  });
  div.addEventListener('dragend', () => div.classList.remove('dragging'));
  div.addEventListener('dragover', e => {
    e.preventDefault();
    const container = document.getElementById('groupContainer');
    const dragging = container.querySelector('.dragging');
    if (!dragging) return;
    const after = getDragAfterElement(container, e.clientY);
    const addBtn = container.querySelector('.add-btn');
    if (!after || after === addBtn) container.insertBefore(dragging, addBtn);
    else container.insertBefore(dragging, after);
  });
  div.addEventListener('drop', () => { 
    refreshGroupDropdowns(); 
    refreshButtons();
    updateChart(); 
  });
}

function getDragAfterElement(container, y){
  const draggable = [...container.querySelectorAll('.groupRow:not(.dragging)')];
  return draggable.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset: offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Listen for parent window messages (iframe coordination)
window.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') {
    return;
  }

  if (event.data.type === 'overlayHidden') {
    lastSentHeight = 0; // allow re-measurement after parent finishes layout work
    setTimeout(() => sendContentHeightToParent(true), 100);
  }

  if (event.data.type === 'requestHeight') {
    lastSentHeight = 0; // ensure we re-send the latest measurement on explicit request
    sendContentHeightToParent(true);
  }
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

// Align comparison header with checkboxes
function alignComparisonHeader() {
  const header = document.getElementById('comparisonHeader');
  const checkboxes = document.querySelectorAll('.comparison-checkbox');
  
  // Hide header if there are fewer than 2 groups
  const rows = document.querySelectorAll('.groupRow');
  console.log('alignComparisonHeader: rows.length =', rows.length, 'checkboxes.length =', checkboxes.length);
  
  if (!header) {
    console.log('alignComparisonHeader: header element not found');
    return;
  }
  
  if (rows.length < 2) {
    console.log('alignComparisonHeader: hiding header (rows < 2)');
    header.style.display = 'none';
    return;
  }
  
  // Only show and position header if we have checkboxes to align with
  if (checkboxes.length > 0) {
    console.log('alignComparisonHeader: showing and positioning header (rows >= 2, checkboxes exist)');
    header.style.display = 'block';
    
    const firstCheckbox = checkboxes[0];
    const containerRect = header.parentElement.getBoundingClientRect();
    
    // Calculate center position of all checkboxes
    let totalLeft = 0;
    checkboxes.forEach(checkbox => {
      const rect = checkbox.getBoundingClientRect();
      totalLeft += rect.left + (rect.width / 2); // Center of each checkbox
    });
    const averageCenterX = totalLeft / checkboxes.length;
    
    // Center the header horizontally with the average checkbox position
    const headerWidth = 80; // Approximate width of "Comparison Statement"
    const leftOffset = (averageCenterX - containerRect.left) - (headerWidth / 2);
    
    // Position header above first checkbox (moved up more)
    const firstCheckboxRect = firstCheckbox.getBoundingClientRect();
    const topOffset = firstCheckboxRect.top - containerRect.top - 45; // Increased from 35px to 45px
    
    console.log('alignComparisonHeader: positioning header at left:', leftOffset, 'top:', topOffset);
    header.style.left = leftOffset + 'px';
    header.style.top = topOffset + 'px';
  } else {
    console.log('alignComparisonHeader: checkboxes not found yet, hiding header temporarily');
    header.style.display = 'none';
  }
}
