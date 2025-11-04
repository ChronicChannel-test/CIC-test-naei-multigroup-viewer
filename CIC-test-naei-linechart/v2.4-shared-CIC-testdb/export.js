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
  window.supabaseModule.window.supabaseModule.trackAnalytics('data_export', {
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
  const unit = window.pollutantUnits[pollutant] || '';

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
      const dataRow = window.groupedData[pollutant] ? window.groupedData[pollutant][group] : null;
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
  const pollutantSelect = document.getElementById('pollutantSelect');
  const selectedGroups = getSelectedGroups();
  
  if (!pollutantSelect.value || selectedGroups.length === 0) {
    alert('Please select a pollutant and at least one group before sharing.');
    return null;
  }
  
  const pollutants = window.allPollutantsData || [];
  const groups = window.allGroupsData || [];
  
  if (!pollutants.length || !groups.length) {
    alert('Data not yet loaded. Please try again.');
    return null;
  }
  
  // Find pollutant ID
  const pollutantData = pollutants.find(pd => pd.pollutant === pollutantSelect.value);
  
  if (!pollutantData) {
    alert('Unable to find pollutant ID for sharing.');
    return null;
  }
  
  // Find group IDs
  const groupIds = [];
  selectedGroups.forEach(groupName => {
    const groupData = groups.find(gd => gd.group_title === groupName);
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
    window.supabaseModule.trackAnalytics('share_button_click', {
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
    position: relative;
  `;
  
  const yearRange = (startYear && endYear) ? ` (${startYear}-${endYear})` : '';
  const title = `${pollutantName} - ${selectedGroups.join(', ')}${yearRange}`;
  const description = `View ${pollutantName} emissions data for ${selectedGroups.length === 1 ? selectedGroups[0] : selectedGroups.length + ' groups'}${yearRange ? ` from ${startYear} to ${endYear}` : ''} using the NAEI Multi-Group Pollutant Viewer.`;
  
  content.innerHTML = `
    <button id="closeShareBtn" style="position: absolute; top: 16px; right: 16px; padding: 8px 16px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
      ❌ Close
    </button>
    
    <h3 style="margin: 0 0 16px 0; color: #333;">🔗 Share Chart</h3>
    <p style="margin: 0 0 16px 0; color: #666;">Share this specific chart configuration:</p>
    <p style="margin: 0 0 16px 0; font-weight: 600; color: #000;">${title}</p>
    
    <div style="margin: 16px 0;">
      <label style="display: block; margin-bottom: 8px; font-weight: 600;">Shareable URL:</label>
      <div style="display: flex; gap: 8px;">
   <input type="text" id="shareUrlInput" name="shareUrlInput" value="${shareUrl}" readonly 
     style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; background: #f9f9f9;">
        <button id="copyUrlBtn" style="padding: 8px 16px; background: #9C27B0; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; min-width: 130px;">
          📋 Copy URL
        </button>
      </div>
    </div>
    
    <div style="margin: 16px 0;">
      <button id="copyPngBtn" style="padding: 10px 16px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; min-width: 370px;">
        🖼️ Copy Chart Image as PNG to clipboard
      </button>
    </div>
    
    <div style="margin: 16px 0;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <button id="emailShareBtn" style="padding: 12px 20px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; white-space: nowrap;">
          📧 Send Email
        </button>
        <p style="margin: 0; color: #000; font-weight: 600;">Chart will be copied to clipboard<br>for pasting into email</p>
      </div>
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
      const originalText = btn.textContent;
      btn.textContent = '✅ Copied!';
      btn.style.background = '#4CAF50';
      
      window.supabaseModule.trackAnalytics('share_url_copied', {
        pollutant: pollutantName,
        group_count: selectedGroups.length,
        start_year: startYear,
        end_year: endYear,
        has_year_range: !!(startYear && endYear)
      });
      
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '#9C27B0';
      }, 2000);
    } catch (err) {
      // Fallback for older browsers
      input.select();
      document.execCommand('copy');
      alert('URL copied to clipboard!');
    }
  });
  
  // Copy PNG functionality
  content.querySelector('#copyPngBtn').addEventListener('click', async () => {
    const btn = content.querySelector('#copyPngBtn');
    const originalText = btn.textContent;
    const originalBg = btn.style.background;
    
    try {
      btn.disabled = true;
      
      const chartImageData = await generateChartImage();
      const blob = dataURLtoBlob(chartImageData);
      
      if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const clipboardItem = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([clipboardItem]);
        
        btn.textContent = '✅ Copied!';
        btn.style.background = '#4CAF50';
        
        window.supabaseModule.trackAnalytics('share_png_copied', {
          pollutant: pollutantName,
          group_count: selectedGroups.length,
          start_year: startYear,
          end_year: endYear
        });
        
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
  
  // Email sharing functionality
  content.querySelector('#emailShareBtn').addEventListener('click', async () => {
    try {
      // Always copy chart image to clipboard
      const chartImageData = await generateChartImage();
      
      if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const blob = dataURLtoBlob(chartImageData);
        const clipboardItem = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([clipboardItem]);
      }
    } catch (error) {
      console.warn('Could not copy chart image to clipboard:', error);
    }
    
    // Create email content
    const subject = encodeURIComponent(`NAEI Emissions Data: ${pollutantName} ${yearRange}`);
    
    let emailBody = `I'm sharing NAEI emissions data for ${pollutantName}${yearRange ? ` from ${startYear} to ${endYear}` : ''}.\n\n`;
    emailBody += `Groups included:\n`;
    selectedGroups.forEach((group, index) => {
      emailBody += `${index + 1}. ${group}\n`;
    });
    emailBody += `\n`;
    emailBody += `Interactive chart: ${shareUrl}\n\n`;
    emailBody += `Generated by the Chronic Illness Channel NAEI Multi-Group Pollutant Viewer\n`;
    emailBody += `Youtube: http://youtube.com/@chronicillnesschannel`;
    
    const body = encodeURIComponent(emailBody);
    const mailto = `mailto:?subject=${subject}&body=${body}`;
    
    window.supabaseModule.trackAnalytics('share_email_opened', {
      pollutant: pollutantName,
      group_count: selectedGroups.length,
      start_year: startYear,
      end_year: endYear,
      has_year_range: !!(startYear && endYear)
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



/**
 * Creates a high-resolution image from the visible chart's SVG, then composites it.
 * This function adapts the successful logic from v2.2.
 * @param {object} chart - The visible Google Chart instance.
 * @param {HTMLElement} chartContainer - The visible chart's container div.
 * @returns {Promise<string>} Data URI of the final composited chart image.
 */
function getChartImageURI(chart, chartContainer) {
    return new Promise((resolve, reject) => {
        const svgEl = chartContainer ? chartContainer.querySelector('svg') : null;
        if (!svgEl) {
            return reject(new Error("Chart SVG element not found."));
        }

        try {
            const origW = parseInt(svgEl.getAttribute('width')) || chartContainer.offsetWidth || 800;
            const origH = parseInt(svgEl.getAttribute('height')) || chartContainer.offsetHeight || 400;

            // 1. Clone the visible SVG and scale it for high resolution.
            const exportScale = 3; // Use a fixed high-res scale.
            const clonedSvg = svgEl.cloneNode(true);
            if (!clonedSvg.getAttribute('viewBox')) {
                clonedSvg.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
            }
            clonedSvg.setAttribute('width', Math.round(origW * exportScale));
            clonedSvg.setAttribute('height', Math.round(origH * exportScale));

            // 2. Create a blob from the SVG string and generate an object URL.
            const svgString = new XMLSerializer().serializeToString(clonedSvg);
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            const img = new Image();
            img.onload = () => {
                // Once the SVG is loaded into an image, resolve with its data.
                // The composition will happen in generateChartImage.
                resolve({
                    uri: img.src,
                    width: img.width,
                    height: img.height,
                    svgBlobUrl: url // Pass the blob URL for cleanup
                });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("Failed to load SVG as an image."));
            };
            img.src = url;

        } catch (err) {
            reject(new Error(`SVG processing failed: ${err.message}`));
        }
    });
}

// Generate comprehensive chart image for email sharing (same as PNG download)
async function generateChartImage() {
  return new Promise(async (resolve, reject) => {
    let svgBlobUrl = null; // To hold the temporary blob URL for cleanup
    try {
      const pollutant = document.getElementById('pollutantSelect').value;
      if (!chart || !pollutant) {
        return reject(new Error('Chart or pollutant not available'));
      }

      const chartContainer = document.getElementById('chart_div');
      // 1. Get the high-resolution chart URI from the *visible* chart's SVG.
      const { uri, width: chartWidth, height: chartHeight, svgBlobUrl: blobUrl } = await getChartImageURI(chart, chartContainer);
      svgBlobUrl = blobUrl; // Store for cleanup

      if (!uri) {
        return reject(new Error('Failed to generate chart image URI'));
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const unit = window.pollutantUnits[pollutant] || "";
          const padding = 50; 
          const titleHeight = 80;
          const footerHeight = 100;

          // --- 2. Measure the custom HTML legend to determine its height ---
          const legendClone = document.getElementById('customLegend').cloneNode(true);
          legendClone.style.position = 'absolute';
          legendClone.style.visibility = 'hidden';
          legendClone.style.width = (chartWidth - (padding * 2)) + 'px';
          document.body.appendChild(legendClone);
          const legendHeight = legendClone.offsetHeight + 30; // Add margin
          document.body.removeChild(legendClone);

          // --- 3. Set up the final canvas dimensions ---
          const canvas = document.createElement('canvas');
          const canvasWidth = chartWidth + padding * 2;
          const canvasHeight = titleHeight + legendHeight + chartHeight + footerHeight + padding * 2;
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d');

          // --- 4. Draw all elements onto the canvas ---

          // Background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);

          // Title - Larger Font
          ctx.font = 'bold 48px system-ui, sans-serif';
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.fillText(`${pollutant}${unit ? " (" + unit + ")" : ""}`, canvasWidth / 2, padding + 40);

          // Custom Legend - Larger Font and Dots
          // Filter legend items: exclude disabled series, but keep "No data available" ones
          const legendDiv = document.getElementById('customLegend');
          // Get only direct child spans (the legend items), not nested spans (the dots)
          const allItems = [...legendDiv.children].filter(el => el.tagName === 'SPAN');
          
          // Get the current visibility state from main.js
          const visibility = window.seriesVisibility || [];
          
          console.log('PNG Generation - Total legend items:', allItems.length);
          console.log('PNG Generation - Visibility array:', visibility);
          
          // Filter items: include if visible OR if it has no data (keep for reference)
          const items = allItems.filter((item, index) => {
            const hasNoData = item.textContent.includes('(No data available)');
            const isVisible = visibility[index] !== false; // true or undefined = visible
            console.log(`Item ${index}: "${item.textContent.trim()}" - hasNoData: ${hasNoData}, isVisible: ${isVisible}, include: ${isVisible || hasNoData}`);
            return isVisible || hasNoData;
          });
          
          console.log('PNG Generation - Filtered items count:', items.length);
          
          let legendY = padding + titleHeight + 20;
          const legendRowHeight = 45;
          const maxW = canvasWidth - padding * 2;
          const rowItems = [];
          let row = [], rowW = 0;

          items.forEach((it) => {
            const dot = it.querySelector('span');
            if (!dot) return;
            const text = it.textContent.trim();
            ctx.font = '600 32px system-ui, sans-serif'; // Larger font
            const textW = ctx.measureText(text).width;
            const w = textW + 70; // dot size + padding
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
            let x = (canvasWidth - rowW) / 2;
            row.forEach(({ dotColor, text }) => {
              const faded = text.includes('(No data available)');
              ctx.globalAlpha = faded ? 0.5 : 1.0;
              ctx.beginPath();
              ctx.arc(x + 15, legendY - 12, 15, 0, 2 * Math.PI); // Larger dots
              ctx.fillStyle = dotColor;
              ctx.fill();
              ctx.font = '600 32px system-ui, sans-serif';
              ctx.fillStyle = '#000000';
              ctx.textAlign = 'left';
              ctx.fillText(text, x + 40, legendY);
              ctx.globalAlpha = 1.0;
              x += ctx.measureText(text).width + 70;
            });
            legendY += legendRowHeight;
          });

          // Chart Image
          const chartY = padding + titleHeight + legendHeight;
          ctx.drawImage(img, padding, chartY, chartWidth, chartHeight);

          // --- 5. Draw Logo and Footer, then resolve ---
          const logo = new Image();
          logo.crossOrigin = 'anonymous';
          logo.src = '/CIC-test-naei-multigroup-viewer/Shared Resources/images/CIC - Square - Border - Words - Alpha 360x360.png';

          const finishGeneration = () => {
            ctx.font = '28px system-ui, sans-serif';
            ctx.fillStyle = '#555';
            ctx.textAlign = 'center';
            
            // Check if footer needs to wrap
            const fullFooterText = "© Crown 2025 copyright Defra & DESNZ via naei.energysecurity.gov.uk licensed under the Open Government Licence (OGL).";
            const footerTextWidth = ctx.measureText(fullFooterText).width;
            
            let footerY = chartY + chartHeight + 50;
            
            if (footerTextWidth > canvasWidth - 40) {
              // Wrap: split after "gov.uk"
              const footerLine1 = "© Crown 2025 copyright Defra & DESNZ via naei.energysecurity.gov.uk";
              const footerLine2 = "licensed under the Open Government Licence (OGL).";
              ctx.fillText(footerLine1, canvasWidth / 2, footerY);
              ctx.fillText(footerLine2, canvasWidth / 2, footerY + 35);
              footerY += 35; // Adjust for wrapped line
            } else {
              // Single line
              ctx.fillText(fullFooterText, canvasWidth / 2, footerY);
            }

            const channelY = footerY + 40;
            const boldText = "Youtube: "; // Reverted text to 'Youtube:'
            const normalText = "youtube.com/@chronicillnesschannel";
            
            ctx.font = 'bold 28px system-ui, sans-serif';
            const boldWidth = ctx.measureText(boldText).width;
            ctx.font = '28px system-ui, sans-serif';
            const normalWidth = ctx.measureText(normalText).width;
            const totalWidth = boldWidth + normalWidth;
            
            // Check if channel text fits on one line
            if (totalWidth > canvasWidth - 40) {
              // Wrap: put URL on separate line
              ctx.textAlign = 'center';
              ctx.font = 'bold 28px system-ui, sans-serif';
              ctx.fillText(boldText.trim(), canvasWidth / 2, channelY);
              ctx.font = '28px system-ui, sans-serif';
              ctx.fillText(normalText, canvasWidth / 2, channelY + 35);
            } else {
              // Single line
              const startX = (canvasWidth - totalWidth) / 2;
              ctx.textAlign = 'left';
              ctx.font = 'bold 28px system-ui, sans-serif';
              ctx.fillText(boldText, startX, channelY);
              ctx.font = '28px system-ui, sans-serif';
              ctx.fillText(normalText, startX + boldWidth, channelY);
            }
            
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
          };

          logo.onload = () => {
            try {
              const logoSize = 200; // Adjust logo size
              ctx.drawImage(logo, canvasWidth - logoSize - 30, 30, logoSize, logoSize);
            } catch (e) {
              console.warn('Logo failed to draw, continuing without logo:', e);
            }
            finishGeneration();
          };

          logo.onerror = () => {
            console.warn('Logo failed to load, continuing without logo');
            finishGeneration();
          };

        } catch (error) {
          reject(error);
        } finally {
            // Final cleanup of the temporary URL
            if (svgBlobUrl) {
                URL.revokeObjectURL(svgBlobUrl);
            }
        }
      };
      img.onerror = (e) => {
        if (svgBlobUrl) {
            URL.revokeObjectURL(svgBlobUrl);
        }
        reject(new Error('Failed to load chart image for generation'));
      };
      img.src = uri;
    } catch (error) {
      if (svgBlobUrl) {
        URL.revokeObjectURL(svgBlobUrl);
      }
      reject(error);
    }
  });
}

// Convert data URL to Blob for clipboard
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
  const downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
      try {
        const dataURL = await generateChartImage();
        const pollutant = document.getElementById('pollutantSelect').value;
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `${pollutant.replace(/[^a-z0-9_\-]/gi, '_')}_chart.png`;
        link.click();
      } catch (error) {
        console.error('Failed to download chart image:', error);
        alert('Sorry, the chart image could not be downloaded. ' + error.message);
      }
    });
  }

  const cleanBtn = document.getElementById('downloadCleanBtn');
  if (cleanBtn) {
    cleanBtn.style.display = 'none'; // Hide the button
  }
});
