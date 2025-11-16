/**
 * Main Chart and UI Module
 * Handles chart rendering, UI interactions, group management, and initialization
 * v2.4 - Now uses shared color module
 */

const lineUrlParams = new URLSearchParams(window.location.search || '');
const lineDebugLoggingEnabled = ['debug', 'logs', 'debugLogs'].some(flag => lineUrlParams.has(flag));
window.__NAEI_DEBUG__ = window.__NAEI_DEBUG__ || lineDebugLoggingEnabled;

if (!lineDebugLoggingEnabled) {
  console.log = () => {};
  console.info = () => {};
  if (console.debug) {
    console.debug = () => {};
  }
}

// Global chart instance and state
let chart; // global chart instance
let seriesVisibility = [];
window.seriesVisibility = seriesVisibility; // Expose for export.js
let urlUpdateTimer = null; // Debounce timer for URL updates
let googleChartsReady = false;
let googleChartsLoadPromise = null;
let initialLoadComplete = false; // Track if initial chart load is done (prevent resize redraw)
let initFailureNotified = false; // Ensure we only notify parent once on failure

// Provide a minimal fallback palette if the shared Colors module fails to load.
if (!window.Colors) {
  console.warn('Colors module not found in line chart – using fallback palette.');
  const fallbackPalette = [
    '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
    '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
  ];
  const colorAssignments = new Map();
  let nextColorIndex = 0;

  window.Colors = {
    resetColorSystem() {
      colorAssignments.clear();
      nextColorIndex = 0;
    },
    getColorForGroup(groupName) {
      const key = groupName || `group-${nextColorIndex}`;
      if (colorAssignments.has(key)) {
        return colorAssignments.get(key);
      }
      const chosen = fallbackPalette[nextColorIndex % fallbackPalette.length];
      colorAssignments.set(key, chosen);
      nextColorIndex += 1;
      return chosen;
    }
  };
}

function loadGoogleChartsLibrary() {
  if (googleChartsReady && window.google?.visualization?.DataTable) {
    return Promise.resolve();
  }

  if (googleChartsLoadPromise) {
    return googleChartsLoadPromise;
  }

  googleChartsLoadPromise = new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (timer, poller) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (poller) {
        clearInterval(poller);
      }
    };

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup(timeoutId, pollInterval);
        reject(new Error('Timed out waiting for Google Charts to load.'));
      }
    }, 15000);

    const tryResolve = () => {
      if (settled) {
        return;
      }
      if (!window.google?.visualization?.DataTable) {
        return; // Wait for visualization namespace to be ready
      }
      settled = true;
      cleanup(timeoutId, pollInterval);
      googleChartsReady = true;
      resolve();
    };

    const handleFailure = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup(timeoutId, pollInterval);
      const normalized = error instanceof Error ? error : new Error(String(error));
      reject(normalized);
    };

    const startLoad = () => {
      try {
        if (!window.google?.charts?.load) {
          handleFailure(new Error('Google Charts loader API is unavailable.'));
          return;
        }
        google.charts.load('current', {
          packages: ['corechart'],
          callback: tryResolve
        });
        google.charts.setOnLoadCallback(tryResolve);
      } catch (error) {
        handleFailure(error);
      }
    };

    const pollInterval = setInterval(tryResolve, 200);

    if (window.google?.charts?.load) {
      startLoad();
    } else {
      const existingLoader = document.querySelector('script[data-google-charts-loader]');
      if (existingLoader) {
        existingLoader.addEventListener('load', startLoad, { once: true });
        existingLoader.addEventListener('error', () => handleFailure(new Error('Failed to load Google Charts loader script.')), { once: true });
      } else {
        const script = document.createElement('script');
        script.src = 'https://www.gstatic.com/charts/loader.js';
        script.async = true;
        script.defer = true;
        script.dataset.googleChartsLoader = 'true';
        script.addEventListener('load', startLoad, { once: true });
        script.addEventListener('error', () => handleFailure(new Error('Failed to load Google Charts loader script.')), { once: true });
        document.head.appendChild(script);
      }
    }
  }).catch(error => {
    googleChartsLoadPromise = null;
    throw error;
  });

  return googleChartsLoadPromise;
}

