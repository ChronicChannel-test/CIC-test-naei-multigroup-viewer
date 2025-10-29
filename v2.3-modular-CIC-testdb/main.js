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

function setupSelectors(){
  // ✅ Use pollutant list from Supabase loadData
  const sel = document.getElementById('pollutantSelect');
  sel.innerHTML = '<option value="">Select pollutant</option>';
  if (window.allPollutants && window.allPollutants.length) {
    window.allPollutants.forEach(p => sel.add(new Option(p, p)));
  }

  // Ensure we have the groups list available from the global window var
  if (!window.allGroupsList && window.allGroups) {
    window.allGroupsList = window.allGroups;
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
  startSel.addEventListener('change', updateChart);
  endSel.addEventListener('change', updateChart);

  // Group selectors will be added by the init() function after URL parameter processing
  // This prevents double group creation that causes visual jumping
 }

function getSelectedGroups(){ return [...document.querySelectorAll('#groupContainer select')].map(s => s.value).filter(Boolean); }
function addGroupSelector(defaultValue = "", usePlaceholder = true){
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
    if (!selected.includes(g) || g === defaultValue) sel.add(new Option(g,g));
  });
  if (defaultValue) sel.value = defaultValue;
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

/* ---------------- Chart rendering & legend ---------------- */
function updateChart(){
  const pollutant = document.getElementById('pollutantSelect').value;
  const startYear = +document.getElementById('startYear').value;
  const endYear = +document.getElementById('endYear').value;
  const groups = getSelectedGroups();
  if (!pollutant || !startYear || !endYear || !groups.length) return;

  // Track chart view analytics
  trackAnalytics('chart_view', {
    pollutant: pollutant,
    start_year: startYear,
    end_year: endYear,
    groups: groups,
    groups_count: groups.length,
    year_range: endYear - startYear + 1
  });

  resetColorSystem();
  // Use the global year keys to determine which years to display
  const yearsAll = window.globalYears || [];
  const yearKeys = window.globalYearKeys || [];
  const startIdx = yearsAll.indexOf(String(startYear));
  const endIdx = yearsAll.indexOf(String(endYear));
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return;
  const years = yearsAll.slice(startIdx, endIdx + 1);
  const keysForYears = yearKeys.slice(startIdx, endIdx + 1);
  const colors = groups.map(g => getColorForGroup(g));

  // Build rows of data (year + series values). Use null for missing.
  const chartRows = years.map((y, rowIdx) => {
    const row = [y];
    const key = keysForYears[rowIdx]; // e.g. 'f2015'
    groups.forEach(g => {
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
  const groupHasData = groups.map((g, i) => {
    return chartRows.some(row => typeof row[i + 1] === 'number');
  });

  // Create DataTable explicitly to guarantee column types
  const dataTable = new google.visualization.DataTable();
  dataTable.addColumn('string', 'Year');           // year as string
  groups.forEach(g => dataTable.addColumn('number', g)); // explicit numeric series columns
  dataTable.addRows(chartRows);

  const unit = pollutantUnits[pollutant] || "";
  const seriesOptions = {};
  groups.forEach((g, i) => {
    seriesOptions[i] = { color: colors[i], lineWidth: 3, pointSize: 4 };
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
    chartContainer.classList.add('visible');
    
    // Manually add custom year labels with proper spacing
    setTimeout(() => {
      try {
        const svg = chartContainer.querySelector('svg');
        if (!svg) return;
        
        const chartLayout = chart.getChartLayoutInterface();
        const chartArea = chartLayout.getChartAreaBoundingBox();
        const labelY = chartArea.top + chartArea.height + 20;
        const ns = 'http://www.w3.org/2000/svg';
        
          // Use calculateYearTicks to determine which years to show
        const chartWidth = chartArea.width;
        const labelsToShow = calculateYearTicks(years, chartWidth);
        
        // Get all x positions first to check for overlaps
        const positions = [];
        const labels = [];
        const minSpacing = 40; // Minimum pixels between labels
        
          // First pass: collect all positions
        for (const year of labelsToShow) {
          const yearIndex = years.indexOf(year);
          const x = chartLayout.getXLocation(yearIndex);
          positions.push(x);
          
          const text = document.createElementNS(ns, 'text');
          text.setAttribute('x', x);
          text.setAttribute('y', labelY);
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('font-family', 'Arial, sans-serif');
          // Keep on-screen labels slightly smaller / lighter so they look correct in the UI.
          // We draw larger labels onto the export canvas when necessary.
          text.setAttribute('font-size', '14');
          text.setAttribute('font-weight', '500');
          text.setAttribute('fill', '#333');
          // Mark custom year labels so export can distinguish them from default axis ticks
          text.setAttribute('data-custom-year', 'true');
          text.textContent = year;
          
          // Store for later use
          labels.push({
            element: text,
            x: x,
            year: year
          });
        }
        
        // If the penultimate label is too close to the final label, drop it
        if (labels.length >= 2) {
          const lastIdx = labels.length - 1;
          const lastX = parseFloat(labels[lastIdx].x || labels[lastIdx].element.getAttribute('x'));
          const prevX = parseFloat(labels[lastIdx - 1].x || labels[lastIdx - 1].element.getAttribute('x'));
          if ((lastX - prevX) < minSpacing) {
            // remove penultimate label so final label isn't crowded
            labels.splice(lastIdx - 1, 1);
          }
        }

        // Second pass: adjust positions to prevent overlap
        for (let i = 1; i < labels.length; i++) {
          const prevX = parseFloat(labels[i-1].element.getAttribute('x'));
          const currentX = labels[i].x;
          
          // If labels are too close, adjust the current label's position
          if (Math.abs(currentX - prevX) < minSpacing) {
            // Move the current label to the right of the previous one
            const newX = prevX + minSpacing;
            // But don't go beyond the chart area
            if (newX < chartArea.left + chartArea.width - 20) {
              labels[i].element.setAttribute('x', newX);
              // Update the text-anchor to 'start' to prevent text from shifting
              labels[i].element.setAttribute('text-anchor', 'start');
            }
          }
        }
        
        // Add all labels to the SVG
        labels.forEach(label => {
          svg.appendChild(label.element);
        });
      } catch (e) {
        console.warn('Could not add custom year labels:', e);
      }
    }, 150);
  }, 100);

  // update visible title on page
  const titleEl = document.getElementById('chartTitle');
  titleEl.textContent = `${pollutant}${unit ? " (" + unit + ")" : ""}`;

  // build custom legend (interactive)
  const legendDiv = document.getElementById('customLegend');
  legendDiv.innerHTML = '';
  const seriesVisibility = Array(groups.length).fill(true);

  groups.forEach((g, i) => {
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

    // Fade if no data
    if (!groupHasData[i]) {
      item.style.opacity = '0.4';
      item.title = 'No data available';
    }

    // Toggle visibility only if data exists
    if (groupHasData[i]) {
      item.addEventListener('click', () => {
        seriesVisibility[i] = !seriesVisibility[i];
        const newOptions = { ...options, series: {} };
        groups.forEach((g2, idx) => {
          newOptions.series[idx] = seriesVisibility[idx]
            ? { color: colors[idx], lineWidth: 3, pointSize: 4 }
            : { color: colors[idx], lineWidth: 0, pointSize: 0 };
        });
        chart.draw(dataTable, newOptions);
        item.style.opacity = seriesVisibility[i] ? '1' : '0.4';
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
    requestAnimationFrame(() => {
      try {
        updateChart();
      } catch (err) {
        console.error('Initial chart render failed:', err);
      } finally {
        setTimeout(resolve, 350);
      }
    });
  });
}

async function revealMainContent() {
  const overlay = document.getElementById('loadingOverlay');
  const content = document.getElementById('mainContent');
  if (!overlay || !content) return;

  content.style.display = 'block';
  content.removeAttribute('aria-hidden');
  requestAnimationFrame(() => content.classList.add('loaded'));

  await renderInitialView();

  overlay.style.opacity = '0';

  return new Promise(resolve => {
    setTimeout(() => {
      overlay.style.display = 'none';
      resolve();
    }, 400);
  });
}

function setupDownloadButton() {
  const dl = document.getElementById('downloadBtn');

  dl.addEventListener('click', async () => {
    try {
      const pollutant = document.getElementById('pollutantSelect').value;
      if (!chart || !pollutant) return;

      // Track chart download analytics
      const selectedGroups = getSelectedGroups();
      const startYear = +document.getElementById('startYear').value;
      const endYear = +document.getElementById('endYear').value;
      trackAnalytics('chart_download', {
        pollutant: pollutant,
        start_year: startYear,
        end_year: endYear,
        groups: selectedGroups,
        groups_count: selectedGroups.length,
        filename: pollutant.replace(/[^a-z0-9_\-]/gi, '_') + '_comparison.png'
      });

      const unit = pollutantUnits[pollutant] || "";

      // Get chart image and create final PNG with legend and footer
      const chartImageData = await generateChartImage();
      
      // Trigger download
      const link = document.createElement('a');
      link.download = `${pollutant.replace(/[^a-z0-9_\-]/gi, '_')}_comparison.png`;
      link.href = chartImageData;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download chart image. Please try again.');
    }
  });
}

/* ---------------- URL Parameters and Initialization ---------------- */
function parseUrlParameters() {
  const params = new URLSearchParams(window.location.search);
  const result = {};
  
  // Get pollutant ID
  if (params.has('pollutant_id')) {
    result.pollutant_id = params.get('pollutant_id');
  }
  
  // Get group IDs (can be comma-separated)
  if (params.has('group_ids')) {
    const groupIds = params.get('group_ids');
    result.group_ids = groupIds.split(',').map(id => id.trim()).filter(id => id);
  }
  
  // Get year range
  if (params.has('start_year')) {
    result.start_year = params.get('start_year');
  }
  
  if (params.has('end_year')) {
    result.end_year = params.get('end_year');
  }
  
  return result;
}

async function init(){
  try {
    console.log("🔄 Initializing Supabase data...");
    
    // Track page load
    trackAnalytics('page_load', {
      version: 'v2.2 testdb Gemini',
      load_time: Date.now(),
      screen_resolution: screen.width + 'x' + screen.height,
      viewport: window.innerWidth + 'x' + window.innerHeight
    });
    
    // --- Load all data once ---
    await loadUnits();
    await loadData();
    await loadGroupInfo();

    // --- Populate dropdowns ---
    setupSelectors();

    // Check if this is a shared URL that needs processing
    const urlParams = parseUrlParameters();
    const isSharedUrl = urlParams.pollutant_id || urlParams.group_ids || urlParams.start_year || urlParams.end_year;

    // For normal URLs, do all DOM setup BEFORE showing UI
    if (!isSharedUrl) {
      // Set default pollutant
      const pollutantSelect = document.getElementById("pollutantSelect");
      if (pollutantSelect.querySelector("option[value=\"PM2.5\"]")) {
        pollutantSelect.value = "PM2.5";
      }

      // Add default group selector EARLY (before any UI transitions)
      const firstGroup = (window.allGroupsList || []).find(g => g.toLowerCase() === "all") || (window.allGroupsList?.[0] || "");
      if (firstGroup) {
        addGroupSelector(firstGroup, false);
      } else {
        addGroupSelector("", true); // Empty placeholder if no groups available
      }

      const revealPromise = revealMainContent();

      setupDownloadButton();
      setupSmoothingToggle();
      setupShareButton();
      setupInteractionTracking();
      document.getElementById("downloadCSVBtn").addEventListener("click", () => exportData("csv"));
      document.getElementById("downloadXLSXBtn").addEventListener("click", () => exportData("xlsx"));

      await revealPromise;
      return; // Skip URL processing for normal URLs
    }

    // --- Process shared URL parameters ---    
    const pollutantSelect = document.getElementById('pollutantSelect');
    
    // Set pollutant from URL or default to PM2.5
    if (urlParams.pollutant_id) {
      // Find pollutant name by ID
      const pollutantData = pollutantsData.find(pd => 
        pd.id === parseInt(urlParams.pollutant_id)
      );
      
      if (pollutantData) {
        const pollutantName = pollutantData.Pollutant || pollutantData.pollutant;
        if (pollutantName) {
          pollutantSelect.value = pollutantName;
          console.log(`🔗 Loaded pollutant from URL: ${pollutantName} (ID: ${urlParams.pollutant_id})`);
          
          // Track shared URL usage
          trackAnalytics('shared_url_load', {
            pollutant_id: urlParams.pollutant_id,
            pollutant_name: pollutantName,
            group_ids: urlParams.group_ids || 'none',
            start_year: urlParams.start_year || '',
            end_year: urlParams.end_year || '',
            has_year_range: !!(urlParams.start_year && urlParams.end_year)
          });
        }
      }
    } else {
      // Default behavior
      const pm25 = pollutantSelect.querySelector('option[value="PM2.5"]');
      if (pm25) pollutantSelect.value = "PM2.5";
      else if (pollutantSelect.options.length > 1) pollutantSelect.selectedIndex = 1;
    }

    // Handle group selection from URL or use defaults
    const groupContainer = document.getElementById('groupContainer');
    
    if (urlParams.group_ids && urlParams.group_ids.length > 0) {
      // Load groups from URL parameters
      console.log(`🔗 Loading groups from URL: ${urlParams.group_ids.join(', ')}`);
      
      // Clear any existing group selectors
      groupContainer.innerHTML = '';
      
      // Add group selectors for each ID in URL
      urlParams.group_ids.forEach(groupId => {
        const groupData = groupsData.find(gd => gd.id === parseInt(groupId));
        if (groupData) {
          const groupName = groupData.Group_Title || groupData.group_title;
          if (groupName) {
            addGroupSelector(groupName, false);
          }
        }
      });
      
      // If no valid groups were found from IDs, fall back to default
      if (groupContainer.querySelectorAll('select').length === 0) {
        console.warn('🚫 No valid groups found from URL IDs, using default');
        const defaultGroup = (window.allGroupsList || []).find(g => g.toLowerCase() === "all") || (window.allGroupsList?.[0] || "");
        if (defaultGroup) addGroupSelector(defaultGroup, false);
        else addGroupSelector("", true);
      }
    } else {
      // Default behavior when no URL groups
      let firstGroup = (window.allGroupsList || []).find(g => g.toLowerCase() === "all")
        || (window.allGroupsList?.[0] || "");

      // If group list is empty or doesn't contain "All", fall back to groups discovered in groupedData
      if (!firstGroup) {
        // try groups for selected pollutant first
        const chosenPoll = pollutantSelect.value || window.allPollutants?.[0];
        const groupsForPoll = chosenPoll ? Object.keys(groupedData[chosenPoll] || {}) : [];
        firstGroup = groupsForPoll[0] || (Object.values(groupedData).flatMap(p => Object.keys(p))[0] || "");
      }

      // If still no firstGroup but there's at least one group in window.allGroupsList, use that
      if (!firstGroup && window.allGroupsList && window.allGroupsList.length) {
        firstGroup = window.allGroupsList[0];
      }

      // Add a selector only if there isn't one already
      if (document.querySelectorAll('#groupContainer select').length === 0) {
        if (firstGroup) addGroupSelector(firstGroup, false);
        else addGroupSelector("", true);
      } else {
        // If selector exists but has no selection, try to set it
        const existingSel = document.querySelector('#groupContainer select');
        if (existingSel && !existingSel.value && firstGroup) existingSel.value = firstGroup;
      }
    }
    
    // --- Set year range from URL parameters ---
    const startYearSelect = document.getElementById('startYear');
    const endYearSelect = document.getElementById('endYear');
    
    if (urlParams.start_year && startYearSelect) {
      const startOption = startYearSelect.querySelector(`option[value="${urlParams.start_year}"]`);
      if (startOption) {
        startYearSelect.value = urlParams.start_year;
        console.log(`🔗 Set start year from URL: ${urlParams.start_year}`);
      }
    }
    
    if (urlParams.end_year && endYearSelect) {
      const endOption = endYearSelect.querySelector(`option[value="${urlParams.end_year}"]`);
      if (endOption) {
        endYearSelect.value = urlParams.end_year;
        console.log(`🔗 Set end year from URL: ${urlParams.end_year}`);
      }
    }

    // --- Chart will be drawn after UI is shown ---



    // === SHOW UI for shared URLs - after URL processing ===
    const revealPromise = revealMainContent();

    setupDownloadButton();
    setupSmoothingToggle();
    setupShareButton();
    setupInteractionTracking();
    document.getElementById("downloadCSVBtn").addEventListener("click", () => exportData("csv"));
    document.getElementById("downloadXLSXBtn").addEventListener("click", () => exportData("xlsx"));

    await revealPromise;
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    document.getElementById('loadingOverlay').innerHTML =
      '<div style="color:#900;font-weight:700">Failed to load Supabase data — check connection or table names.</div>';
  }

}

function setupInteractionTracking() {
  // Track "How to Use" section interactions
  const howToUseDetails = document.querySelector('details');
  if (howToUseDetails) {
    howToUseDetails.addEventListener('toggle', () => {
      if (howToUseDetails.open) {
        trackAnalytics('ui_interaction', {
          element: 'how_to_use_section',
          action: 'opened'
        });
      }
    });
  }

  // Track "Group Info" section interactions
  const groupInfoDetails = document.querySelectorAll('details')[1]; // Second details element
  if (groupInfoDetails) {
    groupInfoDetails.addEventListener('toggle', () => {
      if (groupInfoDetails.open) {
        trackAnalytics('ui_interaction', {
          element: 'group_info_section',
          action: 'opened'
        });
      }
    });
  }

  // Track smoothing toggle clicks
  const smoothBtn = document.getElementById('toggleSmoothBtn');
  if (smoothBtn) {
    smoothBtn.addEventListener('click', () => {
      trackAnalytics('ui_interaction', {
        element: 'smoothing_toggle',
        action: 'clicked',
        new_state: !smoothLines ? 'enabled' : 'disabled'
      });
    });
  }
}

function setupSmoothingToggle() {
  const btn = document.getElementById('toggleSmoothBtn');
  btn.addEventListener('click', () => {
    smoothLines = !smoothLines;
    window.smoothLines = smoothLines; // Keep window.smoothLines in sync
    btn.textContent = smoothLines ? '🚫 Disable Smoothing' : '✅ Enable Smoothing';
    updateChart();
  });
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => google.charts.setOnLoadCallback(init));
