/**
 * Export and Share Module  
 * Handles data export (CSV, Excel), chart image generation, and share functionality
 * Extracted from v2.2 index.html for modular architecture
 */

function exportData(format = 'csv') {
  const pollutant = document.getElementById('pollutantSelect').value;
  const startYear = +document.getElementById('startYear').value;
  const endYear = +document.getElementById('endYear').value;
  const selectedGroups = getSelectedGroups();
  
  console.log('Export debug:', { pollutant, startYear, endYear, selectedGroups, globalHeadersLength: window.globalHeaders?.length });
  
  if (!pollutant || !selectedGroups.length || !(window.globalHeaders?.length)) {
    console.warn('Export validation failed:', { 
      hasPollutant: !!pollutant, 
      hasGroups: selectedGroups.length > 0, 
      hasHeaders: window.globalHeaders?.length > 0 
    });
    alert('Please select a pollutant and at least one group first.');
    return;
  }

  // Track export analytics
  trackAnalytics('data_export', {
    format: format,
    pollutant: pollutant,
    start_year: startYear,
    end_year: endYear,
    groups: selectedGroups,
    groups_count: selectedGroups.length,
    year_range: endYear - startYear + 1,
    filename: pollutant.replace(/[^a-z0-9_\-]/gi, '_') + '_' + startYear + '-' + endYear + '_comparison'
  });

  // Use the global year keys / labels determined earlier
  const yearsAll = window.globalYears || [];
  const yearKeys = window.globalYearKeys || [];
  const startIdx = yearsAll.indexOf(String(startYear));
  const endIdx = yearsAll.indexOf(String(endYear));
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    alert('Invalid year range.');
    return;
  }
  const years = yearsAll.slice(startIdx, endIdx + 1);
  const keysForYears = yearKeys.slice(startIdx, endIdx + 1);
  const unit = pollutantUnits[pollutant] || '';

  // --- Build rows ---
  const rows = [];
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

  // First row: pollutant and unit
  rows.push([`Pollutant: ${pollutant}`, `Unit: ${unit}`]);
  rows.push([]); // spacer row
  // Header row
  rows.push(['Group', ...years]);


  // Data rows - read values by key for robustness
  selectedGroups.forEach(group => {
    const values = keysForYears.map((k) => {
      // look up the data row for this pollutant and group
      const dataRow = groupedData[pollutant] ? groupedData[pollutant][group] : null;
      const raw = dataRow ? dataRow[k] : null;
      return raw ?? '';
    });
    rows.push([group, ...values]);
  });


  rows.push([]); // spacer
  rows.push([`Downloaded on: ${timestamp}`]);

  // --- Generate and download file ---
  const safePollutant = pollutant.replace(/[^a-z0-9_\-]/gi, '_');
  if (format === 'csv') {
    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${safePollutant}_data.csv`;
    link.click();
  } else if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${safePollutant}_data.xlsx`);
  }
}