// Begin loading immediately so the chart can render as soon as data is ready
loadGoogleChartsLibrary().catch(error => {
  console.error('Unable to initialize Google Charts:', error);
});

// Build/version banner for diagnostics
(function(){
  try {
    const build = 'v2.4-embed-gate-2025-11-04T20:26Z';
    window.__LINECHART_BUILD__ = build;
    document.documentElement.setAttribute('data-linechart-build', build);
  console.log('Linechart build loaded: ' + build);
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
    initialLoadComplete = true;
    
    // Now that overlay is hidden and layout is stable, send final accurate height
    setTimeout(() => {
      sendContentHeightToParent();
    }, 100);
  }
  
  // Handle height request from parent (sent before hiding overlay to prevent layout shift)
  if (event.data && event.data.type === 'requestHeight') {
    sendContentHeightToParent();
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
  removeBtn.innerHTML = '<span class="remove-icon" aria-hidden="true"></span> Remove Group';
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
    addBtn.innerHTML = '<span class="add-icon" aria-hidden="true"></span> Add Group';
    addBtn.onclick = () => addGroupSelector("", true);
    container.appendChild(addBtn);
  }

  // Disable button if 10 groups are present
  if (rows.length >= 10) {
    addBtn.textContent = 'Max Groups = 10';
    addBtn.disabled = true;
  } else {
    addBtn.innerHTML = '<span class="add-icon" aria-hidden="true"></span> Add Group';
    addBtn.disabled = false;
  }

  // Notify parent about layout changes when control stack grows/shrinks
  if (window.parent && window.parent !== window) {
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          sendContentHeightToParent();
        } catch (err) {
          console.warn('Failed to send height after refreshButtons:', err);
        }
      }, 0);
    });
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
    const svg = chartContainer.querySelector('svg');
    if (!svg || !chart) return;

    const chartLayout = chart.getChartLayoutInterface();
    const chartArea = chartLayout.getChartAreaBoundingBox();
    const labelY = chartArea.top + chartArea.height + 20;
    const ns = 'http://www.w3.org/2000/svg';

    const startYear = +document.getElementById('startYear').value;
    const endYear = +document.getElementById('endYear').value;
    const yearsAll = window.globalYears || [];
    const startIdx = yearsAll.indexOf(String(startYear));
    const endIdx = yearsAll.indexOf(String(endYear));
    if (startIdx === -1 || endIdx === -1) return;
    const years = yearsAll.slice(startIdx, endIdx + 1);

    // Use calculateYearTicks to determine which years to show
    const chartWidth = chartArea.width;
    const labelsToShow = calculateYearTicks(years, chartWidth);

    const positions = [];
    const labels = [];
    const minSpacing = 40; // Minimum pixels between labels

    // First pass: collect all positions
    for (const year of labelsToShow) {
      const yearIndex = years.indexOf(year);
      if (yearIndex === -1) continue;
      
      const x = chartLayout.getXLocation(yearIndex);
      positions.push(x);

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', labelY);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Arial, sans-serif');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', '500');
      text.setAttribute('fill', '#333');
      text.setAttribute('data-custom-year', 'true');
      text.textContent = year;

      labels.push({ element: text, x: x, year: year });
    }

    // If the penultimate label is too close to the final label, drop it
    if (labels.length >= 2) {
      const lastIdx = labels.length - 1;
      const lastX = parseFloat(labels[lastIdx].x || labels[lastIdx].element.getAttribute('x'));
      const prevX = parseFloat(labels[lastIdx - 1].x || labels[lastIdx - 1].element.getAttribute('x'));
      if ((lastX - prevX) < minSpacing) {
        labels.splice(lastIdx - 1, 1);
      }
    }

    // Add all labels to the SVG
    labels.forEach(label => {
      svg.appendChild(label.element);
    });
  } catch (e) {
    console.warn('[CustomYearTicks] Could not add custom year labels:', e);
  }
}

