/**
 * Main Chart and UI Module
 * Handles chart rendering, UI interactions, group management, and initialization
 * v2.4 - Now uses shared color module
 */

// Global chart instance and state
let chart; // global chart instance
let seriesVisibility = [];
window.seriesVisibility = seriesVisibility; // Expose for export.js
let urlUpdateTimer = null; // Debounce timer for URL updates
let googleChartsReady = false;
let chartRenderCallback = null; // Callback for when chart finishes rendering
let initialLoadComplete = false; // Track if initial chart load is done (prevent resize redraw)

// Load Google Charts and set up callback
google.charts.load('current', {packages:['corechart']});
google.charts.setOnLoadCallback(() => {
  googleChartsReady = true;
  console.log('Google Charts loaded successfully for line chart');
});

// Build/version banner for diagnostics
(function(){
  try {
    const build = 'v2.4-embed-gate-2025-11-04T20:26Z';
    window.__LINECHART_BUILD__ = build;
    document.documentElement.setAttribute('data-linechart-build', build);
    console.log('🧩 Linechart build loaded: ' + build);
  } catch (e) { /* no-op */ }
})();

/**
 * Creates and displays a dismissible error notification.
 * @param {string} message - The error message to display.
 */
function showError(message) {
  try {
    // Create the notification element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-notification';
    errorDiv.textContent = message;

    // Create the close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.className = 'close-button';
    closeButton.onclick = () => {
      errorDiv.style.opacity = '0';
      setTimeout(() => {
        if (errorDiv.parentNode) {
          errorDiv.parentNode.removeChild(errorDiv);
        }
      }, 300); // Allow fade out transition to complete
    };

    errorDiv.appendChild(closeButton);

    // Add to the body
    document.body.appendChild(errorDiv);

    // Fade in the notification
    setTimeout(() => {
      errorDiv.style.opacity = '1';
    }, 10);

  } catch (e) {
    console.error("Failed to show error notification:", e);
    // Fallback to alert if the notification system fails
    alert(message);
  }
}

// Export configuration constants
const EXPORT_MIN_SCALE = 16;
const EXPORT_MAX_DIM = 16000;
const EXPORT_MAX_PIXELS = 100_000_000;

// Chart options
let smoothLines = true; // default to smooth (curved) lines
window.smoothLines = smoothLines; // Expose for export.js

// Listen for messages from parent
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'overlayHidden') {
    console.log('✅ Received overlayHidden message from parent - enabling resize handler');
    initialLoadComplete = true;
  } else if (event.data && event.data.type === 'resizeComplete') {
    console.log('✅ Parent confirmed resize to ' + event.data.height + 'px - waiting for reflow...');
    
    // Wait for browser to reflow the iframe before measuring dimensions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Force reflow by accessing dimensions
        const currentHeight = document.documentElement.offsetHeight;
        const currentWidth = document.documentElement.offsetWidth;
        console.log('📐 After reflow - iframe dimensions: ' + currentWidth + 'x' + currentHeight);
        
        // Now render the chart
        if (window.pendingRender) {
          window.pendingRender();
          window.pendingRender = null;
        }
      });
    });
  }
});

// ---- Helpers for selection readiness & notices ----
function selectionsReady() {
  try {
    const pollutant = document.getElementById('pollutantSelect')?.value;
    const startYear = +document.getElementById('startYear')?.value;
    const endYear = +document.getElementById('endYear')?.value;
    const groups = getSelectedGroups();
    return Boolean(pollutant && startYear && endYear && startYear < endYear && groups.length);
  } catch (e) {
    return false;
  }
}

function ensureNoticeContainer() {
  let el = document.getElementById('chartNotice');
  if (!el) {
    const wrapper = document.querySelector('.chart-wrapper') || document.body;
    el = document.createElement('div');
    el.id = 'chartNotice';
    el.style.display = 'none';
    el.style.margin = '6px 0 4px 0';
    el.style.color = '#b91c1c';
    el.style.fontSize = '14px';
    el.style.fontWeight = '600';
    wrapper.insertBefore(el, document.getElementById('chart_div'));
  }
  return el;
}

function showNotice(msg) {
  const el = ensureNoticeContainer();
  el.textContent = msg;
  el.style.display = 'block';
}

function hideNotice() {
  const el = ensureNoticeContainer();
  el.textContent = '';
  el.style.display = 'none';
}

/**
 * Compute a safe export scale that respects EXPORT_MAX_DIM and EXPORT_MAX_PIXELS.
 * origW/origH are the logical SVG/chart sizes in CSS pixels. desiredScale is
 * the requested scale (e.g. Math.max(devicePixelRatio, EXPORT_MIN_SCALE)).
 */