// Generate shareable URL with current configuration
function generateShareUrl() {
function generateShareUrl() {
  const pollutantSelect = document.getElementById('pollutantSelect');
  const selectedGroups = getSelectedGroups();
  
  if (!pollutantSelect.value || selectedGroups.length === 0) {
    alert('Please select a pollutant and at least one group before sharing.');
    return null;
  }
  
  // Get pollutant ID
  const pollutantData = pollutantsData.find(pd => 
    (pd.Pollutant || pd.pollutant) === pollutantSelect.value
  );
  
  if (!pollutantData) {
    alert('Unable to find pollutant ID for sharing.');
    return null;
  }
  
  // Get group IDs
  const groupIds = [];
  selectedGroups.forEach(groupName => {
    const groupData = groupsData.find(gd => 
      (gd.Group_Title || gd.group_title) === groupName
    );
    if (groupData) {
      groupIds.push(groupData.id);
    }
  });
  
  if (groupIds.length === 0) {
    alert('Unable to find group IDs for sharing.');
    return null;
  }
  
  // Get year selections
  const startYearSelect = document.getElementById('startYear');
  const endYearSelect = document.getElementById('endYear');
  const startYear = startYearSelect ? startYearSelect.value : null;
  const endYear = endYearSelect ? endYearSelect.value : null;
  
  // Build URL with all parameters
  const baseUrl = window.location.origin + window.location.pathname;
  let shareUrl = `${baseUrl}?pollutant_id=${pollutantData.id}&group_ids=${groupIds.join(',')}`;
  
  // Add year parameters if they are set
  if (startYear) {
    shareUrl += `&start_year=${startYear}`;
  }
  if (endYear) {
    shareUrl += `&end_year=${endYear}`;
  }
  
  return shareUrl;
}

// Setup share button functionality
function setupShareButton() {
  const shareBtn = document.getElementById('shareBtn');
  if (!shareBtn) return;
  
  shareBtn.addEventListener('click', () => {
    const shareUrl = generateShareUrl();
    if (!shareUrl) return;
    
    // Track share usage
    trackAnalytics('share_button_click', {
      pollutant: document.getElementById('pollutantSelect').value,
      group_count: getSelectedGroups().length,
      start_year: document.getElementById('startYear')?.value || '',
      end_year: document.getElementById('endYear')?.value || '',
      year_span: (document.getElementById('endYear')?.value && document.getElementById('startYear')?.value) 
        ? (parseInt(document.getElementById('endYear').value) - parseInt(document.getElementById('startYear').value) + 1) 
        : null
    });
    
    // Show share options
    showShareDialog(shareUrl);
  });
}

// Show share dialog with copy and email options
function showShareDialog(shareUrl) {
  const pollutantName = document.getElementById('pollutantSelect').value;
  const selectedGroups = getSelectedGroups();
  const startYear = document.getElementById('startYear')?.value || '';
  const endYear = document.getElementById('endYear')?.value || '';
  
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  `;
  
  const yearRange = (startYear && endYear) ? ` (${startYear}-${endYear})` : '';
  const title = `${pollutantName} - ${selectedGroups.join(', ')}${yearRange}`;
  const description = `View ${pollutantName} emissions data for ${selectedGroups.length === 1 ? selectedGroups[0] : selectedGroups.length + ' groups'}${yearRange ? ` from ${startYear} to ${endYear}` : ''} using the NAEI Multi-Group Pollutant Viewer.`;
  
  content.innerHTML = `
    <h3 style="margin: 0 0 16px 0; color: #333;">🔗 Share Chart</h3>
    <p style="margin: 0 0 16px 0; color: #666;">Share this specific chart configuration:</p>
    <p style="margin: 0 0 16px 0; font-weight: 600; color: #000;">${title}</p>
    
    <div style="margin: 16px 0;">
      <label style="display: block; margin-bottom: 8px; font-weight: 600;">Shareable URL:</label>
      <div style="display: flex; gap: 8px;">
   <input type="text" id="shareUrlInput" name="shareUrlInput" value="${shareUrl}" readonly 
     style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; background: #f9f9f9;">
        <button id="copyUrlBtn" style="padding: 8px 16px; background: #4CAF50; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
          📋 Copy
        </button>
      </div>
    </div>
    
    <div style="margin: 16px 0;">
      <label style="display: flex; align-items: center; margin-bottom: 12px; cursor: pointer;">
  <input type="checkbox" id="includeImageCheckbox" name="includeImageCheckbox" style="margin-right: 8px;">
        <span style="font-weight: 600;">🖼️ Copy chart image to clipboard for pasting into email</span>
      </label>
      
      <button id="emailShareBtn" style="padding: 12px 20px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; margin-right: 8px;">
        📧 Email Link
      </button>
      <button id="closeShareBtn" style="padding: 12px 20px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
        ❌ Close
      </button>
    </div>
  `;
  
  dialog.appendChild(content);
  document.body.appendChild(dialog);
  
  // Copy URL functionality
  content.querySelector('#copyUrlBtn').addEventListener('click', async () => {
    const input = content.querySelector('#shareUrlInput');
    try {
      await navigator.clipboard.writeText(shareUrl);
      const btn = content.querySelector('#copyUrlBtn');
      btn.textContent = '✅ Copied!';
      btn.style.background = '#4CAF50';
      
      trackAnalytics('share_url_copied', {
        pollutant: pollutantName,
        group_count: selectedGroups.length,
        start_year: startYear,
        end_year: endYear,
        has_year_range: !!(startYear && endYear)
      });
      
      setTimeout(() => {
        btn.textContent = '📋 Copy';
        btn.style.background = '#4CAF50';
      }, 2000);
    } catch (err) {
      // Fallback for older browsers
      input.select();
      document.execCommand('copy');
      alert('URL copied to clipboard!');
    }
  });
  
  // Email sharing functionality
  content.querySelector('#emailShareBtn').addEventListener('click', async () => {
    const includeImage = content.querySelector('#includeImageCheckbox').checked;
    
    // Create detailed email content
    const subject = encodeURIComponent(`NAEI Emissions Data: ${pollutantName} ${yearRange}`);
    
    let emailBody = `I'm sharing NAEI emissions data for ${pollutantName}${yearRange ? ` from ${startYear} to ${endYear}` : ''}.\n\n`;
    emailBody += `Groups included:\n`;
    selectedGroups.forEach((group, index) => {
      emailBody += `${index + 1}. ${group}\n`;
    });
    emailBody += `\n`;
    
    if (includeImage) {
      try {
        // Generate comprehensive chart image (same as PNG download)
        const chartImageData = await generateChartImage();
        
        // Copy to clipboard
        if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
          const blob = dataURLtoBlob(chartImageData);
          const clipboardItem = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([clipboardItem]);
          
          emailBody += `🖼️ Chart Image:\n`;
          emailBody += `The complete chart image (including title, legend, and CIC logo) has been copied to your clipboard.\n`;
          emailBody += `You can now paste it directly into your email.\n\n`;
        } else {
          emailBody += `📋 Chart Image:\n`;
          emailBody += `Your browser doesn't support automatic clipboard copying.\n`;
          emailBody += `Please use the "⬇️ Download Chart as PNG" button to get the chart image.\n\n`;
        }
        
      } catch (error) {
        console.warn('Could not generate chart image:', error);
        emailBody += `🖼️ Chart Image:\n`;
        emailBody += `Chart image could not be generated automatically.\n`;
        emailBody += `Please use the "⬇️ Download Chart as PNG" button to get the chart image.\n\n`;
      }
    }
    
    emailBody += `Interactive chart: ${shareUrl}\n\n`;
    emailBody += `Generated by the Chronic Illness Channel NAEI Multi-Group Pollutant Viewer\n`;
    emailBody += `Youtube Channel: http://youtube.com/@chronicillnesschannel`;
    
    const body = encodeURIComponent(emailBody);
    const mailto = `mailto:?subject=${subject}&body=${body}`;
    
    trackAnalytics('share_email_opened', {
      pollutant: pollutantName,
      group_count: selectedGroups.length,
      start_year: startYear,
      end_year: endYear,
      has_year_range: !!(startYear && endYear),
      include_image: includeImage
    });
    
    window.location.href = mailto;
  });
  
  // Close dialog
  const closeDialog = () => {
    document.body.removeChild(dialog);
  };
  
  content.querySelector('#closeShareBtn').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });
  
  // Focus the URL input for easy copying
  setTimeout(() => {
    content.querySelector('#shareUrlInput').select();
  }, 100);
}