/* ---------------- URL Update Function ---------------- */
function updateUrlFromChartState() {
  // Ensure the data needed for ID lookups is available.
  const pollutants = window.allPollutantsData || [];
  const groups = window.allGroupsData || [];

  if (!pollutants.length || !groups.length) {
    return;
  }

  clearTimeout(urlUpdateTimer);
  urlUpdateTimer = setTimeout(() => {
    try {
      const pollutantName = document.getElementById('pollutantSelect')?.value;
      const startYear = document.getElementById('startYear')?.value;
      const endYear = document.getElementById('endYear')?.value;
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
        console.warn('pollutantId:', pollutantId, 'groupIds:', groupIds, 'groupNames:', groupNames);
        return;
      }

      if (parseInt(startYear) >= parseInt(endYear)) {
        console.warn(`URL update skipped: Invalid year range (start=${startYear}, end=${endYear}).`);
        return;
      }

      // Build query parameters
      const queryParts = [
        `pollutant_id=${encodeURIComponent(pollutantId)}`,
        `group_ids=${groupIds.join(',')}`,
        `start_year=${encodeURIComponent(startYear)}`,
        `end_year=${encodeURIComponent(endYear)}`
      ];
      
      // Send URL update to parent window
      // But ONLY if this is the active chart (chart=2 in parent URL)
      if (window.parent && window.parent !== window) {
        try {
          const parentParams = new URLSearchParams(window.parent.location.search);
          const chartParam = parentParams.get('chart');
          
          // Only send if chart=2 (line chart)
          if (chartParam === '2') {
            window.parent.postMessage({
              type: 'updateURL',
              params: queryParts
            }, '*');
          } else {
            return;
          }
        } catch (e) {
          // Cross-origin restriction - send anyway (standalone mode)
          window.parent.postMessage({
            type: 'updateURL',
            params: queryParts
          }, '*');
        }
      } else {
        window.history.replaceState({}, '', `${window.location.pathname}?${queryParts.join('&')}`);
      }

    } catch (error) {
      console.error("Failed to update URL from chart state:", error);
    }
  }, 300); // Debounce for 300ms
}