function computeSafeExportScale(origW, origH, desiredScale) {
  if (!origW || !origH || !isFinite(desiredScale) || desiredScale <= 0) return 1;
  // Max scale to keep each dimension under EXPORT_MAX_DIM
  const maxDimScale = Math.min(EXPORT_MAX_DIM / origW, EXPORT_MAX_DIM / origH);
  // Max scale to keep total pixels under EXPORT_MAX_PIXELS
  const maxAreaScale = Math.sqrt(EXPORT_MAX_PIXELS / (origW * origH));
  const allowed = Math.max(1, Math.min(desiredScale, maxDimScale, maxAreaScale));
  if (allowed < desiredScale) {
    console.warn('Export scale ' + desiredScale + ' reduced to ' + allowed + ' to avoid huge canvas (' + Math.round(origW*allowed) + 'x' + Math.round(origH*allowed) + ')');
    try {
      window.__export_debug = window.__export_debug || {};
      window.__export_debug.lastClamped = { origW, origH, desiredScale, allowed };
    } catch (e) {}
  }
  return allowed;
}

/* ---------------- Setup Functions ---------------- */
function setupSelectors(pollutants, groups){
  // ✅ Use pollutant list from Supabase loadData
  const sel = document.getElementById('pollutantSelect');
  sel.innerHTML = '<option value="">Select pollutant</option>';
  if (pollutants && pollutants.length) {
    const pollutantNames = [...new Set(pollutants.map(p => p.pollutant))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    pollutantNames.forEach(p => sel.add(new Option(p, p)));
  }

  // Ensure we have the groups list available from the global window var
  if (groups && groups.length) {
    const groupNames = [...new Set(groups.map(g => g.group_title))]
      .filter(Boolean)
      .sort((a, b) => {
        if (a.toLowerCase() === 'all') return -1;
        if (b.toLowerCase() === 'all') return 1;
        return a.localeCompare(b);
      });
    window.allGroupsList = groupNames;
  }


  // ✅ Use precomputed globalYears instead of header slice
  const years = window.globalYears || [];
  const startSel = document.getElementById('startYear');
  const endSel = document.getElementById('endYear');

  startSel.innerHTML = '';
  endSel.innerHTML = '';

  years.forEach(y => {
    startSel.add(new Option(y, y));
    endSel.add(new Option(y, y));
  });

  startSel.value = years[0] || '';
  endSel.value = years[years.length - 1] || '';

  sel.addEventListener('change', updateChart);
  startSel.addEventListener('change', () => {
    updateYearDropdowns();
    updateChart();
  });
  endSel.addEventListener('change', () => {
    updateYearDropdowns();
    updateChart();
  });

  // Group selectors will be added by the init() function after URL parameter processing
  // This prevents double group creation that causes visual jumping
 }

function updateYearDropdowns() {
  const startSel = document.getElementById('startYear');
  const endSel = document.getElementById('endYear');
  const allYears = (window.globalYears || []).map(y => parseInt(y));

  let currentStart = parseInt(startSel.value);
  let currentEnd = parseInt(endSel.value);

  // If the start year is greater than or equal to the end year, auto-correct it.
  if (currentStart >= currentEnd) {
    // Find the index of the current end year
    const endIdx = allYears.indexOf(currentEnd);
    // Set the start year to be one step before the end year, if possible
    if (endIdx > 0) {
      currentStart = allYears[endIdx - 1];
    } else {
      // If end year is the very first year, we can't go back.
      // This is an edge case. Let's just ensure start is not equal to end.
      // A better UX might be to adjust the end year forward instead.
      // For now, this prevents a crash.
      if (allYears.length > 1) {
        currentEnd = allYears[1];
      }
    }
    startSel.value = currentStart;
  }

  const startVal = startSel.value;
  const endVal = endSel.value;

  // Repopulate the start year dropdown: must be less than currentEnd
  startSel.innerHTML = '';
  allYears.forEach(year => {
    if (year < parseInt(endVal)) {
      startSel.add(new Option(year, year));
    }
  });
  startSel.value = startVal;

  // Repopulate the end year dropdown: must be greater than currentStart
  endSel.innerHTML = '';
  allYears.forEach(year => {
    if (year > parseInt(startVal)) {
      endSel.add(new Option(year, year));
    }
  });
  endSel.value = endVal;
}

function getSelectedGroups(){ return [...document.querySelectorAll('#groupContainer select')].map(s => s.value).filter(Boolean); }
function addGroupSelector(defaultValue = "", usePlaceholder = true){
  const groupName = (defaultValue && typeof defaultValue === 'object')
    ? defaultValue.group_title
    : defaultValue;
  const container = document.getElementById('groupContainer');
  const div = document.createElement('div');
  div.className = 'groupRow';
  div.draggable = true;

  // drag handle
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

  const selected = getSelectedGroups();
  allGroups.forEach(g => {
    if (!selected.includes(g) || g === groupName) sel.add(new Option(g,g));
  });
  if (groupName) sel.value = groupName;
  sel.addEventListener('change', () => { refreshGroupDropdowns(); updateChart(); });

  controlWrap.appendChild(sel);
  // append the control wrap first; remove button will be appended to row as a sibling
  div.appendChild(controlWrap);

  // keyboard handlers for reordering when handleBtn is focused
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
          // move focus back to the handle for continued keyboard moves
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

  container.appendChild(div);
  addDragAndDropHandlers(div);
  refreshButtons();
}

function refreshGroupDropdowns(){
  const selected = getSelectedGroups();
  const all = window.allGroupsList || [];


  document.querySelectorAll('#groupContainer select').forEach(select => {
    const current = select.value;
    Array.from(select.options).forEach(opt => { if (opt.value !== '') opt.remove(); });
    all.forEach(g => {
      if (!selected.includes(g) || g === current) {
        const option = new Option(g,g);
        if (g === current) option.selected = true;
        select.add(option);
      }
    });
  });
}

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
        removeBtn.setAttribute('aria-label', groupName ? 'Remove group ' + groupName : 'Remove group');
        removeBtn.onclick = () => {
          row.remove();
          refreshButtons();
          refreshGroupDropdowns();
          updateChart();
        };
        // Append remove button as a sibling to the control wrapper so it
        // sits inline on wide screens but drops underneath on small screens
        row.appendChild(removeBtn);
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
    addBtn.textContent = 'Max Groups = 10';
    addBtn.disabled = true;
  } else {
    addBtn.innerHTML = '<span class="add-icon">+</span> Add Group';
    addBtn.disabled = false;
  }
}

