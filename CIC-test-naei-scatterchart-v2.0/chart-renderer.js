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
  
  if (dataPoints.length === 0) {
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
  dataPoints.forEach(point => {
    const color = window.Colors.getColorForGroup(point.groupName);
    const tooltip = `${point.groupName}\nActivity: ${point.activityData.toLocaleString()}\n${window.supabaseModule.getPollutantName(pollutantId)}: ${point.pollutantValue.toLocaleString()}`;
    
    data.addRow([
      point.activityData,
      point.pollutantValue,
      tooltip,
      `point {fill-color: ${color}; size: 8;}`
    ]);
  });

  // Chart options
  const pollutantName = window.supabaseModule.getPollutantName(pollutantId);
  const pollutantUnit = window.supabaseModule.getPollutantUnit(pollutantId);
  const activityUnit = window.DataLoader.getPollutantUnit(window.DataLoader.activityDataId);

  currentOptions = {
    title: `${pollutantName} vs Activity Data (${year})`,
    hAxis: {
      title: `Activity Data${activityUnit ? ' (' + activityUnit + ')' : ''}`,
      minValue: 0,
      format: 'short'
    },
    vAxis: {
      title: `${pollutantName}${pollutantUnit ? ' (' + pollutantUnit + ')' : ''}`,
      minValue: 0,
      format: 'short'
    },
    legend: 'none',
    pointSize: 8,
    tooltip: {isHtml: false},
    chartArea: {width: '75%', height: '70%'},
    backgroundColor: '#ffffff',
    colors: window.Colors.distinctPalette
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
  const chartDiv = document.getElementById('chart_div');
  if (!chart) {
    chart = new google.visualization.ScatterChart(chartDiv);
    
    // Add listener for chart render completion (for loading management)
    google.visualization.events.addListener(chart, 'ready', () => {
      if (window.chartRenderCallback) {
        console.log('Scatter chart finished rendering');
        window.chartRenderCallback();
        window.chartRenderCallback = null; // Clear callback after use
      }
    });
  }
  
  chart.draw(data, currentOptions);
  
  // Update chart title
  document.getElementById('chartTitle').textContent = `${pollutantName} vs Activity Data (${year})`;
  
  // Show chart with animation
  chartDiv.classList.add('visible');
  
  // Enable share and download buttons
  document.getElementById('shareBtn').disabled = false;
  document.getElementById('downloadBtn').disabled = false;

  // Track analytics
  if (window.Analytics && supabase) {
    window.Analytics.trackAnalytics(supabase, 'scatter_chart_drawn', {
      year: year,
      pollutant: pollutantName,
      group_count: groupIds.length
    });
  }

  clearMessage();
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