function updateChart(){
  if (!googleChartsReady || !window.google?.visualization?.DataTable) {
    loadGoogleChartsLibrary()
      .then(() => {
        if (googleChartsReady && window.google?.visualization?.DataTable) {
          updateChart();
        }
      })
      .catch(error => {
        console.error('Google Charts failed to load; chart render aborted.', error);
        showError('Unable to load the Google Charts library. Please refresh the page and try again.');
      });
    return;
  }

  const pollutant = document.getElementById('pollutantSelect').value;
  const startYear = +document.getElementById('startYear').value;
  const endYear = +document.getElementById('endYear').value;
  const selectedGroups = getSelectedGroups();
  if (!pollutant || !startYear || !endYear || !selectedGroups.length) return;

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
    chartContainer.style.minHeight = '800px';
  } else {
    console.error('chart_div element not found when attempting to draw line chart');
    return;
  }

  const yearLabel = startYear === endYear ? String(startYear) : `${startYear} - ${endYear}`;
  const pollutantTitle = unit ? `${pollutant} - ${unit}` : pollutant;
  const yAxisTitle = pollutantTitle;

  const options = {
    title: '',
    width: '100%',
    legend: 'none',
    chartArea: {
      top: 10,
      left: leftMargin,
      right: 20,
      bottom: 60
    },
    hAxis: {
      title: 'Year',
      textStyle: { color: 'transparent' }, // Hide Google Charts labels
      titleTextStyle: {
        fontSize: window.innerWidth < 768 && window.innerHeight < window.innerWidth ? 14 : 16,
        bold: false,
        italic: false
      },
      gridlines: { color: '#e0e0e0' },
      baselineColor: '#666'
    },
    vAxis: {
      title: yAxisTitle,
      viewWindow: { 
        min: 0 
      },
      textStyle: { 
        fontSize: 14 
      },
      titleTextStyle: {
        fontSize: window.innerWidth < 768 && window.innerHeight < window.innerWidth ? 14 : 16,
        bold: false,
        italic: false,
        wrap: false
      },
      textPosition: 'out', // Ensure title is positioned outside to avoid overlap
    },
    series: seriesOptions,
    curveType: smoothLines ? 'function' : 'none',
    lineWidth: 3,
    pointSize: 4
  };
  

  // draw chart and show pollutant as visible page title
  chart = new google.visualization.LineChart(chartContainer);

  // Add a 'ready' event listener that will fire after every draw (v2.3 style)
  // Remove any existing listeners first to prevent duplicates
  google.visualization.events.removeAllListeners(chart);
  google.visualization.events.addListener(chart, 'ready', addCustomXAxisLabels);

  // Compute safe width/height to avoid negative SVG dimensions
  const safeWidth = Math.max(chartContainer.offsetWidth || 0, 200);
  const safeHeight = Math.max(chartContainer.offsetHeight || 0, 200);
  options.width = safeWidth;
  options.height = safeHeight;

  // On mobile, show only first and last year for clarity
  const isMobile = window.innerWidth < 600;
  if (isMobile) {
    options.hAxis.slantedText = true;
    options.chartArea.width = '70%';
  }

  // Delay slightly to let layout stabilize (prevents negative sizes and bouncing)
  setTimeout(() => {
    chart.draw(dataTable, options);
    // Only add visible class when parent is already visible to prevent flash
    if (document.getElementById('mainContent').classList.contains('loaded')) {
      chartContainer.classList.add('visible');
    }
    
    // After chart finishes drawing, update height if we're in a resize
    if (window._pendingHeightUpdate) {
      window._pendingHeightUpdate = false;
      // Use requestAnimationFrame to ensure DOM has fully updated
      requestAnimationFrame(() => {
        setTimeout(() => {
          sendContentHeightToParent();
        }, 100);
      });
    } else {
      // Always send height after drawing (for filter changes that may affect button container layout)
      requestAnimationFrame(() => {
        setTimeout(() => {
          sendContentHeightToParent();
        }, 100);
      });
    }
  }, 100);

  // update visible title on page
  const titleEl = document.getElementById('chartTitle');
  if (titleEl) {
    titleEl.innerHTML = '';

    const yearElement = document.createElement('div');
    yearElement.className = 'chart-title__year-range';
    yearElement.textContent = yearLabel;
    titleEl.appendChild(yearElement);

    const pollutantElement = document.createElement('div');
    pollutantElement.className = 'chart-title__pollutant';
    pollutantElement.textContent = pollutantTitle;
    titleEl.appendChild(pollutantElement);
  }

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

// Helper to send content height to parent (called once after initial render)
function sendContentHeightToParent() {
  const body = document.body;
  
  // Only use body measurements - html measurements reflect the iframe size set by parent
  let measuredHeight = Math.max(
    body?.scrollHeight || 0,
    body?.offsetHeight || 0
  );

  if (!measuredHeight || measuredHeight < 200) {
    const mainContent = document.getElementById('mainContent');
    const contentHeight = Math.max(mainContent?.scrollHeight || 0, mainContent?.offsetHeight || 0);
    const fallbackHeight = 1100;
    measuredHeight = Math.max(contentHeight, fallbackHeight);
    console.warn('Line chart content height below threshold; using fallback height:', measuredHeight);
  }
  
  window.parent.postMessage({
    type: 'contentHeight',
    chart: 'line',
    height: measuredHeight
  }, '*');
}

// No need for dynamic height - chart is fixed at 600px
// Parent will set iframe to fixed height

// Backward compatibility: some older code paths may still call drawChart()
// Ensure it simply delegates to the modern updateChart() with readiness guards
function drawChart() {
  try {
    return updateChart();
  } catch (e) {
    console.error('drawChart fallback failed:', e);
  }
}

// Track last window width to detect real user resizes vs parent iframe height adjustments
let lastWindowWidth = window.innerWidth;

