/**
 * Export and Share Module
 * Handles PNG export and share functionality for scatter charts
 */

const EXPORT_MIN_SCALE = 16;
const EXPORT_MAX_DIM = 16000;
const EXPORT_MAX_PIXELS = 100_000_000;

/**
 * Compute a safe export scale
 */
function computeSafeExportScale(origW, origH, desiredScale) {
  if (!origW || !origH || !isFinite(desiredScale) || desiredScale <= 0) return 1;
  const maxDimScale = Math.min(EXPORT_MAX_DIM / origW, EXPORT_MAX_DIM / origH);
  const maxAreaScale = Math.sqrt(EXPORT_MAX_PIXELS / (origW * origH));
  const allowed = Math.max(1, Math.min(desiredScale, maxDimScale, maxAreaScale));
  if (allowed < desiredScale) {
    console.warn(`Export scale ${desiredScale} reduced to ${allowed} to avoid huge canvas`);
  }
  return allowed;
}

/**
 * Generate chart image as PNG
 * @returns {Promise<string>} Base64 encoded PNG data URL
 */
async function generateChartImage() {
  return new Promise((resolve, reject) => {
    const chart = window.ChartRenderer.getChartInstance();
    const chartData = window.ChartRenderer.getCurrentChartData();
    
    if (!chart || !chartData) {
      reject(new Error('No chart available to export'));
      return;
    }

    const chartDiv = document.getElementById('chart_div');
    const origW = chartDiv.offsetWidth || 1200;
    const origH = chartDiv.offsetHeight || 800;
    
    const desiredScale = Math.max(window.devicePixelRatio || 1, EXPORT_MIN_SCALE);
    const scale = computeSafeExportScale(origW, origH, desiredScale);
    
    const exportW = Math.round(origW * scale);
    const exportH = Math.round(origH * scale);

    // Create temporary chart for high-res export
    const tempDiv = document.createElement('div');
    tempDiv.style.width = exportW + 'px';
    tempDiv.style.height = exportH + 'px';
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-99999px';
    tempDiv.style.top = '-99999px';
    document.body.appendChild(tempDiv);

    const tempChart = new google.visualization.ScatterChart(tempDiv);
    
    // Clone and adjust options for export
    const exportOptions = JSON.parse(JSON.stringify(chartData.options));
    exportOptions.width = exportW;
    exportOptions.height = exportH;
    exportOptions.chartArea = exportOptions.chartArea || {};
    exportOptions.chartArea.width = '75%';
    exportOptions.chartArea.height = '70%';

    google.visualization.events.addListener(tempChart, 'ready', function() {
      try {
        const uri = tempChart.getImageURI();
        document.body.removeChild(tempDiv);
        resolve(uri);
      } catch (error) {
        document.body.removeChild(tempDiv);
        reject(error);
      }
    });

    try {
      tempChart.draw(chartData.data, exportOptions);
    } catch (error) {
      document.body.removeChild(tempDiv);
      reject(error);
    }
  });
}

/**
 * Download chart as PNG file
 */
async function downloadChartPNG() {
  try {
    const chartData = window.ChartRenderer.getCurrentChartData();
    if (!chartData) {
      alert('No chart available to download');
      return;
    }

    const imageData = await generateChartImage();
    const link = document.createElement('a');
    const filename = `${chartData.pollutantName.replace(/[^a-z0-9_\-]/gi, '_')}_vs_Activity_${chartData.year}.png`;
    link.download = filename;
    link.href = imageData;
    link.click();

    // Track analytics
    if (window.Analytics && supabase) {
      window.Analytics.trackAnalytics(supabase, 'scatter_chart_downloaded', {
        year: chartData.year,
        pollutant: chartData.pollutantName,
        group_count: chartData.groupIds.length,
        filename: filename
      });
    }
  } catch (error) {
    console.error('Failed to download chart:', error);
    alert('Failed to download chart: ' + error.message);
  }
}

/**
 * Convert data URL to Blob
 */