function calculateYearTicks(years, chartWidth) {
  // Deterministic tick selection: evenly sample years to avoid overlap and shifting
  if (!years || !years.length) return [];

  const uniqueYears = [...new Set(years.map(y => String(y)))];
  if (uniqueYears.length <= 1) return uniqueYears;

  // For small number of years, show all
  if (uniqueYears.length <= 10) return uniqueYears;

  const minSpacing = 60; // px between labels
  const maxLabels = Math.max(2, Math.floor(chartWidth / minSpacing));

  if (uniqueYears.length <= maxLabels) return uniqueYears;

  const step = Math.ceil(uniqueYears.length / maxLabels);
  const result = uniqueYears.filter((y, idx) => idx % step === 0);

  // Always include last year
  const lastYear = uniqueYears[uniqueYears.length - 1];
  if (result[result.length - 1] !== lastYear) result.push(lastYear);

  return result;
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
  div.addEventListener('drop', () => { refreshGroupDropdowns(); updateChart(); });
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

/**
 * Adds custom year labels to the X-axis of the chart.
 * This function is called after every chart draw/redraw.
 */
function addCustomXAxisLabels() {
  try {
    const chartContainer = document.getElementById('chart_div');
    const svg = chartContainer ? chartContainer.querySelector('svg') : null;
    if (!svg) {
      console.warn('[CustomYearTicks] SVG not found in chart_div');
      return;
    }
    if (!chart) {
      console.warn('[CustomYearTicks] Chart instance not found');
      return;
    }

    const chartLayout = chart.getChartLayoutInterface();
    if (!chartLayout || !chartLayout.getChartAreaBoundingBox) {
      console.warn('[CustomYearTicks] Chart layout not ready for custom labels. chartLayout:', chartLayout);
      return;
    }
    const chartArea = chartLayout.getChartAreaBoundingBox();
    const labelY = chartArea.top + chartArea.height + 15; // Position BELOW chart area, before "Year" label
    const ns = 'http://www.w3.org/2000/svg';

    const startYear = +document.getElementById('startYear').value;
    const endYear = +document.getElementById('endYear').value;
    const yearsAll = window.globalYears || [];
    const startIdx = yearsAll.indexOf(String(startYear));
    const endIdx = yearsAll.indexOf(String(endYear));
    if (startIdx === -1 || endIdx === -1) {
      console.warn('[CustomYearTicks] Invalid start/end year index');
      return;
    }
    const years = yearsAll.slice(startIdx, endIdx + 1);

    // Get the initial list of years to show from the tick calculator
    const chartWidth = chartArea.width;
    let labelsToShow = calculateYearTicks(years, chartWidth);

    // Refine the list of labels to prevent overlap near the end.
    const minSpacing = 40; // Minimum pixels between labels
    if (labelsToShow.length >= 2) {
      const lastYear = labelsToShow[labelsToShow.length - 1];
      const penultimateYear = labelsToShow[labelsToShow.length - 2];

      const lastYearIndex = years.indexOf(lastYear);
      const penultimateYearIndex = years.indexOf(penultimateYear);

      // Check if both years are valid and get their pixel locations
      if (lastYearIndex !== -1 && penultimateYearIndex !== -1) {
        const lastX = chartLayout.getXLocation(lastYearIndex);
        const penultimateX = chartLayout.getXLocation(penultimateYearIndex);
        console.log('[CustomYearTicks] lastX:', lastX, 'penultimateX:', penultimateX);

        // If the penultimate label is too close to the last one, remove it
        if ((lastX - penultimateX) < minSpacing) {
          labelsToShow.splice(labelsToShow.length - 2, 1);
        }
      }
    }

    // Remove previous custom year labels before drawing new ones (only if they exist)
    const existingLabels = svg.querySelectorAll('[data-custom-year], [data-custom-year-label], [data-custom-label-group]');
    if (existingLabels.length > 0) {
      existingLabels.forEach(el => el.remove());
    }
    
    // Hide ALL potential Google Charts "Year" labels more aggressively
    const allTexts = svg.querySelectorAll('text');
    allTexts.forEach(text => {
      const content = text.textContent.trim().toLowerCase();
      // Hide if it's "year" and not our custom label
      if (content === 'year' && !text.hasAttribute('data-custom-year-label')) {
        text.style.display = 'none';
        text.style.visibility = 'hidden';
        text.setAttribute('opacity', '0');
      }
    });

    // Create a group for all custom labels
    const unclippedGroup = document.createElementNS(ns, 'g');
    unclippedGroup.setAttribute('data-custom-label-group', 'true');
    unclippedGroup.setAttribute('clip-path', 'none'); // Ensure no clipping

    // Create and add the year labels
    labelsToShow.forEach(year => {
      const yearIndex = years.indexOf(year);
      if (yearIndex === -1) return;
      
      const x = chartLayout.getXLocation(yearIndex);
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.setAttribute('font-size', '12');
      text.setAttribute('fill', '#666');
      text.setAttribute('data-custom-year', 'true');
      text.textContent = year;
      unclippedGroup.appendChild(text);
    });

    
    // Trim white background rectangles BEFORE appending labels
    const bgRects = svg.querySelectorAll('rect[fill="#ffffff"], rect[fill="white"], rect[fill="rgb(255, 255, 255)"]');
    bgRects.forEach(rect => {
      const y = parseFloat(rect.getAttribute('y') || '0');
      const height = parseFloat(rect.getAttribute('height') || '0');
      const rectBottom = y + height;
      const chartBottom = chartArea.top + chartArea.height;
      
      // If rect extends below the chart area, trim it to the chart bottom
      if (rectBottom > chartBottom + 2) { // +2px tolerance
        const newHeight = Math.max(0, chartBottom - y);
        rect.setAttribute('height', newHeight.toString());
      }
    });
    
    // Append the group to SVG
    svg.appendChild(unclippedGroup);
    
    // Expand SVG height to accommodate labels (with extra padding)
    const finalRequiredHeight = yearLabelY + 15; // Extra 5px padding
    const currentHeight = parseFloat(svg.getAttribute('height') || '0');
    if (finalRequiredHeight > currentHeight) {
      svg.setAttribute('height', finalRequiredHeight.toString());
    }
    svg.style.overflow = 'visible'; // Ensure SVG doesn't clip
    
    // Also expand the container div
    const chartDiv = svg.parentElement;
    if (chartDiv) {
      chartDiv.style.height = finalRequiredHeight + 'px';
      chartDiv.style.overflow = 'visible';
    }
  } catch (e) {
    console.warn('[CustomYearTicks] Could not add custom year labels:', e);
  }
}


function updateChart() {
  // Wait for Google Charts to be ready
  if (!googleChartsReady) {
    console.log('Google Charts not ready yet for line chart, waiting...');
    google.charts.setOnLoadCallback(() => {
      googleChartsReady = true;
      updateChart();
    });
    return;
  }

  const pollutant = document.getElementById('pollutantSelect').value;
  const startYear = +document.getElementById('startYear').value;
  const endYear = +document.getElementById('endYear').value;
  const selectedGroups = getSelectedGroups();

  // If essential selections aren’t ready yet, retry briefly (handles race with URL parsing/DOM updates)
  if (!pollutant || !startYear || !endYear || !selectedGroups.length) {
    window.__updateRetryCount = (window.__updateRetryCount || 0) + 1;
    const missing = [];
    if (!pollutant) missing.push('pollutant');
    if (!startYear) missing.push('startYear');
    if (!endYear) missing.push('endYear');
    if (!selectedGroups.length) missing.push('groups');
    console.log('⏳ updateChart deferred (' + window.__updateRetryCount + ') – waiting for: ' + missing.join(', '));
    if (window.__updateRetryCount <= 20) {
      setTimeout(updateChart, 75);
      return;
    } else {
      console.warn('updateChart gave up waiting for selections; not drawing.');
      window.__updateRetryCount = 0;
      return;
    }
  }
  // Reset retry counter once ready
  window.__updateRetryCount = 0;

  // Update the URL with the new state (debounced)
  updateUrlFromChartState();

  // Track chart view analytics
  window.supabaseModule.trackAnalytics('chart_view', {
    pollutant: pollutant,
    start_year: startYear,
    end_year: endYear,
    groups: selectedGroups,
    groups_count: selectedGroups.length,
    year_range: endYear - startYear + 1
  });

  window.Colors.resetColorSystem();
  // Use the global year keys to determine which years to display
  const yearsAll = window.globalYears || [];
  const yearKeys = window.globalYearKeys || [];
  const startIdx = yearsAll.indexOf(String(startYear));
  const endIdx = yearsAll.indexOf(String(endYear));
  const years = yearsAll.slice(startIdx, endIdx + 1);
  const keysForYears = yearKeys.slice(startIdx, endIdx + 1);
  const colors = selectedGroups.map(g => window.Colors.getColorForGroup(g));

  // Build rows of data (year + series values). Use null for missing.
  const chartRows = years.map((y, rowIdx) => {
    const row = [y];
    const key = keysForYears[rowIdx]; // e.g. 'f2015'
    selectedGroups.forEach(g => {
      const dataRow = groupedData[pollutant]?.[g];
      const raw = dataRow ? dataRow[key] : null;
      const val = (raw === null || raw === undefined) ? null : parseFloat(raw);
      row.push(Number.isNaN(val) ? null : val);
    });
    return row;
  });

  // guard against empty data
  if (chartRows.length === 0) return;

  // --- Determine which groups actually have data ---
  const groupHasData = selectedGroups.map((g, i) => {
    return chartRows.some(row => typeof row[i + 1] === 'number');
  });

  // Get unit before creating DataTable (needed for tooltips)
  const unit = pollutantUnits[pollutant] || "";

  // Create DataTable explicitly to guarantee column types
  const dataTable = new google.visualization.DataTable();
  dataTable.addColumn('string', 'Year');           // year as string
  selectedGroups.forEach(g => {
    dataTable.addColumn('number', g);              // data column
    dataTable.addColumn({type: 'string', role: 'tooltip'}); // custom tooltip
  });
  
  // Add rows with custom tooltips for dynamic decimal precision
  chartRows.forEach(row => {
    const newRow = [row[0]]; // year
    for (let i = 1; i < row.length; i++) {
      const value = row[i];
      newRow.push(value); // actual value
      
      // Generate tooltip with dynamic precision
      if (value === null || value === undefined) {
        newRow.push(null);
      } else {
        const groupName = selectedGroups[i - 1];
        let formattedValue;
        
        // Use more decimals for very small values
        if (Math.abs(value) < 0.001 && value !== 0) {
          formattedValue = value.toFixed(9).replace(/\.?0+$/, ''); // Up to 9 decimals for very small values
        } else if (Math.abs(value) < 1 && value !== 0) {
          formattedValue = value.toFixed(6).replace(/\.?0+$/, ''); // Up to 6 decimals, remove trailing zeros
        } else {
          formattedValue = value.toFixed(3).replace(/\.?0+$/, ''); // 3 decimals for normal values
        }
        
        const tooltip = groupName + '\nYear: ' + row[0] + '\nValue: ' + formattedValue + (unit ? ' ' + unit : '');
        newRow.push(tooltip);
      }
    }
    dataTable.addRow(newRow);
  });

  const seriesOptions = {};
  selectedGroups.forEach((g, i) => {
    // Use the global seriesVisibility state to determine visibility
    // Ensure the array is initialized if this is the first run or group count changed
    if (seriesVisibility.length !== selectedGroups.length) {
      seriesVisibility = Array(selectedGroups.length).fill(true);
      window.seriesVisibility = seriesVisibility; // Update window reference
    }
    seriesOptions[i] = seriesVisibility[i]
      ? { color: colors[i], lineWidth: 3, pointSize: 4 }
      : { color: colors[i], lineWidth: 0, pointSize: 0 };
  });

  // Estimate left margin dynamically based on Y-axis label width
  const maxValue = Math.max(
    ...chartRows.flatMap(r => r.slice(1).filter(v => typeof v === "number"))
  );
  
  // Determine how Google Charts will format the label based on value magnitude
  let labelString;
  if (maxValue >= 100) {
    // Large values: Google Charts shows as integers or 1 decimal
    labelString = Math.round(maxValue).toString();
  } else if (maxValue >= 1) {
    // Medium values: shows 1-2 decimals
    labelString = maxValue.toFixed(1);
  } else if (maxValue >= 0.01) {
    // Small values: shows 2-3 decimals
    labelString = maxValue.toFixed(3);
  } else if (maxValue >= 0.0001) {
    // Very small values: Google Charts typically shows 6 significant figures
    labelString = maxValue.toFixed(6);
  } else {
    // Extremely small values: use scientific notation estimate
    labelString = maxValue.toExponential(2); // e.g., "1.23e-7"
  }
  
  const labelLength = labelString.length;
  // Dynamic left margin: scale based on label length
  // For short labels (1-3 chars): 60px base
  // For longer labels: add 6px per character beyond 3 (reduced from 7px)
  const baseMargin = 60;
  const extraChars = Math.max(0, labelLength - 3);
  const leftMargin = Math.min(140, baseMargin + (extraChars * 6)); // dynamic left padding

  // Set a fixed height for the chart container to prevent layout shifts
  const chartContainer = document.getElementById('chart_div');
  if (chartContainer) {
    chartContainer.style.minHeight = '500px';
  }

  const isMobile = window.innerWidth < 600;
  const options = {
    title: '',
    width: '100%',
    legend: 'none',
    animation: {
      duration: 100,
      easing: 'out',
      startup: true
    },
    chartArea: {
      width: isMobile ? '70%' : '85%',
      height: '80%',
      top: 20,
      left: leftMargin,
      right: 20,
      bottom: isMobile && window.innerHeight < window.innerWidth ? 80 : 60
    },
    hAxis: {
      title: 'Year',
      textPosition: 'none',
      titleTextStyle: { fontSize: 13, bold: true },
      gridlines: { color: '#e0e0e0' },
      baselineColor: '#666',
      slantedText: isMobile,
      slantedTextAngle: isMobile ? 90 : 0
    },
    vAxis: {
      title: 'Emissions' + (unit ? ' (' + unit + ')' : ''),
      viewWindow: { min: 0 },
      textStyle: { fontSize: 12 },
      titleTextStyle: {
        fontSize: isMobile && window.innerHeight < window.innerWidth ? 12 : 14,
        bold: true
      },
    },
    series: seriesOptions,
    curveType: smoothLines ? 'function' : 'none',
    lineWidth: 3,
    pointSize: 4,
  };
  

  // draw chart and show pollutant as visible page title
  chart = new google.visualization.LineChart(chartContainer);

  // Add a single 'ready' event listener to handle all post-draw actions.
  google.visualization.events.addListener(chart, 'ready', () => {
    // Add custom X-axis labels. This is the primary cause of layout changes.
    addCustomXAxisLabels();

    // After labels are added, the final height is known. Update parent iframe.
    if (window.parent && window.parent !== window) {
      const bodyHeight = document.body.scrollHeight;
      const buffer = 30; // Buffer for any small overflows
      const newHeight = Math.ceil(bodyHeight) + buffer;
      const currentHeight = window.innerHeight;
      console.log('📏 Final height calculation: body.scrollHeight=', bodyHeight, 'final=', newHeight);

      // Only send message if height has changed significantly
      if (Math.abs(newHeight - currentHeight) > 20) {
          console.log('📐 Final height update:', currentHeight, 'to', newHeight);
          window.parent.postMessage({ type: 'iframeHeight', chart: 'line', height: newHeight }, '*');
      }
    }

    // Make chart visible now that it's fully rendered with labels.
    chartContainer.classList.add('visible');

    // Notify that the chart has finished rendering (for loading management)
    if (chartRenderCallback) {
      console.log('Line chart finished rendering');
      chartRenderCallback();
      chartRenderCallback = null; // Clear callback after use
    }
  });


  // Draw the chart immediately.
  // The 'ready' event will handle all post-processing.
  const safeWidth = Math.max(chartContainer.offsetWidth || 0, 300);
  const safeHeight = Math.max(chartContainer.offsetHeight || 0, 200);

  options.width = safeWidth;
  options.height = safeHeight;

  chart.draw(dataTable, options);

  // update visible title on page
  const titleEl = document.getElementById('chartTitle');
  titleEl.textContent = pollutant + (unit ? " (" + unit + ")" : "");

  // build custom legend (interactive)
  const legendDiv = document.getElementById('customLegend');
  legendDiv.innerHTML = '';

  // Ensure visibility array is correctly sized before building the legend
  if (seriesVisibility.length !== selectedGroups.length) {
    seriesVisibility = Array(selectedGroups.length).fill(true);
    window.seriesVisibility = seriesVisibility; // Update window reference
  }

  selectedGroups.forEach((g, i) => {
    const item = document.createElement('span');
    const dot = document.createElement('span');
    dot.style.display = 'inline-block';
    dot.style.width = '12px';
    dot.style.height = '12px';
    dot.style.borderRadius = '50%';
    dot.style.backgroundColor = colors[i];
    item.appendChild(dot);

    const labelText = document.createTextNode(g + (groupHasData[i] ? '' : ' (No data available)'));
    item.appendChild(labelText);

    // Fade if no data, or if the series is toggled off
    item.style.opacity = (!groupHasData[i] || !seriesVisibility[i]) ? '0.4' : '1';
    if (!groupHasData[i]) {
      item.title = 'No data available';
    }

    // Toggle visibility only if data exists
    if (groupHasData[i]) {
      item.addEventListener('click', () => {
        // Toggle the visibility state for the clicked series
        seriesVisibility[i] = !seriesVisibility[i];
        window.seriesVisibility = seriesVisibility; // Update window reference
        // Trigger a full chart update to redraw everything correctly
        updateChart();
      });
    }

    legendDiv.appendChild(item);
  });

  // ensure controls reflect available choices
  refreshGroupDropdowns();
  refreshButtons();
}

// Backward compatibility: some older code paths may still call drawChart()
// Ensure it simply delegates to the modern updateChart() with readiness guards
function drawChart() {
  try {
    return updateChart();
  } catch (e) {
    console.error('drawChart fallback failed:', e);
  }
}


// Track last resize dimensions to avoid redundant redraws
let lastResizeWidth = window.innerWidth;

window.addEventListener('resize', () => {
  // Don't trigger chart redraws during initial load
  if (!initialLoadComplete) {
    console.log('Resize event ignored during initial load');
    return;
  }
  
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(() => {
    const currentWidth = window.innerWidth;
    
    const widthChanged = Math.abs(currentWidth - lastResizeWidth) > 10;
    
    // Only redraw on width changes
    if (widthChanged) {
      console.log('Width changed from', lastResizeWidth, 'to', currentWidth, '- redrawing');
      lastResizeWidth = currentWidth;
      updateChart();
      return;
    }
  }, 300); // Increased debounce to 300ms for smoother resizing
});

async function renderInitialView() {
  return new Promise(resolve => {
    const params = parseUrlParameters();
    const pollutantSelect = document.getElementById('pollutantSelect');
    
    // Use a small timeout to allow the DOM to update with the options from setupSelectors
    setTimeout(() => {
      if (params.pollutantName) {
        pollutantSelect.value = params.pollutantName;
      } else {
        // Default to PM2.5 if no pollutant is in the URL
        if ([...pollutantSelect.options].some(o => o.value === 'PM2.5')) {
          pollutantSelect.value = 'PM2.5';
        }
      }

      // Clear existing group selectors and add new ones based on URL
      const groupContainer = document.getElementById('groupContainer');
      groupContainer.innerHTML = ''; // Clear any default selectors

      if (params.groupNames && params.groupNames.length > 0) {
        params.groupNames.forEach(name => addGroupSelector(name, false));
      } else {
        // Add default groups if none are in the URL
        addGroupSelector('All', false);
      }

      const startYearSelect = document.getElementById('startYear');
      const endYearSelect = document.getElementById('endYear');
      
      // Set year values from URL params (already validated in parseUrlParameters)
      if (params.startYear && startYearSelect.querySelector('option[value="' + params.startYear + '"]')) {
        startYearSelect.value = params.startYear;
      }
      if (params.endYear && endYearSelect.querySelector('option[value="' + params.endYear + '"]')) {
        endYearSelect.value = params.endYear;
      }
      
      updateYearDropdowns();
      
      // Don't call updateChart here; revealMainContent will do it.
      resolve();
    }, 50);
  });
}

async function revealMainContent() {
  return new Promise(resolve => {
    const mainContent = document.getElementById('mainContent');
    
    // Make content visible and add 'loaded' class
    mainContent.style.display = 'block';
    mainContent.removeAttribute('aria-hidden');
    mainContent.classList.add('loaded');
    
    // Defer the first chart draw until the DOM is fully painted
    requestAnimationFrame(() => {
      // Additional small delay to ensure layout is stable
      setTimeout(() => {
        if (selectionsReady()) {
          console.log('✅ Selections ready – rendering initial chart');
          updateChart();
        } else {
          console.warn('⚠️ Selections not ready for initial render');
        }

        // Send chartReady message to parent
        if (window.parent && window.parent !== window) {
          console.log('📤 Sending chartReady message to parent...');
          window.parent.postMessage({ type: 'chartReady', chart: 'line' }, '*');
        }
        
        // Wait for parent to hide overlay before enabling resize handler
        console.log('⏳ Waiting for overlay to be hidden before enabling resize handler...');
        resolve();
      }, 50); // 50ms delay
    });
  });
}



/* ---------------- URL Parameters and Initialization ---------------- */
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  const pollutantId = params.get('pollutant_id');
  const groupIds = params.get('group_ids')?.split(',').map(Number).filter(Boolean);
  const startYearParam = params.get('start_year');
  const endYearParam = params.get('end_year');

  const pollutants = window.allPollutantsData || window.allPollutants || [];
  const groups = window.allGroupsData || window.allGroups || [];
  const availableYears = window.globalYears || [];

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

  // Validate years against available years
  let startYear = null;
  let endYear = null;

  if (availableYears.length > 0) {
    // Check if provided years are valid
    const isStartYearValid = startYearParam && availableYears.includes(startYearParam);
    const isEndYearValid = endYearParam && availableYears.includes(endYearParam);
    
    if (isStartYearValid && isEndYearValid) {
      // Both years valid - check if start < end
      const startIdx = availableYears.indexOf(startYearParam);
      const endIdx = availableYears.indexOf(endYearParam);
      
      if (startIdx < endIdx) {
        // Valid range
        startYear = startYearParam;
        endYear = endYearParam;
      } else {
        // Invalid range - use defaults
        console.warn('Invalid year range in URL: start=' + startYearParam + ', end=' + endYearParam + '. Using defaults.');
        startYear = availableYears[0];
        endYear = availableYears[availableYears.length - 1];
      }
    } else if (isStartYearValid) {
      // Only start year valid
      startYear = startYearParam;
      // Find a valid end year after the start
      const startIdx = availableYears.indexOf(startYearParam);
      endYear = availableYears[availableYears.length - 1];
      console.warn('Invalid end year in URL: ' + endYearParam + '. Using ' + endYear + '.');
    } else if (isEndYearValid) {
      // Only end year valid
      endYear = endYearParam;
      // Find a valid start year before the end
      startYear = availableYears[0];
      console.warn('Invalid start year in URL: ' + startYearParam + '. Using ' + startYear + '.');
    } else if (startYearParam || endYearParam) {
      // Years provided but both invalid
      console.warn('Invalid years in URL: start=' + startYearParam + ', end=' + endYearParam + '. Using defaults.');
      startYear = availableYears[0];
      endYear = availableYears[availableYears.length - 1];
    }
    // If no years provided, leave as null to use dropdown defaults
  }

  return {
    pollutantName,
    groupNames,
    startYear,
    endYear
  };
}