// Resize handler - only update height when WIDTH changes (real user resize)
window.addEventListener('resize', () => {
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(() => {
    const currentWidth = window.innerWidth;
    
    // Only proceed if width actually changed (real user resize, not parent adjusting iframe height)
    if (currentWidth !== lastWindowWidth) {
      lastWindowWidth = currentWidth;
      
      window._pendingHeightUpdate = true;
      updateChart();
      // Height will be sent after chart finishes drawing (see updateChart's setTimeout callback)
    } else {
      return;
    }
  }, 200);
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
    
    // Make content visible immediately (we're in iframe, parent handles loading)
    mainContent.style.display = 'block';
    mainContent.removeAttribute('aria-hidden');
    mainContent.classList.add('loaded'); // Add loaded class immediately
    
    // Since iframe has fixed height, we can render immediately
    // Now render the chart at the correct size
    (function gateFirstRender(){
          let tries = 0;
          const maxTries = 30; // ~3s
          function tick(){
            if (selectionsReady()) {
              updateChart();
              afterDraw();
            } else if (++tries < maxTries) {
              setTimeout(tick, 100);
            } else {
              console.warn('Selections not ready after waiting — drawing anyway');
              updateChart();
              afterDraw();
            }
          }
          function afterDraw(){
            // Wait for chart to actually render in the DOM
            setTimeout(() => {
              // Make chart visible
              const chartDiv = document.getElementById('chart_div');
              if (chartDiv) {
                chartDiv.classList.add('visible');
              }

              const loadingOverlay = document.getElementById('loadingOverlay');
              if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
                loadingOverlay.classList.add('hidden');
                setTimeout(() => {
                  loadingOverlay.style.display = 'none';
                }, 350);
              }
              // Wait longer to ensure Google Chart is fully painted and stable
              setTimeout(() => {
                // Update URL with initial chart state
                updateUrlFromChartState();
                
                // Chart is rendered - send chartReady
                // Height will be sent after overlay is hidden and layout is stable
                console.log('Chart Ready');
                window.parent.postMessage({
                  type: 'chartReady',
                  chart: 'line'
                }, '*');
                resolve();
              }, 200);
            }, 350);
          }
          tick();
        })();
  });
}



/* ---------------- URL Parameters and Initialization ---------------- */
function parseUrlParameters() {
  // Try to get params from parent window if in iframe, otherwise use own window
  let searchParams;
  try {
    if (window.parent && window.parent !== window && window.parent.location.search) {
      searchParams = window.parent.location.search;
    } else {
      searchParams = window.location.search;
    }
  } catch (e) {
    // Cross-origin restriction, use own window
    searchParams = window.location.search;
  }
  
  const params = new URLSearchParams(searchParams);
  
  // Check if this is the active chart - only parse params if chart=2 (line chart)
  const chartParam = params.get('chart');
  if (chartParam && chartParam !== '2') {
    // Return empty params so defaults will be used
    return {
      pollutantName: null,
      groupNames: [],
      startYear: null,
      endYear: null
    };
  }
  
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
    notifyParentOfInitFailure(error);
  }
}

function notifyParentOfInitFailure(error) {
  if (initFailureNotified) {
    return;
  }
  initFailureNotified = true;

  try {
    const mainContent = document.getElementById('mainContent');
    if (mainContent) {
      mainContent.style.display = 'block';
      mainContent.removeAttribute('aria-hidden');
      mainContent.classList.add('loaded');
    }

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
      }, 350);
    }
  } catch (layoutError) {
    console.error('Failed to reveal main content during failure handling:', layoutError);
  }

  try {
    if (window.parent && window.parent !== window) {
      const message = (error && error.message) ? error.message : 'Unknown initialization error';
  console.warn('Notifying parent about initialization failure');
      window.parent.postMessage({
        type: 'chartReady',
        chart: 'line',
        status: 'error',
        message
      }, '*');
    }
  } catch (postError) {
    console.error('Failed to notify parent of initialization failure:', postError);
  }

  setTimeout(() => {
    try {
      sendContentHeightToParent();
    } catch (heightError) {
      console.error('Failed to send fallback content height to parent:', heightError);
    }
  }, 150);
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

// Call this after chart is fully loaded
if (window.google && window.google.visualization && chart) {
  google.visualization.events.addListener(chart, 'ready', function() {
    // Notify parent that chart is ready
    notifyChartReady();
  });
}

// Listen for parent window messages
window.addEventListener('message', (event) => {
  // Message handling can be added here for future features
  // Charts now handle their own loading completion
});

// Initialise on DOM ready
document.addEventListener('DOMContentLoaded', init);