/**
 * Chart Renderer Module
 * Handles Google Charts bubble chart rendering
 */

let chart = null;
let currentChartData = null;
let currentOptions = null;
let googleChartsReady = false;
let seriesVisibility = []; // Track which series are visible
let useLogScale = false; // Track whether logarithmic scaling is being used
window.seriesVisibility = seriesVisibility; // Expose for export.js

// Provide a minimal fallback palette when shared Colors module fails to load
if (!window.Colors) {
  console.warn('Colors module not found for bubble chart – using fallback palette.');
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

// Load Google Charts and set up callback
google.charts.load('current', {packages: ['corechart']});
google.charts.setOnLoadCallback(() => {
  googleChartsReady = true;
  console.log('Google Charts loaded successfully');
});

/**
 * Draw bubble chart
 * @param {number} year - Selected year
 * @param {number} pollutantId - Selected pollutant ID
 * @param {Array} groupIds - Array of selected group IDs
 */
function drawBubbleChart(year, pollutantId, groupIds) {
  // Wait for Google Charts to be ready
  if (!googleChartsReady) {
    console.log('Google Charts not ready yet, waiting...');
    google.charts.setOnLoadCallback(() => {
      googleChartsReady = true;
      drawBubbleChart(year, pollutantId, groupIds);
    });
    return;
  }

  // Get data points
  const dataPoints = window.supabaseModule.getScatterData(year, pollutantId, groupIds);
  console.log('Chart renderer: got', dataPoints.length, 'data points');
  if(dataPoints.length > 0) {
    console.log('First data point:', dataPoints[0]);
  }
  
  if (dataPoints.length === 0) {
    console.error('No data points returned!');
    showMessage('No data available for the selected year, pollutant, and groups.', 'error');
    return;
  }

  // Filter data points based on series visibility
  // Ensure visibility array is correctly sized
  if (seriesVisibility.length !== groupIds.length) {
    seriesVisibility = Array(groupIds.length).fill(true);
    window.seriesVisibility = seriesVisibility;
  }

  // Get unique group names to match with visibility array
  const uniqueGroups = [...new Set(dataPoints.map(p => p.groupName))];
  const visibleDataPoints = dataPoints.filter(point => {
    const groupIndex = uniqueGroups.indexOf(point.groupName);
    return groupIndex >= 0 && seriesVisibility[groupIndex];
  });

  console.log(`Filtered ${dataPoints.length} points to ${visibleDataPoints.length} visible points`);

  // Prepare Google DataTable for scatter chart with bubble-like styling
  const data = new google.visualization.DataTable();
  data.addColumn('number', 'Activity Data (TJ)');
  data.addColumn('number', `${window.supabaseModule.getPollutantName(pollutantId)} (${window.supabaseModule.getPollutantUnit(pollutantId)})`);
  data.addColumn({type: 'string', role: 'tooltip'});
  data.addColumn({type: 'string', role: 'style'});

  // Add data rows with emission factor calculation and sizing
  console.log('Adding', visibleDataPoints.length, 'rows to bubble-style scatter chart data');
  
  // Determine conversion factor based on pollutant unit (BEFORE calculating EFs)
  const pollutantUnit = window.supabaseModule.getPollutantUnit(pollutantId);
  let conversionFactor;
  switch(pollutantUnit.toLowerCase()) {
    case 't':
    case 'tonnes':
      conversionFactor = 1000; // t × 10^3 → g/GJ
      break;
    case 'grams international toxic equivalent':
      conversionFactor = 1000; // g × 10^3 → g/GJ (since 1 TJ = 1000 GJ)
      break;
    case 'kilotonne':
    case 'kilotonne/kt co2 equivalent':
    case 'kt co2 equivalent':
      conversionFactor = 1000000; // kt × 10^6 → g/GJ
      break;
    case 'kg':
      conversionFactor = 1; // kg × 10^0 → g/GJ (kg/TJ = g/GJ)
      break;
    default:
      conversionFactor = 1000000; // Default fallback
      console.warn(`Unknown pollutant unit: ${pollutantUnit}, using default conversion`);
  }
  
  // Calculate all EF values first to determine dynamic scale factor (use visible points only)
  const allEFs = visibleDataPoints.map(p => p.EF !== undefined ? p.EF : (p.activityData !== 0 ? (p.pollutantValue / p.activityData) * conversionFactor : 0));
  const maxEF = Math.max(...allEFs);
  const minEF = Math.min(...allEFs.filter(ef => ef > 0)); // Exclude zeros
  
  // Use logarithmic scaling for bubble sizes when EF range is extreme (>1000x)
  // This is standard in atmospheric science and emission inventories
  const efRatio = maxEF / minEF;
  useLogScale = efRatio > 1000; // Update module-level variable
  
  const targetMaxRadius = 90;
  const targetMinRadius = 5;
  
  let scaleFactor;
  if (useLogScale) {
    // Logarithmic scale: bubble area ∝ log10(EF)
    // For log scale with small values (< 1), we work with absolute log values
    // and scale based on the range of log values
    const maxLog = Math.log10(maxEF);
    const minLog = Math.log10(minEF);
    const logRange = maxLog - minLog; // Total range in log space
    
    // Scale factor maps log range to radius range
    // We'll map the full log range to our target radius range
    scaleFactor = (targetMaxRadius - targetMinRadius) / logRange;
    
    console.log(`Using LOGARITHMIC scaling (ratio ${efRatio.toFixed(0)}:1). Range: ${minEF.toExponential(2)} to ${maxEF.toExponential(2)} g/GJ`);
    console.log(`Log range: ${minLog.toFixed(2)} to ${maxLog.toFixed(2)}, logRange=${logRange.toFixed(2)}, scaleFactor=${scaleFactor.toFixed(2)}`);
  } else {
    // Linear scale: bubble area ∝ EF
    scaleFactor = targetMaxRadius / Math.sqrt(maxEF);
    const minRadiusLinear = scaleFactor * Math.sqrt(minEF);
    
    if (minRadiusLinear < targetMinRadius) {
      scaleFactor = targetMinRadius / Math.sqrt(minEF);
    }
    
    console.log(`Using LINEAR scaling (ratio ${efRatio.toFixed(1)}:1). Range: ${minEF.toFixed(2)} to ${maxEF.toFixed(2)} g/GJ`);
  }  
  visibleDataPoints.forEach((point, index) => {
    const color = window.Colors.getColorForGroup(point.groupName);

    // Use Emission Factor (EF) directly for bubble size
    // If EF is already provided in point, use it; otherwise, calculate
    const emissionFactor = point.EF !== undefined ? point.EF : (point.activityData !== 0 ? (point.pollutantValue / point.activityData) * conversionFactor : 0);

    // Calculate bubble size using logarithmic or linear scaling
    let radius;
    if (useLogScale && emissionFactor > 0) {
      // Logarithmic: map position in log space to radius
      const logEF = Math.log10(emissionFactor);
      const logMin = Math.log10(minEF);
      const logMax = Math.log10(maxEF);
      
      // Position in log space (0 to 1)
      const logPosition = (logEF - logMin) / (logMax - logMin);
      
      // Map to radius range (min to max)
      radius = targetMinRadius + (logPosition * (targetMaxRadius - targetMinRadius));
    } else {
      // Linear: radius ∝ sqrt(EF)
      const sqrtEF = Math.sqrt(emissionFactor);
      radius = scaleFactor * sqrtEF;
    }
    
    // Use calculated radius directly
    const normalizedRadius = radius;

    // Debug logging for first few points
    if (index < 3) {
      console.log(`Point ${index}: ${point.groupName}, EF=${emissionFactor.toExponential(2)}, radius=${radius.toFixed(2)}`);
    }

    // All EF values are converted to g/GJ
    // Use more decimal places for very small values
    const efDisplay = emissionFactor < 0.01 ? emissionFactor.toFixed(8) : emissionFactor.toFixed(2);
    const tooltip = `${point.groupName}\nActivity: ${point.activityData.toLocaleString()} TJ\nEmissions: ${point.pollutantValue.toLocaleString()} ${pollutantUnit}\nEmission Factor: ${efDisplay} g/GJ`;

    data.addRow([
      point.activityData, // X-axis
      point.pollutantValue, // Y-axis
      tooltip,
      `point {fill-color: ${color}; size: ${Math.round(normalizedRadius)};}`
    ]);
  });
  
  console.log('Chart data rows added, now drawing chart...');

  // Chart options
  const pollutantName = window.supabaseModule.getPollutantName(pollutantId);
  // pollutantUnit already declared above
  const activityUnit = window.supabaseModule.getPollutantUnit(window.supabaseModule.activityDataId);
  
  console.log('Chart renderer - Pollutant Name:', pollutantName);
  console.log('Chart renderer - Pollutant Unit:', pollutantUnit);
  console.log('Chart renderer - Activity Unit:', activityUnit);
  
  // Format title and axis labels for bubble chart
  const chartTitle = `${pollutantName} - ${pollutantUnit}`;
  const yAxisTitle = `${pollutantName} - ${pollutantUnit}`;
  const xAxisTitle = activityUnit ? `Activity Data - ${activityUnit}` : 'Activity Data - TJ';

  // Create a custom title element with two lines
  const chartTitleElement = document.getElementById('chartTitle');
  if (chartTitleElement) {
    chartTitleElement.style.display = 'block';
    chartTitleElement.style.textAlign = 'center';
    chartTitleElement.style.marginBottom = '10px';

    // Add year as the first line
    const yearElement = document.createElement('div');
    yearElement.style.fontSize = '28px';
    yearElement.style.fontWeight = 'bold';
    yearElement.textContent = `${year}`;

    // Add pollutant and emission unit as the second line
    const pollutantElement = document.createElement('div');
    pollutantElement.style.fontSize = '20px';
    pollutantElement.textContent = `${yAxisTitle}`;

    // Clear previous content and append new elements
    chartTitleElement.innerHTML = '';
    chartTitleElement.appendChild(yearElement);
    chartTitleElement.appendChild(pollutantElement);
  }

  // Set a fixed height for the chart container to prevent layout shifts (same as line chart)
  const chartDiv = document.getElementById('chart_div');
  if (!chartDiv) {
    console.error('Missing #chart_div element');
    showMessage('Chart container not found', 'error');
    return;
  }
  
  chartDiv.style.minHeight = '800px';

  // Prepare colors for each group (use visible data points only)
  const colors = [];
  const uniqueGroupsForColors = [...new Set(visibleDataPoints.map(point => point.groupName))];
  uniqueGroupsForColors.forEach(groupName => {
    colors.push(window.Colors.getColorForGroup(groupName));
  });

  // Calculate axis ranges with padding for bubbles (use visible data points only)
  const activityValues = visibleDataPoints.map(p => p.activityData);
  const pollutantValues = visibleDataPoints.map(p => p.pollutantValue);
  
  const maxActivity = Math.max(...activityValues);
  const maxPollutant = Math.max(...pollutantValues);
  
  // Add extra padding to prevent bubble clipping (bubbles need radius space)
  const activityPadding = maxActivity * 0.25;
  const pollutantPadding = maxPollutant * 0.25;
  
  // Get minimum values to add left/bottom padding
  const minActivity = Math.min(...activityValues);
  const minPollutant = Math.min(...pollutantValues);
  
  // Calculate minimum offsets (ensure bubbles don't start at the very edge)
  const activityMinOffset = Math.max(0, minActivity - (maxActivity * 0.05));
  const pollutantMinOffset = Math.max(0, minPollutant - (maxPollutant * 0.05));

  currentOptions = {
    legend: { position: 'none' }, // Remove Google Chart legend
    title: '', // Invisible Google Chart title
    titleTextStyle: {
      fontSize: 0 // Minimize title space
    },
    width: '100%',
    chartArea: {
      top: 85,  // Slightly increased to avoid gridline at edge
      bottom: 120,
      left: 150,
      right: 80,
      backgroundColor: 'transparent'
    },
    backgroundColor: 'transparent',
    tooltip: { trigger: 'focus' }, // Enable tooltips on hover
    hAxis: {
      title: xAxisTitle,
      format: 'short',
      gridlines: {
        color: '#cccccc',  // Darker grey for major gridlines
        count: 5
      },
      minorGridlines: {
        count: 4  // 4 minor gridlines between each major gridline
      },
      titleTextStyle: {
        italic: false
      },
      viewWindow: {
        min: 0,
        max: maxActivity + activityPadding
      }
    },
    vAxis: {
      title: yAxisTitle,
      gridlines: {
        color: '#cccccc',  // Darker grey for major gridlines
        count: 5
      },
      minorGridlines: {
        count: 4  // 4 minor gridlines between each major gridline
      },
      viewWindow: {
        min: 0,
        max: maxPollutant + pollutantPadding
      }
    },
    colors: colors,
    colorAxis: {
      legend: {
        position: 'none'
      }
    }
  };

  // Store current chart data for export
  currentChartData = {
    data: data,
    options: currentOptions,
    year: year,
    pollutantId: pollutantId,
    pollutantName: pollutantName,
    pollutantUnit: pollutantUnit,
    groupIds: groupIds,
    dataPoints: dataPoints
  };

  // Draw chart using ScatterChart with bubble-like styling to avoid clipping
  if (!chart) {
    chart = new google.visualization.ScatterChart(chartDiv);

    // Add listener for chart render completion (for loading management)
    google.visualization.events.addListener(chart, 'ready', () => {
      console.log('Google Charts ready event fired!');
      if (window.chartRenderCallback) {
        window.chartRenderCallback();
        window.chartRenderCallback = null; // Clear callback after use
      }
    });
    
    // Add error listener
    google.visualization.events.addListener(chart, 'error', (err) => {
      console.error('Google Charts error:', err);
    });
    
    // Add select listener to immediately clear any selections
    google.visualization.events.addListener(chart, 'select', () => {
      chart.setSelection([]);
    });
  }
  
  try {
    chart.draw(data, currentOptions);
    console.log('chart.draw() completed without error');

  registerTooltipPositionHandlers(chart, data);

    // Create custom legend after chart is drawn
    createCustomLegend(chart, data, groupIds, dataPoints);
    
    // Add bubble size explanation text overlay at top of chart
    addBubbleExplanationOverlay();

    // Ensure chart region fades in once Google Charts has drawn content
    if (!chartDiv.classList.contains('visible')) {
      chartDiv.classList.add('visible');
    }
  } catch (err) {
    console.error('Error calling chart.draw():', err);
  }
  
  
  // Show chart with animation (add visible class to wrapper, not chart_div)
  const chartWrapper = document.querySelector('.chart-wrapper');
  if (chartWrapper) {
    chartWrapper.classList.add('visible');
  }  // Enable share and download buttons
  const shareBtnEl = document.getElementById('shareBtn');
  const downloadBtnEl = document.getElementById('downloadBtn');
  const downloadCSVBtnEl = document.getElementById('downloadCSVBtn');
  const downloadXLSXBtnEl = document.getElementById('downloadXLSXBtn');
  
  if (shareBtnEl) shareBtnEl.disabled = false;
  if (downloadBtnEl) downloadBtnEl.disabled = false;
  if (downloadCSVBtnEl) downloadCSVBtnEl.disabled = false;
  if (downloadXLSXBtnEl) downloadXLSXBtnEl.disabled = false;

  clearMessage();
}

/**
 * Create a custom legend for the scatter chart
 * @param {Object} chart - Google Chart instance
 * @param {Object} data - Google DataTable instance
 * @param {Array} groupIds - Array of selected group IDs
 */
function createCustomLegend(chart, data, groupIds, dataPoints) {
  const legendContainer = document.getElementById('customLegend');
  if (!legendContainer) {
    console.error('Missing #customLegend element');
    return;
  }

  legendContainer.innerHTML = ''; // Clear existing legend
  legendContainer.style.display = 'flex';
  legendContainer.style.justifyContent = 'center';
  legendContainer.style.flexWrap = 'wrap';
  legendContainer.style.gap = '10px';

  // Ensure visibility array is correctly sized
  if (seriesVisibility.length !== groupIds.length) {
    seriesVisibility = Array(groupIds.length).fill(true);
    window.seriesVisibility = seriesVisibility; // Update window reference
  }

  // Get unique group names
  const uniqueGroups = [...new Set(dataPoints.map(p => p.groupName))];

  uniqueGroups.forEach((groupName, index) => {
    const legendItem = document.createElement('span');
    legendItem.style.display = 'inline-flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.cursor = 'pointer';
    legendItem.style.fontWeight = '600';
    legendItem.style.margin = '5px 10px';
    const baseColor = window.Colors.getColorForGroup(groupName);

    const colorCircle = document.createElement('span');
    colorCircle.style.display = 'inline-block';
    colorCircle.style.backgroundColor = baseColor;
    colorCircle.style.width = '12px';
    colorCircle.style.height = '12px';
    colorCircle.style.borderRadius = '50%';
    colorCircle.style.marginRight = '8px';

    const label = document.createTextNode(groupName);

    legendItem.appendChild(colorCircle);
    legendItem.appendChild(label);

    const updateLegendAppearance = (isVisible) => {
      legendItem.style.opacity = isVisible ? '1' : '0.4';
      legendItem.style.color = isVisible ? '#000' : '#888';
      colorCircle.style.backgroundColor = isVisible ? baseColor : '#cccccc';
    };

    updateLegendAppearance(seriesVisibility[index]);

    // Add click handler to toggle visibility
    legendItem.addEventListener('click', () => {
      seriesVisibility[index] = !seriesVisibility[index];
      window.seriesVisibility = seriesVisibility; // Update window reference
      
      // Update legend appearance immediately
      updateLegendAppearance(seriesVisibility[index]);
      
      // Prevent all-series-hidden state (re-enable if user hides last one)
      if (!seriesVisibility.some(Boolean)) {
        seriesVisibility[index] = true;
        updateLegendAppearance(true);
      }
      
      // Redraw chart with updated visibility
      const currentData = window.ChartRenderer.getCurrentChartData();
      if (currentData) {
        window.ChartRenderer.drawBubbleChart(
          currentData.year,
          currentData.pollutantId,
          currentData.groupIds
        );
      }
    });

    legendContainer.appendChild(legendItem);
  });
}

function registerTooltipPositionHandlers(chartInstance, dataTable) {
  if (!chartInstance) return;

  if (!chartInstance.__tooltipHandlers) {
    chartInstance.__tooltipHandlers = [];
  }

  if (chartInstance.__tooltipHandlers.length) {
    chartInstance.__tooltipHandlers.forEach(handlerId => {
      google.visualization.events.removeListener(handlerId);
    });
    chartInstance.__tooltipHandlers = [];
  }

  const mouseOverHandler = google.visualization.events.addListener(chartInstance, 'onmouseover', (event) => {
    adjustTooltipForTopBubbles(event, dataTable, chartInstance);
  });
  const mouseOutHandler = google.visualization.events.addListener(chartInstance, 'onmouseout', () => {
    resetTooltipPosition();
  });

  chartInstance.__tooltipHandlers.push(mouseOverHandler, mouseOutHandler);
}

function adjustTooltipForTopBubbles(event, dataTable, chartInstance) {
  if (!event || event.row == null) {
    return;
  }

  requestAnimationFrame(() => {
    const tooltipEl = document.querySelector('.google-visualization-tooltip');
    if (!tooltipEl) {
      return;
    }

    const layout = chartInstance.getChartLayoutInterface();
    if (!layout) {
      return;
    }

    const chartArea = layout.getChartAreaBoundingBox();
    const yValue = dataTable.getValue(event.row, 1);
    const bubbleCenterY = layout.getYLocation(yValue);
    const tooltipHeight = tooltipEl.offsetHeight;
    const topBuffer = 40;
    const downwardOffset = 14;

    tooltipEl.dataset.defaultTop = tooltipEl.style.top || '';
    tooltipEl.dataset.defaultTransform = tooltipEl.style.transform || '';

    if (bubbleCenterY - tooltipHeight <= chartArea.top + topBuffer) {
      const proposedTop = bubbleCenterY + downwardOffset;
      const maxTop = chartArea.top + chartArea.height - tooltipHeight - 10;
      tooltipEl.style.top = `${Math.min(proposedTop, maxTop)}px`;
      tooltipEl.style.transform = 'translate(-50%, 0)';
      tooltipEl.dataset.tooltipAdjusted = 'true';
    } else if (tooltipEl.dataset.tooltipAdjusted === 'true') {
      tooltipEl.style.top = tooltipEl.dataset.defaultTop;
      tooltipEl.style.transform = tooltipEl.dataset.defaultTransform;
      tooltipEl.dataset.tooltipAdjusted = '';
    }
  });
}

function resetTooltipPosition() {
  requestAnimationFrame(() => {
    const tooltipEl = document.querySelector('.google-visualization-tooltip');
    if (tooltipEl && tooltipEl.dataset.tooltipAdjusted === 'true') {
      tooltipEl.style.top = tooltipEl.dataset.defaultTop || '';
      tooltipEl.style.transform = tooltipEl.dataset.defaultTransform || '';
      tooltipEl.dataset.tooltipAdjusted = '';
      tooltipEl.dataset.defaultTop = '';
      tooltipEl.dataset.defaultTransform = '';
    }
  });
}

/**
 * Add bubble size explanation text overlay at top of chart
 */
function addBubbleExplanationOverlay() {
  const chartDiv = document.getElementById('chart_div');
  if (!chartDiv) return;
  
  // Remove existing overlay if present
  const existingOverlay = chartDiv.querySelector('.bubble-explanation-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  // Create overlay div with scale information - positioned ON the chart
  const overlay = document.createElement('div');
  overlay.className = 'bubble-explanation-overlay';
  overlay.style.position = 'absolute';
  overlay.style.top = '15px';  // Top of chart, opposite to x-axis label
  overlay.style.left = '50%';
  overlay.style.transform = 'translateX(-50%)';
  overlay.style.textAlign = 'center';
  overlay.style.fontSize = '13px';
  overlay.style.color = '#666';
  overlay.style.lineHeight = '1.4';
  overlay.style.pointerEvents = 'none'; // Allow clicks to pass through
  overlay.style.zIndex = '10'; // Ensure it's visible
  overlay.style.maxWidth = '95%'; // Wide container to minimize wrapping
  
  // Update text based on scaling type with natural wrapping like footer
  if (useLogScale) {
    overlay.innerHTML = '<span style="white-space: nowrap;">Bubble size proportional to log₁₀(Emission Factor)</span> <span style="white-space: nowrap;">- logarithmic scale used due to wide EF range</span><br>Hover over bubble to see values';
  } else {
    overlay.innerHTML = '<span style="white-space: nowrap;">Bubble size proportional to Emission Factor</span> <span style="white-space: nowrap;">(area-scaled, radius = √EF)</span><br>Hover over bubble to see values';
  }
  
  // Append to chart_div so it overlays the chart
  chartDiv.appendChild(overlay);
}

/**
 * Display a status message to the user
 * @param {string} message - Message to display
 * @param {string} type - Message type: 'error', 'warning', 'info'
 */
function showMessage(message, type = 'info') {
  let messageDiv = document.getElementById('statusMessage');
  if (!messageDiv) {
    messageDiv = document.createElement('div');
    messageDiv.id = 'statusMessage';
    const chartWrapper = document.querySelector('.chart-wrapper');
    chartWrapper.parentNode.insertBefore(messageDiv, chartWrapper);
  }
  
  messageDiv.className = `status-message ${type}`;
  messageDiv.textContent = message;
  messageDiv.style.display = 'block';
}

/**
 * Clear status message
 */
function clearMessage() {
  const messageDiv = document.getElementById('statusMessage');
  if (messageDiv) {
    messageDiv.style.display = 'none';
  }
}

/**
 * Get current chart data for export
 * @returns {Object} Current chart data
 */
function getCurrentChartData() {
  return currentChartData;
}

/**
 * Get chart instance
 * @returns {Object} Google Chart instance
 */
function getChartInstance() {
  return chart;
}

// Export chart renderer functions
window.ChartRenderer = {
  drawBubbleChart,
  showMessage,
  clearMessage,
  getCurrentChartData,
  getChartInstance
};