// Generate comprehensive chart image for email sharing (same as PNG download)
async function generateChartImage() {
  return new Promise((resolve, reject) => {
    try {
      const pollutant = document.getElementById('pollutantSelect').value;
      if (!chart || !pollutant) {
        reject(new Error('Chart or pollutant not available'));
        return;
      }

      const unit = pollutantUnits[pollutant] || "";

    // Render chart SVG at higher pixel density for better quality in generated images
    const chartContainer = document.getElementById('chart_div');
    const svgEl = chartContainer ? chartContainer.querySelector('svg') : null;
      let img = new Image();
      img.crossOrigin = 'anonymous';

      if (svgEl) {
        try {
          const origW = parseInt(svgEl.getAttribute('width')) || chartContainer.offsetWidth || 800;
          const origH = parseInt(svgEl.getAttribute('height')) || chartContainer.offsetHeight || 400;
          const exportScale = computeSafeExportScale(origW, origH, Math.max(window.devicePixelRatio || 1, EXPORT_MIN_SCALE));
          const cloned = svgEl.cloneNode(true);
          if (!cloned.getAttribute('viewBox')) cloned.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
          cloned.setAttribute('width', Math.round(origW * exportScale));
          cloned.setAttribute('height', Math.round(origH * exportScale));
          // Remove default small year tick labels from the cloned SVG so only our custom labels remain
          try {
            // Centralized pruning helper removes default 4-digit tick labels
            pruneYearsFromSVG(cloned, { debug: true });
          } catch (e) {
            console.warn('Could not prune default year labels from cloned SVG (email export):', e);
          }
          let svgString = new XMLSerializer().serializeToString(cloned);
          try {
            // Final textual pruning to remove any remaining 4-digit year labels
            // but DO NOT remove labels that are explicitly marked data-custom-year.
            svgString = svgString.replace(/<text(?![^>]*data-custom-year)[^>]*>\s*\d{4}\s*<\/text>/g, '');
            svgString = svgString.replace(/<text(?![^>]*data-custom-year)[^>]*>[\s\S]*?<tspan[^>]*>\s*\d{4}\s*<\/tspan>[\s\S]*?<\/text>/g, '');
          } catch (e) { console.warn('Final SVG string pruning failed (email export):', e); }
          const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const url = URL.createObjectURL(svgBlob);
          img.src = url;
        } catch (err) {
          console.warn('SVG export failed, falling back to getImageURI()', err);
          img = new Image();
          img.crossOrigin = 'anonymous';
          try {
            const liveSvg = chartContainer ? chartContainer.querySelector('svg') : null;
            if (liveSvg) {
              try { pruneYearsFromSVG(liveSvg, { debug: false }); } catch (e) { console.warn('pruneYearsFromSVG failed on liveSvg', e); }
            }
          } catch (e) { console.warn('Failed to prune live SVG ticks before fallback:', e); }
          img.src = getCleanChartImageURI(chart) || chart.getImageURI();
          try {
            window.__export_debug = window.__export_debug || {};
            window.__export_debug.last = window.__export_debug.last || {};
            window.__export_debug.last.method = 'bitmap';
          } catch (e) { /* ignore */ }
        }
      } else {
        try {
          const liveSvg = chartContainer ? chartContainer.querySelector('svg') : null;
          if (liveSvg) {
            try { pruneYearsFromSVG(liveSvg, { debug: false }); } catch (e) { console.warn('pruneYearsFromSVG failed on liveSvg', e); }
          }
        } catch (e) { console.warn('Failed to prune live SVG ticks before fallback:', e); }
  img.src = getCleanChartImageURI(chart) || chart.getImageURI();
      }

      img.onload = () => {
        try {
          // --- Measure legend for layout ---
          const legendClone = document.getElementById('customLegend').cloneNode(true);
          legendClone.style.position = 'absolute';
          legendClone.style.visibility = 'hidden';
          const logoSize = 80;
          const padding = 20;
          const maxLegendWidth = Math.max(100, img.width - padding * 2 - logoSize - 20);
          legendClone.style.width = Math.min(800, maxLegendWidth) + 'px';
          document.body.appendChild(legendClone);
          const legendHeight = legendClone.offsetHeight + 10;
          document.body.removeChild(legendClone);

          const titleHeight = 30;
          const footerHeight = 40;

          // --- Determine output size ---
          const unscaledWidth = img.width + padding * 2;
          const unscaledHeight = img.height + titleHeight + legendHeight + footerHeight + padding * 3;

          // --- Create canvas ---
          const canvas = document.createElement('canvas');
          canvas.width = unscaledWidth;
          canvas.height = unscaledHeight;
          const ctx = canvas.getContext('2d');

          // --- Background ---
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, unscaledWidth, unscaledHeight);

          // --- Title ---
          ctx.font = 'bold 18px system-ui, sans-serif';
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.fillText(
            `${pollutant}${unit ? " (" + unit + ")" : ""}`,
            unscaledWidth / 2,
            padding + 15
          );

          // --- Legend ---
          const legendDiv = document.getElementById('customLegend');
          const items = [...legendDiv.querySelectorAll('span')];
          let legendY = padding + 35;
          const legendRowHeight = 22;
          const maxW = unscaledWidth - padding * 2;
          const rowItems = [];
          let row = [], rowW = 0;

          items.forEach((it) => {
            const dot = it.querySelector('span');
            if (!dot) return;
            const text = it.textContent.trim();
            ctx.font = '600 14px system-ui, sans-serif';
            const textW = ctx.measureText(text).width;
            const w = textW + 40;
            if (rowW + w > maxW && row.length) {
              rowItems.push({ row, rowW });
              row = [];
              rowW = 0;
            }
            row.push({ dotColor: dot.style.backgroundColor, text });
            rowW += w;
          });

          if (row.length) rowItems.push({ row, rowW });

          rowItems.forEach(({ row, rowW }) => {
            let x = (unscaledWidth - rowW) / 2;
            row.forEach(({ dotColor, text }) => {
              const faded = text.includes('(No data available)');
              ctx.globalAlpha = faded ? 0.4 : 1.0;
              ctx.beginPath();
              ctx.arc(x + 6, legendY - 5, 6, 0, 2 * Math.PI);
              ctx.fillStyle = dotColor;
              ctx.fill();
              ctx.font = '600 14px system-ui, sans-serif';
              ctx.fillStyle = '#000000';
              ctx.textAlign = 'left';
              ctx.fillText(text, x + 18, legendY);
              ctx.globalAlpha = 1.0;
              x += ctx.measureText(text).width + 40;
            });
            legendY += legendRowHeight;
          });

          // --- Chart image ---
          // Draw rasterized chart image without browser smoothing for crisper lines
          try {
            const prevSmoothing = typeof ctx.imageSmoothingEnabled !== 'undefined' ? ctx.imageSmoothingEnabled : null;
            try { ctx.imageSmoothingEnabled = false; } catch (e) {}
            try { ctx.webkitImageSmoothingEnabled = false; } catch (e) {}
            try { ctx.mozImageSmoothingEnabled = false; } catch (e) {}
            ctx.drawImage(img, padding, legendY + 10);
            if (prevSmoothing !== null) try { ctx.imageSmoothingEnabled = prevSmoothing; } catch (e) {}
          } catch (eS) {
            ctx.drawImage(img, padding, legendY + 10);
          }
          // Erase any small default tick labels baked into the raster image.
          try {
            const chartContainer = document.getElementById('chart_div');
            const chartLayout = chart.getChartLayoutInterface && chart.getChartLayoutInterface();
            if (chartLayout && chartContainer) {
              const chartArea = chartLayout.getChartAreaBoundingBox();
              const tickY = chartArea.top + chartArea.height + 20;
              const tickHeight = 18;
              const containerW = chartContainer.offsetWidth || 1;
              const containerH = chartContainer.offsetHeight || 1;
              const scaleX = (img.width || containerW) / containerW;
              const scaleY = (img.height || containerH) / containerH;
              const rectX = padding + (chartArea.left || 0) * scaleX;
              const rectY = legendY + 10 + tickY * scaleY - tickHeight / 2;
              const rectW = (chartArea.width || containerW) * scaleX;
              const rectH = tickHeight;
              ctx.save();
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(rectX, rectY, rectW, rectH);
              ctx.restore();
            } else {
              ctx.save();
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(padding, legendY + 10 + (img.height || 0) - 30, img.width || 0, 40);
              ctx.restore();
            }
          } catch (e) {
            console.warn('Could not erase small tick area on generated image:', e);
          }

          // --- Logo and footer ---
          const logo = new Image();
          logo.crossOrigin = 'anonymous';
          logo.src = 'CIC - Square - Border - Words - Alpha 360x360.png';

          const finishGeneration = () => {
            const footerText = "© Crown 2025 copyright Defra & DESNZ via naei.energysecurity.gov.uk licensed under the Open Government Licence (OGL).";
            const channelText = "Youtube Channel: youtube.com/@chronicillnesschannel";
            
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillStyle = '#555';
            ctx.textAlign = 'center';
            ctx.fillText(footerText, unscaledWidth / 2, legendY + img.height + 20);
            
            // Draw YouTube channel with bold label
            const channelY = legendY + img.height + 35;
            const boldText = "Youtube Channel: ";
            const normalText = "youtube.com/@chronicillnesschannel";
            
            // Measure text widths for positioning
            ctx.font = 'bold 12px system-ui, sans-serif';
            const boldWidth = ctx.measureText(boldText).width;
            ctx.font = '12px system-ui, sans-serif';
            const normalWidth = ctx.measureText(normalText).width;
            const totalWidth = boldWidth + normalWidth;
            
            // Draw bold part
            ctx.font = 'bold 12px system-ui, sans-serif';
            ctx.fillText(boldText, (unscaledWidth - totalWidth) / 2 + boldWidth / 2, channelY);
            
            // Draw normal part
            ctx.font = '12px system-ui, sans-serif';
            ctx.fillText(normalText, (unscaledWidth - totalWidth) / 2 + boldWidth + normalWidth / 2, channelY);
            
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
          };

          logo.onload = () => {
            try {
              const logoSize = 80;
              ctx.drawImage(logo, unscaledWidth - logoSize - 20, 10, logoSize, logoSize);
              finishGeneration();
            } catch (e) {
              console.warn('Logo failed to draw, continuing without logo:', e);
              finishGeneration();
            }
          };

          logo.onerror = () => {
            console.warn('Logo failed to load, continuing without logo');
            finishGeneration();
          };

        } catch (error) {
          reject(error);
        }
      };

      img.onerror = (e) => {
        reject(new Error('Failed to load chart image for generation'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

// Convert data URL to Blob for clipboard
function dataURLtoBlob(dataURL) {
function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

document.addEventListener('DOMContentLoaded', () => {
  const cleanBtn = document.getElementById('downloadCleanBtn');
  if (!cleanBtn) return;
  cleanBtn.addEventListener('click', async () => {
    try {
      const pollutant = document.getElementById('pollutantSelect').value;
      if (!chart || !pollutant) return alert('Chart not ready');

      const selectedGroups = getSelectedGroups();
      const startYear = +document.getElementById('startYear').value;
      const endYear = +document.getElementById('endYear').value;
      const unit = pollutantUnits[pollutant] || '';

      // compute offscreen pixel size (match exportScale used elsewhere)
      const chartContainer = document.getElementById('chart_div');
      const exportScale = computeSafeExportScale(
        (chartContainer ? chartContainer.offsetWidth : 800),
        (chartContainer ? chartContainer.offsetHeight : 400),
        Math.max(window.devicePixelRatio || 1, EXPORT_MIN_SCALE)
      );
      const offscreenW = Math.round((chartContainer ? chartContainer.offsetWidth : 800) * exportScale);
      const offscreenH = Math.round((chartContainer ? chartContainer.offsetHeight : 400) * exportScale);

      // Build an offscreen chart and get its bitmap URI
      const offscreenResult = await (function getOffscreenURI() {
        return new Promise((resolve, reject) => {
          try {
            const yearsAll = window.globalYears || [];
            const yearKeys = window.globalYearKeys || [];
            const startIdx = yearsAll.indexOf(String(startYear));
            const endIdx = yearsAll.indexOf(String(endYear));
            const years = (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx)
              ? yearsAll.slice(startIdx, endIdx + 1)
              : yearsAll.slice();
            const keysForYears = yearKeys.slice(startIdx, endIdx + 1);

            const chartRows = years.map((y, rowIdx) => {
              const row = [y];
              const key = keysForYears[rowIdx];
              selectedGroups.forEach(g => {
                const dataRow = groupedData[pollutant]?.[g];
                const raw = dataRow ? dataRow[key] : null;
                const val = (raw === null || raw === undefined) ? null : parseFloat(raw);
                row.push(Number.isNaN(val) ? null : val);
              });
              return row;
            });

            const dataTable = new google.visualization.DataTable();
            dataTable.addColumn('string', 'Year');
            selectedGroups.forEach(g => dataTable.addColumn('number', g));
            dataTable.addRows(chartRows);

            // Match on-screen chart appearance: use the same series colors and left margin
            const colors = selectedGroups.map(g => getColorForGroup ? getColorForGroup(g) : null);
            const seriesOptions = {};
            selectedGroups.forEach((g, i) => { seriesOptions[i] = { color: colors[i] || undefined, lineWidth: 3, pointSize: 4 }; });
            // Compute left margin based on max value so label widths match the visible chart
            const maxValue = Math.max(...chartRows.flatMap(r => r.slice(1).filter(v => typeof v === 'number')));
            const labelLength = maxValue ? maxValue.toLocaleString().length : 3;
            const leftMargin = Math.min(100, Math.max(60, labelLength * 10));
            const options = {
              title: '',
              width: offscreenW,
              height: offscreenH,
              legend: 'none',
              hAxis: { textPosition: 'none', gridlines: { color: '#e0e0e0' }, baselineColor: '#666' },
              vAxis: { viewWindow: { min: 0 } },
              series: seriesOptions,
              curveType: (window.__smoothLinesEnabled ? 'function' : 'none'),
              lineWidth: 3,
              pointSize: 4,
              chartArea: { top: 20, left: leftMargin, right: 10, bottom: 60, height: '70%' }
            };

            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.left = '-9999px';
            wrapper.style.top = '0';
            wrapper.style.width = offscreenW + 'px';
            wrapper.style.height = offscreenH + 'px';
            document.body.appendChild(wrapper);

            const tempChart = new google.visualization.LineChart(wrapper);
            google.visualization.events.addListener(tempChart, 'ready', () => {
              try {
                const u = tempChart.getImageURI();
                // Compute label positions using the offscreen chart layout so they align
                // with the offscreen bitmap exactly.
                let labels = [];
                try {
                  const layout = tempChart.getChartLayoutInterface();
                  const chartArea = layout.getChartAreaBoundingBox();
                  const yearsAll = window.globalYears || [];
                  const startIdx = yearsAll.indexOf(String(startYear));
                  const endIdx = yearsAll.indexOf(String(endYear));
                  const years = (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx)
                    ? yearsAll.slice(startIdx, endIdx + 1)
                    : yearsAll.slice();
                  const labelsToShow = calculateYearTicks(years, chartArea.width || (chartContainer.offsetWidth || 300));
                  labels = labelsToShow.map(year => {
                    const yearIndex = years.indexOf(year);
                    if (yearIndex === -1) return null;
                    const x = layout.getXLocation(yearIndex);
                    const y = chartArea.top + chartArea.height + 20; // same baseline logic used elsewhere
                    return { year: year, x: x, y: y };
                  }).filter(Boolean);
                } catch (e) {
                  console.warn('Could not compute offscreen label positions', e);
                }

                setTimeout(() => { try { wrapper.remove(); } catch (e) {} }, 50);
                resolve({ uri: u, labels: labels, width: offscreenW, height: offscreenH });
              } catch (e) { try { wrapper.remove(); } catch (er) {} reject(e); }
            });
            tempChart.draw(dataTable, options);
          } catch (err) { reject(err); }
        });
      })();

      if (!offscreenResult || !offscreenResult.uri) return alert('Could not create clean export image');

      // Compose final PNG from offscreen bitmap and use the returned offscreen label positions
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const padding = 20;
          const titleHeight = 30;
          const footerHeight = 40;
          const unscaledWidth = img.width + padding * 2;
          const unscaledHeight = img.height + titleHeight + footerHeight + padding * 3 + 60; // include legend space

          // Scale for print quality (A4 300dpi target)
          const targetWidth = 3508;
          const scale = Math.max(window.devicePixelRatio || 1, targetWidth / unscaledWidth);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(unscaledWidth * scale);
          canvas.height = Math.round(unscaledHeight * scale);
          const ctx = canvas.getContext('2d');
          ctx.scale(scale, scale);

          // Background and title
          ctx.fillStyle = '#fff'; ctx.fillRect(0,0,unscaledWidth,unscaledHeight);
          ctx.font = 'bold 18px system-ui, sans-serif'; ctx.fillStyle = '#000'; ctx.textAlign = 'center';
          ctx.fillText(`${pollutant}${unit ? ' ('+unit+')' : ''}`, unscaledWidth/2, padding+15);

          // Draw the offscreen chart image (disable smoothing for crisper lines)
          const legendY = padding + 35;
          try {
            const prevSmoothing = typeof ctx.imageSmoothingEnabled !== 'undefined' ? ctx.imageSmoothingEnabled : null;
            try { ctx.imageSmoothingEnabled = false; } catch (e) {}
            try { ctx.webkitImageSmoothingEnabled = false; } catch (e) {}
            try { ctx.mozImageSmoothingEnabled = false; } catch (e) {}
            ctx.drawImage(img, padding, legendY + 10, img.width, img.height);
            if (prevSmoothing !== null) try { ctx.imageSmoothingEnabled = prevSmoothing; } catch (e) {}
          } catch (eS) {
            ctx.drawImage(img, padding, legendY + 10, img.width, img.height);
          }

          // Draw logo (if available)
          const logo = new Image(); logo.crossOrigin = 'anonymous';
          logo.onload = () => { try { const logoSize = 80; ctx.drawImage(logo, unscaledWidth - logoSize - 20, 10, logoSize, logoSize); } catch(e){}; finalize(); };
          logo.onerror = () => finalize();
          logo.src = 'CIC - Square - Border - Words - Alpha 360x360.png';

          function finalize() {
            // Draw footer
            ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#555'; ctx.textAlign = 'center';
            const footerText = "© Crown 2025 copyright Defra & DESNZ via naei.energysecurity.gov.uk licensed under the Open Government Licence (OGL).";
            ctx.fillText(footerText, unscaledWidth/2, legendY + 10 + img.height + 20);

            // Draw larger year labels on top using offscreen chart's computed positions
            try {
              const labels = offscreenResult.labels || [];
              if (labels && labels.length) {
                ctx.fillStyle = '#333';
                ctx.font = '600 16px system-ui, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                labels.forEach(lp => {
                  const xOnImage = padding + (lp.x || 0);
                  const yOnImage = legendY + 10 + (lp.y || 0);
                  ctx.fillText(String(lp.year), xOnImage, yOnImage);
                });
              }
            } catch (e) { console.warn('Could not draw top labels for clean export', e); }

            // Trigger download
            const link = document.createElement('a');
            link.download = `${pollutant.replace(/[^a-z0-9_\-]/gi,'_')}_clean.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link); link.click(); link.remove();
          }

        } catch (err) { console.error('Clean export failed', err); alert('Clean export failed: '+String(err)); }
      };
      img.onerror = (e) => { console.error('Failed to load offscreen image', e); alert('Failed to load offscreen image for export'); };
      // Use the URI returned by the offscreen renderer. Previous code referenced an undefined
      // `uri` variable which caused a ReferenceError.
      if (offscreenResult && offscreenResult.uri) {
        img.src = offscreenResult.uri;
      } else {
        console.error('Download clean PNG: offscreenResult.uri missing', offscreenResult);
        alert('Clean export failed: missing image data');
      }

    } catch (err) {
      console.error('Download clean PNG failed', err);
      alert('Could not create clean PNG: ' + String(err));
    }
  });
});