function dataURLtoBlob(dataURL) {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Show share dialog
 */
function showShareDialog() {
  const chartData = window.ChartRenderer.getCurrentChartData();
  if (!chartData) {
    alert('No chart available to share');
    return;
  }

  // Build shareable URL with parameters (preserve literal commas)
  const query = `year=${chartData.year}&pollutant_id=${chartData.pollutantId}&group_ids=${chartData.groupIds.join(',')}`;
  const shareUrl = window.location.origin + window.location.pathname + '?' + query;
  
  const title = `${chartData.pollutantName} vs Activity Data (${chartData.year})`;

  // Create dialog
  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay';
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      document.body.removeChild(dialog);
    }
  };

  const content = document.createElement('div');
  content.className = 'modal-content';
  content.innerHTML = `
    <h3 style="margin: 0 0 16px 0; color: #333;">🔗 Share Chart</h3>
    <p style="margin: 0 0 16px 0; color: #666;">Share this specific chart configuration:</p>
    <p style="margin: 0 0 16px 0; font-weight: 600; color: #000;">${title}</p>
    
    <div style="margin: 16px 0;">
      <label style="display: block; margin-bottom: 8px; font-weight: 600;">Shareable URL:</label>
      <div style="display: flex; gap: 8px;">
        <input type="text" id="shareUrlInput" value="${shareUrl}" readonly 
          style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; background: #f9f9f9;">
        <button id="copyUrlBtn" style="padding: 8px 16px; background: #9C27B0; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; min-width: 130px;">
          📋 Copy URL
        </button>
      </div>
    </div>
    
    <div style="margin: 16px 0;">
      <button id="copyPngBtn" style="padding: 10px 16px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%;">
        🖼️ Copy Chart Image as PNG to clipboard
      </button>
    </div>
    
    <div style="margin: 16px 0; text-align: right;">
      <button id="closeBtn" style="padding: 8px 16px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
        Close
      </button>
    </div>
  `;
  
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  // Copy URL functionality
  content.querySelector('#copyUrlBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      const btn = content.querySelector('#copyUrlBtn');
      const originalText = btn.textContent;
      btn.textContent = '✅ Copied!';
      btn.style.background = '#4CAF50';
      
      if (window.Analytics && supabase) {
        window.Analytics.trackAnalytics(supabase, 'share_url_copied', {
          year: chartData.year,
          pollutant: chartData.pollutantName,
          group_count: chartData.groupIds.length
        });
      }
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '#9C27B0';
      }, 2000);
    } catch (err) {
      alert('Failed to copy URL to clipboard');
    }
  });

  // Copy PNG functionality
  content.querySelector('#copyPngBtn').addEventListener('click', async () => {
    const btn = content.querySelector('#copyPngBtn');
    const originalText = btn.textContent;
    const originalBg = btn.style.background;
    
    try {
      btn.disabled = true;
      btn.textContent = 'Generating image...';
      
      const chartImageData = await generateChartImage();
      const blob = dataURLtoBlob(chartImageData);
      
      if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const clipboardItem = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([clipboardItem]);
        
        btn.textContent = '✅ Copied!';
        btn.style.background = '#4CAF50';
        
        if (window.Analytics && supabase) {
          window.Analytics.trackAnalytics(supabase, 'share_png_copied', {
            year: chartData.year,
            pollutant: chartData.pollutantName,
            group_count: chartData.groupIds.length
          });
        }
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = originalBg;
          btn.disabled = false;
        }, 2000);
      } else {
        btn.textContent = originalText;
        btn.style.background = originalBg;
        btn.disabled = false;
        alert('Your browser doesn\'t support copying images to clipboard. Please use the PNG download button instead.');
      }
    } catch (error) {
      console.error('Failed to copy PNG:', error);
      btn.textContent = originalText;
      btn.style.background = originalBg;
      btn.disabled = false;
      alert('Failed to copy chart image: ' + error.message);
    }
  });

  // Close button
  content.querySelector('#closeBtn').addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
}

// Export functions
window.ExportShare = {
  downloadChartPNG,
  showShareDialog,
  generateChartImage
};
