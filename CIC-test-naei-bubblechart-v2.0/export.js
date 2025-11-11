/**
 * Export and Share Module
 * Handles PNG export and share functionality for scatter charts
 */

/**
 * Get chart SVG and convert to high-resolution image URI
 * @param {Object} chart - Google Charts instance
 * @param {HTMLElement} chartContainer - Chart container element
 * @returns {Promise<Object>} Object with uri, width, height, and svgBlobUrl
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

      // Clone the visible SVG and scale it for high resolution
      const exportScale = 3; // Use a fixed high-res scale
      const clonedSvg = svgEl.cloneNode(true);
      if (!clonedSvg.getAttribute('viewBox')) {
        clonedSvg.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
      }
      clonedSvg.setAttribute('width', Math.round(origW * exportScale));
      clonedSvg.setAttribute('height', Math.round(origH * exportScale));

      // Create a blob from the SVG string and generate an object URL
      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
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

/**
 * Generate comprehensive chart image with title, legend, and footer
 * @returns {Promise<string>} Base64 encoded PNG data URL
 */
async function generateChartImage() {
  return new Promise(async (resolve, reject) => {
    let svgBlobUrl = null; // To hold the temporary blob URL for cleanup
    try {
      const chart = window.ChartRenderer.getChartInstance();
      const chartData = window.ChartRenderer.getCurrentChartData();
      
      if (!chart || !chartData) {
        return reject(new Error('Chart not available'));
      }

      const chartContainer = document.getElementById('chart_div');
      
      // Get the high-resolution chart URI from the visible chart's SVG
      const { uri, width: chartWidth, height: chartHeight, svgBlobUrl: blobUrl } = await getChartImageURI(chart, chartContainer);
      svgBlobUrl = blobUrl; // Store for cleanup

      if (!uri) {
        return reject(new Error('Failed to generate chart image URI'));
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        try {
          if (document.fonts && typeof document.fonts.load === 'function') {
            try {
              await document.fonts.load('400 60px "Tiresias Infofont"');
            } catch (fontErr) {
              console.warn('Tiresias font failed to load before export; falling back to system font.', fontErr);
            }
          }

          const pollutantName = chartData.pollutantName;
          const pollutantUnit = chartData.pollutantUnit;
          const year = chartData.year;
          const padding = 50;
          const yearTopOffset = padding + 90;
          const yearHeight = 152; // Space tuned for 120px year label plus additional top offset
          const titleHeight = 162; // Space for enlarged pollutant title
          const subtitleHeight = 40; // Space for subtitle line
          const footerHeight = 190; // Extra room for enlarged footer text

          // Measure the custom HTML legend to determine its height
          const legendClone = document.getElementById('customLegend').cloneNode(true);
          legendClone.style.position = 'absolute';
          legendClone.style.visibility = 'hidden';
          legendClone.style.width = (chartWidth - (padding * 2)) + 'px';
          document.body.appendChild(legendClone);
          const legendHeight = legendClone.offsetHeight + 190; // Extra padding so enlarged legend clears chart
          document.body.removeChild(legendClone);

          // Set up the final canvas dimensions
          const canvas = document.createElement('canvas');
          const canvasWidth = chartWidth + padding * 2;
          const canvasHeight = yearHeight + titleHeight + legendHeight + chartHeight + footerHeight + padding * 2;
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const ctx = canvas.getContext('2d');

          // Draw all elements onto the canvas

          // Background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);

          // Year - Above title (larger than title)
          ctx.font = 'bold 120px system-ui, sans-serif'; // Dramatically larger than title
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.fillText(year, canvasWidth / 2, yearTopOffset);

          // Title - Pollutant name
          ctx.font = 'bold 95px system-ui, sans-serif'; // Larger title while remaining below year size
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.fillText(`${pollutantName}${pollutantUnit ? " - " + pollutantUnit : ""}`, canvasWidth / 2, padding + yearHeight + 55);

          // Custom Legend - Larger Font and Dots (starts after title area)
          const legendDiv = document.getElementById('customLegend');
          // Get only direct child spans (the legend items), not nested spans (the dots)
          const allItems = [...legendDiv.children].filter(el => el.tagName === 'SPAN');
          
          // Get the current visibility state from chart-renderer.js
          const visibility = window.seriesVisibility || [];
          
          console.log('PNG Generation - Total legend items:', allItems.length);
          console.log('PNG Generation - Visibility array:', visibility);
          
          // Filter items: include only if visible
          const items = allItems.filter((item, index) => {
            const isVisible = visibility[index] !== false; // true or undefined = visible
            console.log(`Item ${index}: "${item.textContent.trim()}" - isVisible: ${isVisible}`);
            return isVisible;
          });
          
          console.log('PNG Generation - Filtered items count:', items.length);

          let legendY = padding + yearHeight + 155; // 100px baseline gap below pollutant title
          const legendRowHeight = 92; // Spacing tuned for enlarged legend text
          const maxW = canvasWidth - padding * 2;
          const rowItems = [];
          let row = [], rowW = 0;

          items.forEach((it) => {
            const dot = it.querySelector('span');
            if (!dot) {
              console.log('PNG Generation - Skipping item without dot:', it.textContent);
              return;
            }
            const text = it.textContent.trim();
            ctx.font = '600 70px system-ui, sans-serif'; // Dramatically enlarged legend font
            const textW = ctx.measureText(text).width;
            const w = textW + 138; // dot size + padding
            if (rowW + w > maxW && row.length) {
              rowItems.push({ row, rowW });
              row = [];
              rowW = 0;
            }
            row.push({ dotColor: dot.style.backgroundColor, text });
            rowW += w;
          });
          if (row.length) rowItems.push({ row, rowW });

          console.log('PNG Generation - Row items created:', rowItems.length);

          rowItems.forEach(({ row, rowW }) => {
            let x = (canvasWidth - rowW) / 2;
            row.forEach(({ dotColor, text }) => {
              ctx.beginPath();
              ctx.arc(x + 30, legendY - 27, 30, 0, 2 * Math.PI); // Larger dots to match font
              ctx.fillStyle = dotColor;
              ctx.fill();
              ctx.font = '600 70px system-ui, sans-serif'; // Dramatically enlarged legend font
              ctx.fillStyle = '#000000';
              ctx.textAlign = 'left';
              ctx.fillText(text, x + 88, legendY);
              x += ctx.measureText(text).width + 138;
            });
            legendY += legendRowHeight;
          });

          // Calculate conversion factor and EF values BEFORE drawing text
          // Determine conversion factor based on pollutant unit
          let conversionFactor;
          switch(pollutantUnit.toLowerCase()) {
            case 't':
            case 'tonnes':
              conversionFactor = 1000;
              break;
            case 'grams international toxic equivalent':
              conversionFactor = 1000;
              break;
            case 'kilotonne':
            case 'kilotonne/kt co2 equivalent':
            case 'kt co2 equivalent':
              conversionFactor = 1000000;
              break;
            case 'kg':
              conversionFactor = 1;
              break;
            default:
              conversionFactor = 1000000;
          }

          // Get visible data points for EF calculation
          const dataPoints = chartData.dataPoints || [];
          const visibleDataPoints = dataPoints.filter((point, index) => {
            const uniqueGroups = [...new Set(dataPoints.map(p => p.groupName))];
            const groupIndex = uniqueGroups.indexOf(point.groupName);
            return window.seriesVisibility && window.seriesVisibility[groupIndex] !== false;
          });

          // Calculate all EF values for scaling
          const allEFs = visibleDataPoints.map(p => 
            p.EF !== undefined ? p.EF : (p.activityData !== 0 ? (p.pollutantValue / p.activityData) * conversionFactor : 0)
          );
          const maxEF = Math.max(...allEFs);
          const minEF = Math.min(...allEFs.filter(ef => ef > 0));

          // Determine if logarithmic scaling should be used
          const efRatio = maxEF / minEF;
          const useLogScale = efRatio > 1000;

          // EF explanation text - place below legend (not on chart)
          const efTextY = legendY + 43; // Offset to match larger legend spacing
          ctx.font = '58px system-ui, sans-serif'; // Scales with updated legend/title sizes
          ctx.fillStyle = '#555555';
          ctx.textAlign = 'center';
          
          // Update text based on scaling type
          if (useLogScale) {
            ctx.fillText('Bubble size proportional to log₁₀(Emission Factor) — logarithmic scale used due to wide EF range', canvasWidth / 2, efTextY);
          } else {
            ctx.fillText('Bubble size proportional to Emission Factor (area-scaled, radius = √EF)', canvasWidth / 2, efTextY);
          }

          // Chart Image - with precise clipping on top and right only (no borders there)
          const chartY = padding + yearHeight + titleHeight + legendHeight + 20; // Tight gap before chart
          
          // Chart area boundaries from chart-renderer.js (scaled by exportScale = 3)
          const exportScale = 3;
          const chartAreaTop = 70 * exportScale;      // Reduced from 80 to preserve top bubbles
          const chartAreaRight = 80 * exportScale;    // right: 80 in chart options
          
          // Save context state before clipping
          ctx.save();
          
          // Create clipping region - clip only top and right edges
          // Left and bottom are fine (they have axis borders with labels/ticks)
          const clipX = padding;  // Start from left edge (don't clip left)
          const clipY = chartY + chartAreaTop;  // Clip from chartArea top
          const clipW = chartWidth - chartAreaRight;  // Clip at chartArea right
          const clipH = chartHeight - chartAreaTop;  // Full height from top clip down (don't clip bottom)
          
          ctx.beginPath();
          ctx.rect(clipX, clipY, clipW, clipH);
          ctx.clip();
          
          // Draw chart (it will be clipped to remove top/right edge gridlines)
          ctx.drawImage(img, padding, chartY, chartWidth, chartHeight);
          
          // Restore context to remove clipping
          ctx.restore();

          // Draw EF labels on bubbles
          // (visibleDataPoints, conversionFactor, allEFs, maxEF, minEF, efRatio, useLogScale already calculated above)

          // Get axis ranges from chart options
          const chartOptions = chartData.options;
          const xMax = chartOptions.hAxis.viewWindow.max;
          const yMax = chartOptions.vAxis.viewWindow.max;
          
          // Use existing chartArea variables (already defined above for clipping)
          // chartAreaTop and chartAreaRight are already defined as 80 * exportScale
          const plotWidth = chartWidth - (150 * exportScale) - chartAreaRight;
          const plotHeight = chartHeight - chartAreaTop - (120 * exportScale);

          // Calculate scaleFactor exactly as chart-renderer.js does
          const targetMaxRadius = 90;
          const targetMinRadius = 5;
          let scaleFactor;
          
          if (useLogScale) {
            const maxLog = Math.log10(maxEF);
            const minLog = Math.log10(minEF);
            const logRange = maxLog - minLog;
            scaleFactor = (targetMaxRadius - targetMinRadius) / logRange;
          } else {
            scaleFactor = targetMaxRadius / Math.sqrt(maxEF);
            const minRadiusWithMaxScale = scaleFactor * Math.sqrt(minEF);
            
            if (minRadiusWithMaxScale < targetMinRadius) {
              scaleFactor = targetMinRadius / Math.sqrt(minEF);
            }
          }

          visibleDataPoints.forEach(point => {
            // Calculate emission factor using correct conversion factor
            const emissionFactor = point.EF !== undefined ? point.EF : 
              (point.activityData !== 0 ? (point.pollutantValue / point.activityData) * conversionFactor : 0);
            
            // Skip if no valid data
            if (!point || typeof point.activityData !== 'number' || typeof point.pollutantValue !== 'number') {
              return;
            }
            
            // Calculate bubble position in pixels
            const xRatio = point.activityData / xMax;
            const yRatio = 1 - (point.pollutantValue / yMax); // Invert Y axis
            const bubbleX = padding + (150 * exportScale) + (xRatio * plotWidth);
            const bubbleY = chartY + chartAreaTop + (yRatio * plotHeight);
            
            // Calculate bubble radius using EXACT same formula as chart-renderer.js (including log scale)
            let bubbleRadius;
            if (useLogScale && emissionFactor > 0) {
              const logEF = Math.log10(emissionFactor);
              const logMin = Math.log10(minEF);
              const logMax = Math.log10(maxEF);
              const logPosition = (logEF - logMin) / (logMax - logMin);
              const radius = targetMinRadius + (logPosition * (targetMaxRadius - targetMinRadius));
              bubbleRadius = radius * exportScale;
            } else {
              const sqrtEF = Math.sqrt(emissionFactor);
              bubbleRadius = (scaleFactor * sqrtEF) * exportScale;
            }
            
            // Label text with 8 decimal places for small values
            const efDisplay = emissionFactor < 0.01 ? emissionFactor.toFixed(8) : emissionFactor.toFixed(2);
            const labelText = `${efDisplay} g/GJ`;
            
            // Always place label to the right of the bubble, always black, no leader line
            const bubbleColor = window.Colors && typeof window.Colors.getColorForGroup === 'function'
              ? window.Colors.getColorForGroup(point.groupName)
              : '#000000';

            ctx.font = '400 60px "Tiresias Infofont", sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            // Position label to the right of bubble with 20px padding
            const labelX = bubbleX + bubbleRadius + 20;
            const labelY = bubbleY;

            const desiredInnerStroke = 1.5; // logical px thickness for inner (black) outline in final image
            const desiredOuterStroke = 3; // logical px thickness for outer (white) halo in final image
            const innerStrokeWidth = desiredInnerStroke * exportScale;
            const outerStrokeWidth = desiredOuterStroke * exportScale;

            ctx.lineJoin = 'round';
            ctx.miterLimit = 2;

            const charSpacing = 0.5 * exportScale;
            let currentX = labelX;
            const characters = [...labelText];

            characters.forEach((char, index) => {
              ctx.lineWidth = outerStrokeWidth;
              ctx.strokeStyle = 'rgba(255,255,255,0.95)';
              ctx.strokeText(char, currentX, labelY);

              ctx.lineWidth = innerStrokeWidth;
              ctx.strokeStyle = '#000000';
              ctx.strokeText(char, currentX, labelY);

              ctx.fillStyle = bubbleColor;
              ctx.fillText(char, currentX, labelY);

              const advance = ctx.measureText(char).width;
              currentX += advance;
              if (index < characters.length - 1) {
                currentX += charSpacing;
              }
            });

          });

          // Draw Logo and Footer
          const logo = new Image();
          logo.crossOrigin = 'anonymous';
          logo.src = '../SharedResources/images/CIC - Square - Border - Words - Alpha 360x360.png';

          const finishGeneration = () => {
            ctx.font = '50px system-ui, sans-serif';
            ctx.fillStyle = '#555';
            ctx.textAlign = 'center';
            
            // Check if footer needs to wrap
            const fullFooterText = "© Crown 2025 copyright Defra & DESNZ via naei.energysecurity.gov.uk licensed under the Open Government Licence (OGL).";
            const footerTextWidth = ctx.measureText(fullFooterText).width;
            
            let footerY = chartY + chartHeight; // Directly after chart (0px gap)
            
            if (footerTextWidth > canvasWidth - 40) {
              // Wrap: split after "gov.uk"
              const footerLine1 = "© Crown 2025 copyright Defra & DESNZ via naei.energysecurity.gov.uk";
              const footerLine2 = "licensed under the Open Government Licence (OGL).";
              ctx.fillText(footerLine1, canvasWidth / 2, footerY);
              ctx.fillText(footerLine2, canvasWidth / 2, footerY + 60);
              footerY += 60; // Adjust for wrapped line
            } else {
              // Single line
              ctx.fillText(fullFooterText, canvasWidth / 2, footerY);
            }

            const channelY = footerY + 60; // Balanced gap after footer text
            const boldText = "Youtube: ";
            const normalText = "youtube.com/@chronicillnesschannel";
            
            ctx.font = 'bold 52px system-ui, sans-serif';
            const boldWidth = ctx.measureText(boldText).width;
            ctx.font = '52px system-ui, sans-serif';
            const normalWidth = ctx.measureText(normalText).width;
            const totalWidth = boldWidth + normalWidth;
            
            // Check if channel text fits on one line
            if (totalWidth > canvasWidth - 40) {
              // Wrap: put URL on separate line
              ctx.textAlign = 'center';
              ctx.font = 'bold 52px system-ui, sans-serif';
              ctx.fillText(boldText.trim(), canvasWidth / 2, channelY);
              ctx.font = '52px system-ui, sans-serif';
              ctx.fillText(normalText, canvasWidth / 2, channelY + 60);
            } else {
              // Single line
              const startX = (canvasWidth - totalWidth) / 2;
              ctx.textAlign = 'left';
              ctx.font = 'bold 52px system-ui, sans-serif';
              ctx.fillText(boldText, startX, channelY);
              ctx.font = '52px system-ui, sans-serif';
              ctx.fillText(normalText, startX + boldWidth, channelY);
            }
            
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
          };

          logo.onload = () => {
            try {
              const logoSize = 360; // Enlarged CIC logo for exports
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
      reject(new Error(`SVG processing failed: ${error.message}`));
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
      window.Analytics.trackAnalytics(supabase, 'bubble_chart_downloaded', {
        year: chartData.year,
        pollutant: chartData.pollutantName,
        group_count: chartData.groupIds.length,
        filename: filename,
        chart_type: 'bubble_chart'
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

  // Build shareable URL with parameters matching updateURL() format
  // Get group IDs with comparison flags ('c' suffix if checkbox is checked)
  const allGroups = window.supabaseModule.allGroups || [];
  const groupRows = document.querySelectorAll('.groupRow');
  
  const groupIdsWithFlags = chartData.groupIds.map((groupId, index) => {
    // Check if the corresponding checkbox is checked
    const row = groupRows[index];
    const checkbox = row?.querySelector('.comparison-checkbox');
    const isChecked = checkbox?.checked || false;
    
    // Add 'c' suffix if checkbox is checked
    return isChecked ? `${groupId}c` : `${groupId}`;
  });

  // Format: pollutant_id, group_ids, year (year at the end)
  const query = `pollutant_id=${chartData.pollutantId}&group_ids=${groupIdsWithFlags.join(',')}&year=${chartData.year}`;
  const shareUrl = window.location.origin + window.location.pathname + '?' + query;
  
  const title = `${chartData.pollutantName} vs Activity Data (${chartData.year})`;

  // Create dialog
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
  
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      document.body.removeChild(dialog);
    }
  };

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
      <button id="copyPngBtn" style="padding: 10px 16px; background: #FF9800; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; width: 100%;">
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
      // Fallback for older browsers
      const input = content.querySelector('#shareUrlInput');
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

  // Email share functionality
  content.querySelector('#emailShareBtn').addEventListener('click', async () => {
    const btn = content.querySelector('#emailShareBtn');
    const originalText = btn.textContent;
    const originalBg = btn.style.background;
    
    try {
      btn.disabled = true;
      btn.textContent = 'Copying image...';
      
      const chartImageData = await generateChartImage();
      const blob = dataURLtoBlob(chartImageData);
      
      if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const clipboardItem = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([clipboardItem]);
        
        btn.textContent = '✅ Copied!';
        btn.style.background = '#4CAF50';
        
        if (window.Analytics && supabase) {
          window.Analytics.trackAnalytics(supabase, 'email_share_copied', {
            year: chartData.year,
            pollutant: chartData.pollutantName,
            group_count: chartData.groupIds.length
          });
        }
        
        // Open email client
        const subject = encodeURIComponent(title);
        const body = encodeURIComponent(`View the chart here: ${shareUrl}\n\nThe chart image has been copied to your clipboard. Paste it into your email.`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
        
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = originalBg;
          btn.disabled = false;
        }, 2000);
      } else {
        btn.textContent = originalText;
        btn.style.background = originalBg;
        btn.disabled = false;
        alert('Your browser doesn\'t support copying images to clipboard.');
      }
    } catch (error) {
      console.error('Failed to copy image for email:', error);
      btn.textContent = originalText;
      btn.style.background = originalBg;
      btn.disabled = false;
      alert('Failed to copy chart image: ' + error.message);
    }
  });

  // Close button
  content.querySelector('#closeShareBtn').addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
}

/**
 * Export scatter chart data to CSV or Excel
 * @param {string} format - 'csv' or 'xlsx'
 */
function exportData(format = 'csv') {
  const chartData = window.ChartRenderer.getCurrentChartData();
  
  if (!chartData || !chartData.dataPoints || chartData.dataPoints.length === 0) {
    alert('No chart data available to export. Please select a pollutant, groups, and year first.');
    return;
  }

  const pollutantName = chartData.pollutantName;
  const pollutantUnit = window.supabaseModule.getPollutantUnit(chartData.pollutantId);
  const activityUnit = window.supabaseModule.getPollutantUnit(window.supabaseModule.activityDataId);
  const year = chartData.year;
  const dataPoints = chartData.dataPoints;

  // Track export analytics
  if (window.Analytics && supabase) {
    window.Analytics.trackAnalytics(supabase, 'data_export', {
      format: format,
      pollutant: pollutantName,
      year: year,
      group_count: dataPoints.length
    });
  }

  // Build rows
  const rows = [];
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

  // Header rows
  rows.push([`Pollutant: ${pollutantName}`, `Emission Unit: ${pollutantUnit}`, `Year: ${year}`]);
  rows.push([]); // spacer row
  
  // Column headers - use hyphens instead of brackets to match chart formatting
  rows.push(['Group', `Activity Data - ${activityUnit}`, `Emissions - ${pollutantUnit}`, 'Emission Factor - g/GJ']);

  // Data rows
  dataPoints.forEach(point => {
    const emissionFactor = point.EF !== undefined ? point.EF : 
      (point.activityData !== 0 ? (point.pollutantValue / point.activityData) * 1000000 : 0);
    
    rows.push([
      point.groupName,
      point.activityData.toFixed(2),
      point.pollutantValue.toFixed(6),
      emissionFactor.toFixed(2)
    ]);
  });

  rows.push([]); // spacer
  rows.push([`Downloaded on: ${timestamp}`]);

  // Generate and download file
  const safePollutant = pollutantName.replace(/[^a-z0-9_\-]/gi, '_');
  const filename = `${safePollutant}_vs_Activity_${year}`;

  if (format === 'csv') {
    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
  } else if (format === 'xlsx') {
    // Check if XLSX library is loaded
    if (typeof XLSX === 'undefined') {
      alert('Excel export library not loaded. Please use CSV format instead.');
      return;
    }
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Size Column A by its longest entry and other columns by row 3 headers
    const measuredWidths = [];
    rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell == null) {
          return;
        }

        const shouldMeasure = colIndex === 0 || rowIndex === 2;
        if (!shouldMeasure) {
          return;
        }

        const length = String(cell).length + 2; // add padding for readability
        if (!measuredWidths[colIndex] || length > measuredWidths[colIndex]) {
          measuredWidths[colIndex] = length;
        }
      });
    });

    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    ws['!cols'] = Array.from({ length: columnCount }, (_, idx) => ({ wch: measuredWidths[idx] || 12 }));

    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  }
}

// Export functions
window.ExportShare = {
  downloadChartPNG,
  showShareDialog,
  generateChartImage,
  exportData
};

