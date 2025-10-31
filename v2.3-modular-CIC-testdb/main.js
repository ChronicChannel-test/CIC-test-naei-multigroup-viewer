/**
 * Main Chart and UI Module
 * Handles chart rendering, UI interactions, group management, and initialization
 * Extracted from v2.2 index.html for modular architecture
 */

// Load Google Charts
google.charts.load('current', {packages:['corechart']});

// Color palette and chart configuration
const distinctPalette=['#E6194B','#3CB44B','#FFE119','#4363D8','#F58231','#911EB4','#46F0F0','#F032E6','#BCF60C','#FABEBE'];
const categoryBaseColor={ecodesign:distinctPalette[4],fireplace:distinctPalette[0],gas:distinctPalette[3],power:distinctPalette[1],road:distinctPalette[6]};
let colorCache={};
let availableColors=[...distinctPalette];
let chart; // global chart instance
let seriesVisibility = [];
window.seriesVisibility = seriesVisibility; // Expose for export.js
let urlUpdateTimer = null; // Debounce timer for URL updates

// Export configuration constants
const EXPORT_MIN_SCALE = 16;
const EXPORT_MAX_DIM = 16000;
const EXPORT_MAX_PIXELS = 100_000_000;

// Chart options
let smoothLines = true; // default to smooth (curved) lines
window.smoothLines = smoothLines; // Expose for export.js

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
    console.warn(`Export scale ${desiredScale} reduced to ${allowed} to avoid huge canvas (${Math.round(origW*allowed)}x${Math.round(origH*allowed)})`);
    try {
      window.__export_debug = window.__export_debug || {};
      window.__export_debug.lastClamped = { origW, origH, desiredScale, allowed };
    } catch (e) {}
  }
  return allowed;
}

/* ---------------- Color helpers ---------------- */
function resetColorSystem() {
  colorCache = {};
  availableColors = [...distinctPalette];
}

function getColorForGroup(name) {
  if (!name) return '#888888';
  if (colorCache[name]) return colorCache[name];

  const lower = name.toLowerCase();
  const cat = Object.keys(categoryBaseColor).find(c => lower.includes(c));

  // Prefer category colour if available
  let baseColor = cat ? categoryBaseColor[cat] : null;
  let chosenColor = baseColor;

  // Avoid duplicates: if base colour already used, pick next available
  if (!chosenColor || Object.values(colorCache).includes(chosenColor)) {
    chosenColor = availableColors.find(c => !Object.values(colorCache).includes(c));
  }

  // Fallback to any colour if palette exhausted (shouldn't happen with ≤10)
  if (!chosenColor) {
    chosenColor = distinctPalette[Object.keys(colorCache).length % distinctPalette.length];
  }

  colorCache[name] = chosenColor;
  return chosenColor;
}

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
        removeBtn.setAttribute('aria-label', groupName ? `Remove group ${groupName}` : 'Remove group');
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

/**
 * Remove bare 4-digit year tick elements from an SVG root unless they're
 * explicitly marked with `data-custom-year`. Returns an object listing
 * removed labels for diagnostics.
 */
function pruneYearsFromSVG(svgRoot, opts = {}) {
  const debug = opts.debug || false;
  const removed = [];
  try {
    if (!svgRoot || !svgRoot.querySelectorAll) return { removed };
    const nodes = svgRoot.querySelectorAll('text, tspan');
    nodes.forEach(node => {
      try {
        const txt = (node.textContent || '').trim();
        if (/^\d{4}$/.test(txt)) {
          let cur = node;
          let hasCustom = false;
          while (cur && cur.getAttribute) {
            if (cur.getAttribute('data-custom-year')) { hasCustom = true; break; }
            cur = cur.parentNode;
          }
          if (!hasCustom) {
            let toRemove = node;
            while (toRemove && toRemove.nodeName && toRemove.nodeName.toLowerCase() !== 'text') toRemove = toRemove.parentNode;
            if (toRemove && toRemove.parentNode) {
              toRemove.parentNode.removeChild(toRemove);
              removed.push(txt);
            }
          }
        }
      } catch (e) {
        if (debug) console.warn('pruneYearsFromSVG inner error', e);
      }
    });
  } catch (e) {
    if (debug) console.warn('pruneYearsFromSVG failed', e);
  }
  return { removed };
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
    console.warn('Could not add custom year labels:', e);
  }
}


