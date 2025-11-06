/**
 * Chart Renderer Module
 * Handles Google Charts scatter chart rendering
 */

let chart = null;
let currentChartData = null;
let currentOptions = null;
let googleChartsReady = false;

// Load Google Charts and set up callback
google.charts.load('current', {packages: ['corechart']});
google.charts.setOnLoadCallback(() => {
  googleChartsReady = true;
  console.log('Google Charts loaded successfully');
});

/**
 * Draw scatter chart
 * @param {number} year - Selected year
 * @param {number} pollutantId - Selected pollutant ID
 * @param {Array} groupIds - Array of selected group IDs
 */
function drawScatterChart(year, pollutantId, groupIds) {
  // Wait for Google Charts to be ready
  if (!googleChartsReady) {
    console.log('Google Charts not ready yet, waiting...');
    google.charts.setOnLoadCallback(() => {
      googleChartsReady = true;
      drawScatterChart(year, pollutantId, groupIds);
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

  // Prepare Google DataTable
  const data = new google.visualization.DataTable();
  data.addColumn('number', 'Activity Data');
  data.addColumn('number', window.supabaseModule.getPollutantName(pollutantId));
  data.addColumn({type: 'string', role: 'tooltip'});
  data.addColumn({type: 'string', role: 'style'});

  // Add data rows with colors
  console.log('Adding', dataPoints.length, 'rows to chart data');
  dataPoints.forEach(point => {
    const color = window.Colors.getColorForGroup(point.groupName);
    const pollutantUnit = window.supabaseModule.getPollutantUnit(pollutantId); // Dynamically fetch pollutant unit
    // Create tooltip with fixed unit for Activity Data and dynamic unit for pollutant
    const tooltip = `${point.groupName}\nActivity: ${point.activityData.toLocaleString()} TJ\nPollutant Value: ${point.pollutantValue.toLocaleString()} ${pollutantUnit}`;
    
    data.addRow([
      point.activityData,
      point.pollutantValue,
      tooltip,
      `point {fill-color: ${color}; size: 8;}`
    ]);
  });
  
  console.log('Chart data rows added, now drawing chart...');

  // Chart options
  const pollutantName = window.supabaseModule.getPollutantName(pollutantId);
  const pollutantUnit = window.supabaseModule.getPollutantUnit(pollutantId);
  const activityUnit = window.supabaseModule.getPollutantUnit(window.supabaseModule.activityDataId);
  
  console.log('Chart renderer - Pollutant Name:', pollutantName);
  console.log('Chart renderer - Pollutant Unit:', pollutantUnit);
  console.log('Chart renderer - Activity Unit:', activityUnit);
  
  // Format title and axis labels with hyphens and spaces
  const chartTitle = `${pollutantName} - ${pollutantUnit}`;
  const yAxisTitle = chartTitle;
  const xAxisTitle = activityUnit ? `Activity Data - ${activityUnit}` : 'Activity Data';

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

  // Calculate dynamic height based on window size
  const chartHeight = Math.max(500, window.innerHeight * 0.8);

  const chartDiv = document.getElementById('chart_div');
  if (!chartDiv) {
    console.error('Missing #chart_div element');
    showMessage('Chart container not found', 'error');
    return;
  }

  currentOptions = {
    legend: { position: 'none' }, // Remove Google Chart legend
    title: '', // Invisible Google Chart title
    titleTextStyle: {
      fontSize: 0 // Minimize title space
    },
    chartArea: {
      top: 50,
      bottom: 50,
      left: '10%',
      width: '80%',
      height: '70%'
    },
    height: chartHeight,
    hAxis: {
      title: xAxisTitle,
      minValue: 0,
      format: 'short',
      gridlines: {
        count: 5
      },
      titleTextStyle: {
        italic: false
      }
    },
    vAxis: {
      title: yAxisTitle,
      minValue: 0,
    }
  };

  // Store current chart data for export
  currentChartData = {
    data: data,
    options: currentOptions,
    year: year,
    pollutantId: pollutantId,
    pollutantName: pollutantName,
    groupIds: groupIds,
    dataPoints: dataPoints
  };

  // Draw chart
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
  }
  
  try {
    chart.draw(data, currentOptions);
    console.log('chart.draw() completed without error');

    // Create custom legend after chart is drawn
    createCustomLegend(chart, data, groupIds);
  } catch (err) {
    console.error('Error calling chart.draw():', err);
  }
  
  // Show chart with animation (add visible class to wrapper, not chart_div)
  const chartWrapper = document.querySelector('.chart-wrapper');
  if (chartWrapper) {
    chartWrapper.classList.add('visible');
  }
  
  // Enable share and download buttons
  const shareBtnEl = document.getElementById('shareBtn');
  const downloadBtnEl = document.getElementById('downloadBtn');
  if (shareBtnEl) shareBtnEl.disabled = false;
  if (downloadBtnEl) downloadBtnEl.disabled = false;

  clearMessage();
}

/**
 * Create a custom legend for the scatter chart
 * @param {Object} chart - Google Chart instance
 * @param {Object} data - Google DataTable instance
 * @param {Array} groupIds - Array of selected group IDs
 */
function createCustomLegend(chart, data, groupIds) {
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

  groupIds.forEach((groupId, index) => {
    const groupName = data.getValue(index, 2).split('\n')[0]; // Extract only the group name

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.style.display = 'flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.cursor = 'pointer';
    legendItem.style.fontWeight = 'bold';
    legendItem.style.margin = '1px';

    const colorCircle = document.createElement('span');
    colorCircle.style.backgroundColor = window.Colors.getColorForGroup(groupName);
    colorCircle.style.width = '12px';
    colorCircle.style.height = '12px';
    colorCircle.style.borderRadius = '50%';
    colorCircle.style.marginRight = '8px';

    const label = document.createElement('span');
    label.textContent = groupName;

    legendItem.appendChild(colorCircle);
    legendItem.appendChild(label);

    legendItem.addEventListener('click', () => {
      const series = chart.getOption('series');
      series[index].visibleInLegend = !series[index].visibleInLegend;
      chart.setOption('series', series);
      chart.draw(data, currentOptions);
    });

    legendContainer.appendChild(legendItem);
  });
}

/**
 * Show a status message
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
  drawScatterChart,
  showMessage,
  clearMessage,
  getCurrentChartData,
  getChartInstance
};