/**
 * Update URL with current chart state (debounced)
 */
function updateUrlFromChartState() {
  // Ensure the data needed for ID lookups is available.
  const pollutants = window.allPollutantsData || window.allPollutants || [];
  const groups = window.allGroupsData || window.allGroups || [];
  if (!pollutants.length || !groups.length) {
    console.log("URL update skipped: lookup data not yet available.");
    return;
  }

  clearTimeout(urlUpdateTimer);
  urlUpdateTimer = setTimeout(() => {
    try {
      const pollutantName = document.getElementById('pollutantSelect').value;
      const startYear = document.getElementById('startYear').value;
      const endYear = document.getElementById('endYear').value;
      const groupNames = getSelectedGroups();

      if (!pollutantName || !startYear || !endYear || groupNames.length === 0) {
        return; // Not enough info to create a valid URL
      }

      // Find pollutant ID
      const pollutant = pollutants.find(p => p.pollutant === pollutantName);
      const pollutantId = pollutant ? pollutant.id : null;

      // Find group IDs
      const groupIds = groupNames.map(name => {
        const group = groups.find(g => g.group_title === name);
        return group ? group.id : null;
      }).filter(id => id !== null);

      if (!pollutantId || groupIds.length !== groupNames.length) {
        console.warn("Could not map all names to IDs for URL update.");
        return;
      }

      if (parseInt(startYear) >= parseInt(endYear)) {
        console.warn('URL update skipped: Invalid year range (start=' + startYear + ', end=' + endYear + ').');
        return;
      }

      const queryParts = [
        'pollutant_id=' + encodeURIComponent(pollutantId),
        'group_ids=' + groupIds.join(','),
        'start_year=' + encodeURIComponent(startYear),
        'end_year=' + encodeURIComponent(endYear)
      ];
      
      const newUrl = window.location.pathname + '?' + queryParts.join('&');
      
      window.history.replaceState({ path: newUrl }, '', newUrl);

    } catch (error) {
      console.error("Failed to update URL from chart state:", error);
    }
  }, 400); // 400ms debounce delay
}