/* ---------------- Chart rendering & legend ---------------- */

/**
 * Updates the browser's URL with the current chart settings.
 * This function is debounced to prevent flooding the browser history.
 */
function updateUrlFromChartState() {
  // Ensure the data needed for ID lookups is available.
  const pollutants = window.allPollutantsData || [];
  const groups = window.allGroupsData || [];
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
        console.warn(`URL update skipped: Invalid year range (start=${startYear}, end=${endYear}).`);
        return;
      }

      const queryParts = [
        `pollutant_id=${encodeURIComponent(pollutantId)}`,
        `group_ids=${groupIds.join(',')}`,
        `start_year=${encodeURIComponent(startYear)}`,
        `end_year=${encodeURIComponent(endYear)}`
      ];
      
      const newUrl = `${window.location.pathname}?${queryParts.join('&')}`;
      
      window.history.replaceState({ path: newUrl }, '', newUrl);

    } catch (error) {
      console.error("Failed to update URL from chart state:", error);
    }
  }, 400); // 400ms debounce delay
}


function updateChart(){
  const pollutant = document.getElementById('pollutantSelect').value;
  const startYear = +document.getElementById('startYear').value;
  const endYear = +document.getElementById('endYear').value;
  const selectedGroups = getSelectedGroups();
  if (!pollutant || !startYear || !endYear || !selectedGroups.length) return;

  // Update the URL with the new state (debounced)
  updateUrlFromChartState();

  // Track chart view analytics
  trackAnalytics('chart_view', {
    pollutant: pollutant,
    start_year: startYear,
    end_year: endYear,
    groups: selectedGroups,
    groups_count: selectedGroups.length,
    year_range: endYear - startYear + 1
  });

  resetColorSystem();
  // Use the global year keys to determine which years to display
  const yearsAll = window.globalYears || [];
  const yearKeys = window.globalYearKeys || [];
  const startIdx = yearsAll.indexOf(String(startYear));
  const endIdx = yearsAll.indexOf(String(endYear));
  const years = yearsAll.slice(startIdx, endIdx + 1);
  const keysForYears = yearKeys.slice(startIdx, endIdx + 1);
  const colors = selectedGroups.map(g => getColorForGroup(g));

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
        
        const tooltip = `${groupName}\nYear: ${row[0]}\nValue: ${formattedValue}${unit ? ' ' + unit : ''}`;
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
  const labelLength = maxValue ? maxValue.toLocaleString().length : 3;
  const leftMargin = Math.min(100, Math.max(60, labelLength * 10)); // dynamic left padding

  const chartContainer = document.getElementById('chart_div');

  const options = {
    title: '',
    width: '100%',
    height: '70%',
    legend: 'none',
    hAxis: {
      title: 'Year',
      textStyle: { color: 'transparent' }, // Hide Google Charts labels
      titleTextStyle: { fontSize: 13, bold: true },
      gridlines: { color: '#e0e0e0' },
      baselineColor: '#666'
    },
    vAxis: {
      title: `Emissions${unit ? " (" + unit + ")" : ""}`,
      viewWindow: { min: 0 },
      textStyle: { fontSize: 12 },
      titleTextStyle: { fontSize: 13, bold: true }
    },
    series: seriesOptions,
    curveType: smoothLines ? 'function' : 'none',
    lineWidth: 3,
    pointSize: 4,
    chartArea: {
      top: 20,
      left: leftMargin,
      right: 10,
      bottom: 60,
      height: '70%'
    }
  };
  

  // draw chart and show pollutant as visible page title
  chart = new google.visualization.LineChart(chartContainer);

  // Add a 'ready' event listener that will fire after every draw,
  // ensuring custom labels are always present.
  google.visualization.events.addListener(chart, 'ready', addCustomXAxisLabels);

  // Compute safe width/height to avoid negative SVG dimensions
  const safeWidth = Math.max(chartContainer.offsetWidth || 0, 300);
  const safeHeight = Math.max(chartContainer.offsetHeight || 0, 200);
  options.width = safeWidth;
  options.height = safeHeight;

  // On mobile, show only first and last year for clarity
  const isMobile = window.innerWidth < 600;
  if (isMobile) {
    options.hAxis.slantedText = true;
    options.hAxis.slantedTextAngle = 90;
  }
    // Ensure a small right chart padding so the chart fills most of the container
  if (options.chartArea) {
    // Reduce the minimum right padding; previously set to 80px which left a large gap.
    options.chartArea.right = Math.max(options.chartArea.right || 10, 20);
    if (isMobile) {
      options.chartArea.width = '70%';
    }
  }

  // Delay slightly to let layout stabilize (prevents negative sizes)
  setTimeout(() => {
    chart.draw(dataTable, options);
    // Only add visible class when parent is already visible to prevent flash
    if (document.getElementById('mainContent').classList.contains('loaded')) {
      chartContainer.classList.add('visible');
    }
  }, 100);

  // update visible title on page
  const titleEl = document.getElementById('chartTitle');
  titleEl.textContent = `${pollutant}${unit ? " (" + unit + ")" : ""}`;

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

window.addEventListener('resize', () => {
  clearTimeout(window._resizeTimer);
  window._resizeTimer = setTimeout(updateChart, 200);
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
      if (params.startYear && startYearSelect.querySelector(`option[value="${params.startYear}"]`)) {
        startYearSelect.value = params.startYear;
      }
      if (params.endYear && endYearSelect.querySelector(`option[value="${params.endYear}"]`)) {
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
    const loadingOverlay = document.getElementById('loadingOverlay');
    const mainContent = document.getElementById('mainContent');
    
    // Make content visible but keep it transparent
    mainContent.style.display = 'block';
    mainContent.removeAttribute('aria-hidden');
    
    // Render the chart while still hidden (opacity 0)
    // This prevents the empty chart flash
    updateChart();
    
    // Wait for chart to render, then fade in together
    setTimeout(() => {
      // Start fade out of loading overlay
      loadingOverlay.style.opacity = '0';
      
      // Start fade in of main content and chart simultaneously
      requestAnimationFrame(() => {
        mainContent.classList.add('loaded');
        // Make chart visible now that parent is ready
        const chartDiv = document.getElementById('chart_div');
        if (chartDiv) {
          chartDiv.classList.add('visible');
        }
      });
      
      // Clean up loading overlay after fade completes
      setTimeout(() => {
        loadingOverlay.style.display = 'none';
        resolve();
      }, 400);
    }, 250); // Give chart time to render
  });
}



/* ---------------- URL Parameters and Initialization ---------------- */
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  const pollutantId = params.get('pollutant_id');
  const groupIds = params.get('group_ids')?.split(',').map(Number).filter(Boolean);
  const startYearParam = params.get('start_year');
  const endYearParam = params.get('end_year');

  const pollutants = window.allPollutantsData || [];
  const groups = window.allGroupsData || [];
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
        console.warn(`Invalid year range in URL: start=${startYearParam}, end=${endYearParam}. Using defaults.`);
        startYear = availableYears[0];
        endYear = availableYears[availableYears.length - 1];
      }
    } else if (isStartYearValid) {
      // Only start year valid
      startYear = startYearParam;
      // Find a valid end year after the start
      const startIdx = availableYears.indexOf(startYearParam);
      endYear = availableYears[availableYears.length - 1];
      console.warn(`Invalid end year in URL: ${endYearParam}. Using ${endYear}.`);
    } else if (isEndYearValid) {
      // Only end year valid
      endYear = endYearParam;
      // Find a valid start year before the end
      startYear = availableYears[0];
      console.warn(`Invalid start year in URL: ${startYearParam}. Using ${startYear}.`);
    } else if (startYearParam || endYearParam) {
      // Years provided but both invalid
      console.warn(`Invalid years in URL: start=${startYearParam}, end=${endYearParam}. Using defaults.`);
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
    // First, load all necessary data from Supabase
    const { pollutants, groups, yearKeys, pollutantUnits, groupedData } = await window.supabase.loadData();

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
    await window.supabase.loadGroupInfo();

    // Set up event listeners for buttons
    setupEventListeners();
    setupShareButton();

    // Then, render the initial view based on URL parameters or defaults
    await renderInitialView();

    // Finally, reveal the main content and draw the chart
    await revealMainContent();

  } catch (error) {
    console.error("Initialization failed:", error);
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.innerHTML = `<p>Error loading data. Please check the console and refresh the page.</p><p>${error.message}</p>`;
    loadingOverlay.style.opacity = '1';
  }
}

// Initialise on DOM ready
document.addEventListener('DOMContentLoaded', init);