/**
 * Setup event listeners for interactive controls
 */
function setupEventListeners() {
  // Smoothing toggle button
  const toggleSmoothBtn = document.getElementById('toggleSmoothBtn');
  if (toggleSmoothBtn) {
    toggleSmoothBtn.addEventListener('click', () => {
      smoothLines = !smoothLines;
      window.smoothLines = smoothLines; // Keep window.smoothLines in sync
      toggleSmoothBtn.textContent = smoothLines ? '🚫 Disable Smoothing' : '✅ Enable Smoothing';
      updateChart();
    });
  }

  // CSV download button
  const downloadCSVBtn = document.getElementById('downloadCSVBtn');
  if (downloadCSVBtn) {
    downloadCSVBtn.addEventListener('click', () => exportData('csv'));
  }

  // Excel download button
  const downloadXLSXBtn = document.getElementById('downloadXLSXBtn');
  if (downloadXLSXBtn) {
    downloadXLSXBtn.addEventListener('click', () => exportData('xlsx'));
  }
}

/**
 * Main initialization function.
 * This is the entry point for the application.
 */
async function init() {
  try {
    // Wait for supabaseModule to be available (with timeout)
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds total
    while ((!window.supabaseModule || !window.supabaseModule.loadData) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.supabaseModule || !window.supabaseModule.loadData) {
      throw new Error('supabaseModule not available after waiting. Check console for loading errors.');
    }
    
    console.log('supabaseModule found, proceeding with initialization...');
    
    // First, load all necessary data from Supabase
    const { pollutants, groups, yearKeys, pollutantUnits, groupedData } = await window.supabaseModule.loadData();

    // Store data on the window object for global access
    window.allPollutants = pollutants;
    window.allGroups = groups;
    window.globalYearKeys = yearKeys;
    window.globalYears = yearKeys.map(key => key.substring(1));
    window.pollutantUnits = pollutantUnits;
    window.groupedData = groupedData;
    
    // Then, set up the UI selectors with the loaded data
    setupSelectors(pollutants, groups);

    // Load group information table
    await window.supabaseModule.loadGroupInfo();

    // Set up event listeners for buttons
    setupEventListeners();
    setupShareButton();

    // Then, render the initial view based on URL parameters or defaults
    await renderInitialView();

    // Finally, reveal the main content and draw the chart
    await revealMainContent();
    
    // Chart ready signal is now sent from revealMainContent after loading overlay fades

  } catch (error) {
    console.error("Initialization failed:", error);
    // Use the new non-blocking error notification
    showError('Error loading line chart: ' + error.message + '. Please check the console and refresh the page.');
  }
}

// Add the chart ready message when the chart is fully loaded
function notifyChartReady() {
  try {
    // Add a small delay to ensure the chart is fully rendered
    setTimeout(() => {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ 
          type: 'chartReady', 
          chart: 'line',
          timestamp: new Date().toISOString()
        }, '*');
      }
      
      // Re-enable animations for future updates
      if (chart) {
        chart.setOptions({
          animation: {
            duration: 1000,
            easing: 'out',
            startup: false
          }
        });
      }
    }, 300); // 300ms delay to ensure rendering is complete
  } catch (error) {
    console.error('Error in notifyChartReady:', error);
  }
}


// Listen for parent window messages
window.addEventListener('message', (event) => {
  // Message handling can be added here for future features
  // Charts now handle their own loading completion
});

// Initialise on DOM ready
document.addEventListener('DOMContentLoaded', init);