/**
 * Main Application Module
 * Handles UI initialization, user interactions, and coordination between modules
 */

const isOperaBrowser = (() => {
  try {
    const ua = navigator.userAgent || '';
    return ua.includes('OPR/') || ua.includes('Opera');
  } catch (error) {
    // Unable to detect Opera browser; returning false
    return false;
  }
})();

function applyOperaFixedWidth(el, widthPx) {
  if (!el || !widthPx) {
    return;
  }
  el.classList.add('opera-wide-select');
  const widthValue = `${Math.round(widthPx)}px`;
  el.style.setProperty('width', widthValue, 'important');
  el.style.setProperty('min-width', widthValue, 'important');
  el.style.setProperty('max-width', widthValue, 'important');
}

function freezeWidthForOpera(selectors = [], opts = {}) {
  if (!isOperaBrowser) {
    return;
  }

  const config = typeof opts === 'number' ? { extraPadding: opts } : (opts || {});
  const minWidth = Number.isFinite(config.minWidth) ? Number(config.minWidth) : null;
  const fixedWidth = Number.isFinite(config.fixedWidth) ? Number(config.fixedWidth) : null;
  const maxWidth = Number.isFinite(config.maxWidth) ? Number(config.maxWidth) : null;
  const extraPadding = Number.isFinite(config.extraPadding) ? Number(config.extraPadding) : 12;
  const attempts = Math.max(1, Number.isFinite(config.attempts) ? Number(config.attempts) : 4);
  const attemptDelay = Math.max(16, Number.isFinite(config.attemptDelay) ? Number(config.attemptDelay) : 120);
  const arrowAllowance = Number.isFinite(config.arrowAllowance) ? Number(config.arrowAllowance) : 0;
  const elements = Array.isArray(selectors) ? selectors : [selectors];

  const measureAndFreeze = () => {
    requestAnimationFrame(() => {
      elements.forEach(selector => {
        const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!el) {
          return;
        }
        // Clear prior width locks so we re-measure the natural content width each pass
        el.style.width = '';
        el.style.minWidth = '';
        el.style.maxWidth = '';
        const rectWidth = Math.ceil(el.getBoundingClientRect().width || 0);
        const scrollWidth = Math.ceil((el.scrollWidth || 0));
        const baseWidth = Math.max(rectWidth, scrollWidth);
        let targetWidth = fixedWidth || Math.max(minWidth || 0, baseWidth + extraPadding);
        if (Number.isFinite(maxWidth)) {
          targetWidth = Math.min(maxWidth, targetWidth);
        }
        const finalWidth = targetWidth + arrowAllowance;
        if (finalWidth > 0) {
          applyOperaFixedWidth(el, finalWidth);
        }
      });
    });
  };

  let remaining = attempts;
  const schedule = () => {
    if (remaining <= 0) {
      return;
    }
    remaining -= 1;
    measureAndFreeze();
    if (remaining > 0) {
      setTimeout(schedule, attemptDelay);
    }
  };

  schedule();

  if (document.fonts?.ready) {
    document.fonts.ready.then(measureAndFreeze).catch(measureAndFreeze);
  }
}

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Application state
let selectedYear = null;
let selectedPollutantId = null;
let chartRenderCallback = null; // Callback for when chart finishes rendering
let selectedGroupIds = [];
let initialComparisonFlags = []; // Store comparison flags from URL for initial checkbox state
const MIN_CHART_WRAPPER_HEIGHT = 480;
const MIN_CHART_CANVAS_HEIGHT = 420;
const CHART_HEADER_BUFFER = 10; // spacing between title/legend and chart
const FOOTER_GAP = 6; // breathing room between chart bottom and footer
const MIN_HEIGHT_DELTA = 8; // px difference required before re-sending height
const DEFAULT_PARENT_FOOTER = 140;
const DEFAULT_PARENT_VIEWPORT = 900;
const CSS_DEFAULT_FOOTER_RESERVE = 160; // Mirrors --bubble-footer-height default in styles.css
const CSS_VISUAL_PADDING = 27; // Extra breathing room so chart clears the footer visually
const RESIZE_THRESHOLD = 3;
const TUTORIAL_SLIDE_MATRIX = [
  ['002', '003', '004', '005'],
  ['002', '003', '004', '007'],
  ['002', '003', '004', '009'],
  ['002', '003', '004', '011', '012'],
  ['002', '003', '004', '011', '014'],
  ['002', '003', '016'],
  ['002', '017'],
  ['002', '018'],
  ['002', '019'],
  ['002', '020']
];
const IS_EMBEDDED = window.parent && window.parent !== window;

const layoutHeightManager = window.LayoutHeightManager?.create({
  namespace: 'bubble',
  wrapperSelector: '.chart-wrapper',
  chartSelector: '#chart_div',
  minChartHeight: MIN_CHART_CANVAS_HEIGHT,
  footerGap: FOOTER_GAP,
  visualPadding: CSS_VISUAL_PADDING,
  minHeightDelta: MIN_HEIGHT_DELTA,
  heightDebounce: 250
});

if (layoutHeightManager) {
  window.__bubbleLayoutHeightManager = layoutHeightManager;

  const parentChangeDelay = layoutHeightManager.settings?.parentChangeDebounce || 200;
  layoutHeightManager.onParentViewportChange?.(({ viewportHeight }) => {
    lastKnownViewportHeight = viewportHeight || lastKnownViewportHeight;
    updateChartWrapperHeight('parent-viewport');
    drawChart(true);
    setTimeout(() => sendContentHeightToParent(true), parentChangeDelay);
  });
}

const tutorialOverlayApi = {
  open: null,
  hide: null,
  isActive: () => false
};
let pendingTutorialOpenReason = null;

let lastSentHeight = 0;
let lastKnownViewportWidth = 0;
let lastKnownViewportHeight = window.innerHeight || 0;
let pendingHeightPokeTimer = null;
let parentViewportRedrawTimer = null;
let parentFooterHeight = DEFAULT_PARENT_FOOTER;
let parentViewportHeight = DEFAULT_PARENT_VIEWPORT;
let chartReadyNotified = false;
let chartRenderingUnlocked = false;
let pendingDrawRequest = null;

function applyCssFooterReserve(pixels) {
  if (layoutHeightManager) {
    return layoutHeightManager.applyFooterReserve(pixels);
  }
  try {
    const safePixels = Math.max(FOOTER_GAP, Math.round(Number(pixels) || 0));
    const padded = safePixels + CSS_VISUAL_PADDING;
    document.documentElement?.style?.setProperty('--bubble-footer-height', `${padded}px`);
  } catch (error) {
  }
}

applyCssFooterReserve(CSS_DEFAULT_FOOTER_RESERVE);

function applyCssViewportHeight(value) {
  if (layoutHeightManager) {
    return layoutHeightManager.applyViewportHeight(value);
  }
  try {
    if (typeof value === 'string') {
      document.documentElement?.style?.setProperty('--bubble-viewport-height', value);
      return;
    }
    const pixels = Math.round(Number(value) || 0);
    if (pixels > 0) {
      document.documentElement?.style?.setProperty('--bubble-viewport-height', `${pixels}px`);
    }
  } catch (error) {
  }
}

applyCssViewportHeight('100vh');
if (IS_EMBEDDED) {
  applyCssViewportHeight(`${parentViewportHeight}px`);
}

function getElementHeight(el) {
  if (!el) {
    return 0;
  }
  const rect = el.getBoundingClientRect();
  return Math.round(rect.height || 0);
}

function getElementTop(el) {
  if (!el) {
    return 0;
  }
  const rect = el.getBoundingClientRect();
  const scrollOffset = window.scrollY || window.pageYOffset || 0;
  return Math.max(0, Math.round((rect.top || 0) + scrollOffset));
}

function getElementBottom(el) {
  if (!el) {
    return 0;
  }
  const rect = el.getBoundingClientRect();
  const scrollOffset = window.scrollY || window.pageYOffset || 0;
  return Math.max(0, Math.round((rect.bottom || 0) + scrollOffset));
}

function getStandaloneFooterHeight() {
  const footer = document.querySelector('footer');
  if (!footer) {
    return DEFAULT_PARENT_FOOTER;
  }

  const rect = footer.getBoundingClientRect();
  const styles = window.getComputedStyle(footer);
  const margins = (parseFloat(styles.marginTop) || 0) + (parseFloat(styles.marginBottom) || 0);
  return Math.round((rect.height || 0) + margins);
}

window.addEventListener('message', (event) => {
  if (!event?.data) {
    return;
  }

  if (event.data.type === 'parentViewportMetrics') {
    if (layoutHeightManager) {
      const metrics = layoutHeightManager.handleParentMetrics(event.data) || {};
      if (Number.isFinite(metrics.footerHeight)) {
        parentFooterHeight = Math.max(metrics.footerHeight, FOOTER_GAP);
      }
      if (Number.isFinite(metrics.viewportHeight)) {
        parentViewportHeight = metrics.viewportHeight;
      }
    } else {
      const previousFooter = parentFooterHeight;
      const previousViewport = parentViewportHeight;
      const footerCandidate = Number(event.data.footerHeight);
      const viewportCandidate = Number(event.data.viewportHeight);

      if (Number.isFinite(footerCandidate) && footerCandidate >= 0) {
        parentFooterHeight = Math.max(footerCandidate, FOOTER_GAP);
        applyCssFooterReserve(parentFooterHeight + FOOTER_GAP);
      }

      if (Number.isFinite(viewportCandidate) && viewportCandidate > 0) {
        parentViewportHeight = viewportCandidate;
        applyCssViewportHeight(`${parentViewportHeight}px`);
      }

      const footerDelta = Math.abs((parentFooterHeight || 0) - (previousFooter || 0));
      const viewportDelta = Math.abs((parentViewportHeight || 0) - (previousViewport || 0));
      if (Math.max(footerDelta, viewportDelta) >= RESIZE_THRESHOLD) {
        if (parentViewportRedrawTimer) {
          clearTimeout(parentViewportRedrawTimer);
        }
        parentViewportRedrawTimer = setTimeout(() => {
          parentViewportRedrawTimer = null;
          lastKnownViewportHeight = parentViewportHeight;
          drawChart(true);
          setTimeout(() => sendContentHeightToParent(true), 200);
        }, 200);
      }
    }

    updateChartWrapperHeight('parent-viewport');
  }

  if (event.data.type === 'openBubbleTutorial') {
    const reason = event.data.reason || 'parent';
    if (typeof tutorialOverlayApi.open === 'function') {
      const isActive = typeof tutorialOverlayApi.isActive === 'function' && tutorialOverlayApi.isActive();
      if (!isActive) {
        tutorialOverlayApi.open(reason);
      }
    } else {
      pendingTutorialOpenReason = reason;
    }
  }
});

function shouldSkipDirectionalNavigationTarget(target) {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : '';
  return ['input', 'textarea', 'select'].includes(tagName);
}

function setupParentNavigationForwarding(sourceLabel = 'bubble') {
  if (!IS_EMBEDDED || !window.parent) {
    return;
  }

  const forwardDirectionalKeys = (event) => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    const target = event.target || document.activeElement;
    if (shouldSkipDirectionalNavigationTarget(target)) {
      return;
    }

    try {
      window.parent.postMessage({
        type: 'requestChartNavigation',
        direction: event.key === 'ArrowRight' ? 'next' : 'previous',
        source: sourceLabel
      }, '*');
      event.preventDefault();
    } catch (error) {
      // Parent may block navigation requests; ignore failures silently
    }
  };

  document.addEventListener('keydown', forwardDirectionalKeys);
}

setupParentNavigationForwarding('bubble');

function updateChartWrapperHeight(contextLabel = 'init') {
  const viewportHeight = Math.round(
    IS_EMBEDDED
      ? parentViewportHeight
      : (
        window.visualViewport?.height
        || window.innerHeight
        || document.documentElement?.clientHeight
        || 0
      )
  );

  if (!IS_EMBEDDED) {
    applyCssViewportHeight(`${viewportHeight}px`);
  }

  const footerReserve = IS_EMBEDDED
    ? parentFooterHeight + FOOTER_GAP
    : getStandaloneFooterHeight() + FOOTER_GAP;

  if (!viewportHeight) {
    // Silently bail when viewport metrics are unavailable; repeated logging was noisy
    return;
  }

  const estimatedChartHeight = layoutHeightManager
    ? layoutHeightManager.estimateChartHeight({
        viewportHeight,
        footerReserve,
        chromeBuffer: CHART_HEADER_BUFFER
      })
    : Math.max(
        MIN_CHART_CANVAS_HEIGHT,
        viewportHeight - footerReserve - CHART_HEADER_BUFFER
      );

  window.__NAEI_LAST_CHART_HEIGHT = estimatedChartHeight;
  return estimatedChartHeight;

  /*
  const chartWrapper = document.querySelector('.chart-wrapper');
  const chartDiv = document.getElementById('chart_div');
  const chartTitle = document.getElementById('chartTitle');
  const chartLegend = document.getElementById('customLegend');

  if (!chartWrapper || !chartDiv) {
    return;
  }

  const wrapperTop = Math.max(0, Math.round(chartWrapper.getBoundingClientRect().top));
  const wrapperStyles = window.getComputedStyle(chartWrapper);
  const wrapperPadding = (parseFloat(wrapperStyles.paddingTop) || 0) + (parseFloat(wrapperStyles.paddingBottom) || 0);
  const titleHeight = getElementHeight(chartTitle);
  const legendHeight = getElementHeight(chartLegend);
  const chromeReserve = wrapperPadding + titleHeight + legendHeight + CHART_HEADER_BUFFER;

  let wrapperHeight;
  let chartRegionHeight;

  if (IS_EMBEDDED) {
    const maxWrapperHeight = Math.max(0, viewportHeight - footerReserve);
    wrapperHeight = Math.max(0, maxWrapperHeight);
    chartRegionHeight = Math.max(MIN_CHART_CANVAS_HEIGHT, wrapperHeight - chromeReserve);
    if (chartRegionHeight + chromeReserve > wrapperHeight) {
      chartRegionHeight = Math.max(0, wrapperHeight - chromeReserve);
    }
  } else {
    const availableHeight = Math.max(0, viewportHeight - footerReserve - wrapperTop);
    wrapperHeight = Math.max(MIN_CHART_WRAPPER_HEIGHT, availableHeight);
    chartRegionHeight = Math.max(0, wrapperHeight - chromeReserve);
    if (chartRegionHeight < MIN_CHART_CANVAS_HEIGHT && wrapperHeight >= MIN_CHART_CANVAS_HEIGHT + chromeReserve) {
      chartRegionHeight = MIN_CHART_CANVAS_HEIGHT;
    }
    if (chartRegionHeight + chromeReserve > wrapperHeight) {
      chartRegionHeight = Math.max(0, wrapperHeight - chromeReserve);
    }
  }

  chartWrapper.style.height = `${wrapperHeight}px`;
  chartWrapper.style.maxHeight = `${wrapperHeight}px`;
  chartWrapper.style.minHeight = `${wrapperHeight}px`;

  chartDiv.style.height = `${chartRegionHeight}px`;
  chartDiv.style.minHeight = `${chartRegionHeight}px`;
  chartDiv.style.maxHeight = `${chartRegionHeight}px`;
  chartDiv.style.flex = '0 0 auto';
  window.__NAEI_LAST_CHART_HEIGHT = chartRegionHeight;

  */
}

window.updateChartWrapperHeight = updateChartWrapperHeight;

/**
 * Initialize the application
 */
async function init() {
  // Ensure loading class is set
  document.body.classList.add('loading');
  updateChartWrapperHeight('init');

  try {
    // Loading overlay removed - data pre-loaded via shared loader
    document.getElementById('mainContent').setAttribute('aria-hidden', 'true');
    document.body.classList.add('loading');

    // Wait for supabaseModule to be available
    let attempts = 0;
    const maxAttempts = 50;
    while (!window.supabaseModule && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (!window.supabaseModule) {
      throw new Error('supabaseModule not available after waiting');
    }

    // Load data using supabaseModule
    await window.supabaseModule.loadData();

    if (window.supabaseModule.latestDatasetSource === 'hero') {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Create window data stores EXACTLY like linechart v2.3
    window.allPollutants = window.supabaseModule.allPollutants;
    window.allGroupsRaw = window.supabaseModule.allGroups;
    const activeGroupsForSelectors = window.supabaseModule.activeActDataGroups
      || window.supabaseModule.activeGroups
      || window.supabaseModule.allGroups
      || [];
    window.allGroups = activeGroupsForSelectors;
    

    // Create allGroupsList EXACTLY like linechart setupSelectors function
    const groups = window.supabaseModule.activeActDataGroups
      || window.supabaseModule.activeGroups
      || window.supabaseModule.allGroups
      || [];
    const groupNames = [...new Set(groups.map(g => g.group_title))]
      .filter(Boolean)
      .sort((a, b) => {
        if (a.toLowerCase() === 'all') return -1;
        if (b.toLowerCase() === 'all') return 1;
        return a.localeCompare(b);
      });
    window.allGroupsList = groupNames;

    // Setup UI
    setupYearSelector();
    setupPollutantSelector();
    setupGroupSelector();
    setupEventListeners();
    setupTutorialOverlay();
    updateChartWrapperHeight('post-setup');

    // Render initial view based on URL parameters or defaults
    await renderInitialView();

    // Finally, reveal the main content and draw the chart
    await revealMainContent();

    // Chart ready signal is now sent from revealMainContent after loading overlay fades

    // Track page load
    await window.supabaseModule.trackAnalytics('page_load', {
      app: 'bubble_chart'
    });

  } catch (error) {
    console.error('Failed to initialize application:', error);
    showNotification('Failed to load data. Please refresh the page.', 'error');
  }
}

/**
 * Remove loading state
 */
function removeLoadingState() {
  // Loading overlay removed - just update body class
  document.body.classList.remove('loading');
}

/**
 * Fallback function to show content directly
 */
function showContentDirectly() {
  const mainContent = document.getElementById('mainContent');
  
  if (mainContent) {
    mainContent.style.display = 'block';
    mainContent.removeAttribute('aria-hidden');
    mainContent.classList.add('loaded');
    
    // Loading overlay removed - skip hiding step
    
    // Make chart visible
    const chartWrapper = document.querySelector('.chart-wrapper');
    if (chartWrapper) {
      chartWrapper.classList.add('visible');
    }

    const chartDiv = document.getElementById('chart_div');
    if (chartDiv) {
      chartDiv.classList.add('visible');
    }
    
    notifyParentChartReady();
  } else {
    console.error('Could not find mainContent element');
  }
}

function setupTutorialOverlay() {
  const overlay = document.getElementById('bubbleTutorialOverlay');
  const openBtn = document.getElementById('tutorialBtn');
  if (!overlay || !openBtn) {
    // Tutorial overlay markup missing; skipping tutorial setup
    return;
  }
  openBtn.setAttribute('aria-expanded', 'false');

  const dialog = overlay.querySelector('.bubble-tutorial-dialog');
  const stage = overlay.querySelector('.bubble-tutorial-stage');
  const closeBtn = overlay.querySelector('.bubble-tutorial-close');
  const prevBtn = overlay.querySelector('.bubble-tutorial-nav.prev');
  const nextBtn = overlay.querySelector('.bubble-tutorial-nav.next');
  const layerImages = Array.from(overlay.querySelectorAll('.tutorial-layer-image'));
  const layerBySuffix = new Map(layerImages.map(img => [img.dataset.suffix, img]));
  const fadeDurationMs = 300;
  const gapMs = 100;
  const swipeThresholdPx = 45;

  let currentSlide = 0;
  let currentVisibleLayers = new Set();
  let isTransitioning = false;
  let overlayActive = false;
  let lastFocusedElement = null;
  let touchStartX = null;

  const lastSlideIndex = TUTORIAL_SLIDE_MATRIX.length - 1;

  function notifyParentTutorialState(state, source = 'user') {
    if (!IS_EMBEDDED || !window.parent) {
      return;
    }
    try {
      window.parent.postMessage({
        type: 'bubbleTutorialState',
        state,
        source
      }, '*');
    } catch (error) {
      // Parent may block tutorial state messages; nothing else to do
    }
  }

  function getFocusableElements() {
    return Array.from(dialog.querySelectorAll('button:not([disabled])'));
  }

  function updateNavButtons() {
    if (prevBtn) {
      const isDisabled = currentSlide === 0;
      prevBtn.disabled = isDisabled;
      prevBtn.setAttribute('aria-disabled', String(isDisabled));
      prevBtn.style.display = isDisabled ? 'none' : 'flex';
    }
    if (nextBtn) {
      const isDisabled = currentSlide === lastSlideIndex;
      nextBtn.disabled = isDisabled;
      nextBtn.setAttribute('aria-disabled', String(isDisabled));
      nextBtn.style.display = isDisabled ? 'none' : 'flex';
    }
  }

  function applyLayerVisibility(targetLayers) {
    currentVisibleLayers.forEach(suffix => {
      if (!targetLayers.has(suffix)) {
        const img = layerBySuffix.get(suffix);
        if (img) {
          img.classList.remove('visible');
        }
      }
    });

    targetLayers.forEach(suffix => {
      if (!currentVisibleLayers.has(suffix)) {
        const img = layerBySuffix.get(suffix);
        if (img) {
          img.classList.add('visible');
        }
      }
    });
  }

  function showSlide(index, immediate = false) {
    const targetIndex = Math.max(0, Math.min(index, lastSlideIndex));
    const targetLayers = new Set(TUTORIAL_SLIDE_MATRIX[targetIndex] || []);

    if (immediate) {
      applyLayerVisibility(targetLayers);
      currentVisibleLayers = targetLayers;
      currentSlide = targetIndex;
      updateNavButtons();
      return;
    }

    if (isTransitioning || (!overlayActive && currentVisibleLayers.size === 0 && targetIndex === currentSlide)) {
      return;
    }

    const toHide = [...currentVisibleLayers].filter(layer => !targetLayers.has(layer));
    const toShow = [...targetLayers].filter(layer => !currentVisibleLayers.has(layer));
    const hasExistingLayers = currentVisibleLayers.size > 0;

    const finalize = () => {
      currentVisibleLayers = targetLayers;
      currentSlide = targetIndex;
      updateNavButtons();
      isTransitioning = false;
    };

    if (!hasExistingLayers) {
      applyLayerVisibility(targetLayers);
      setTimeout(finalize, fadeDurationMs);
      return;
    }

    isTransitioning = true;
    toHide.forEach(suffix => {
      const img = layerBySuffix.get(suffix);
      if (img) {
        img.classList.remove('visible');
      }
    });

    setTimeout(() => {
      toShow.forEach(suffix => {
        const img = layerBySuffix.get(suffix);
        if (img) {
          img.classList.add('visible');
        }
      });
    }, fadeDurationMs + gapMs);

    setTimeout(finalize, fadeDurationMs + gapMs + fadeDurationMs);
  }

  function showNextSlide() {
    if (currentSlide < lastSlideIndex) {
      showSlide(currentSlide + 1);
    }
  }

  function showPrevSlide() {
    if (currentSlide > 0) {
      showSlide(currentSlide - 1);
    }
  }

  function handleOverlayKeydown(event) {
    if (!overlayActive) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hideOverlay('keyboard');
      return;
    }
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      showNextSlide();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPrevSlide();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = getFocusableElements();
      if (!focusable.length) {
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function handleTouchStart(event) {
    if (!overlayActive || !event?.changedTouches?.length) {
      return;
    }
    touchStartX = event.changedTouches[0].clientX;
  }

  function handleTouchEnd(event) {
    if (!overlayActive || touchStartX === null || !event?.changedTouches?.length) {
      touchStartX = null;
      return;
    }
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(deltaX) >= swipeThresholdPx) {
      if (deltaX < 0) {
        showNextSlide();
      } else {
        showPrevSlide();
      }
    }
    touchStartX = null;
  }

  function scrollTutorialIntoView() {
    const isEmbedded = IS_EMBEDDED && window.parent && window.parent !== window;

    const scrollSelf = () => new Promise(resolve => {
      try {
        const chartWrapper = document.querySelector('.chart-wrapper');
        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!chartWrapper) {
          window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          resolve();
          return;
        }

        const rect = chartWrapper.getBoundingClientRect();
        const pageOffset = window.pageYOffset || document.documentElement.scrollTop || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const wrapperHeight = rect.height || chartWrapper.offsetHeight || 0;
        const offsetToCenter = Math.max(0, (viewportHeight - wrapperHeight) / 2);
        const targetTop = Math.max(0, rect.top + pageOffset - offsetToCenter);
        const behavior = prefersReducedMotion ? 'auto' : 'smooth';

        window.scrollTo({ top: targetTop, behavior });
        resolve();
      } catch (error) {
          // Failing to center overlay is non-critical; continue without logging
        resolve();
      }
    });

    if (!isEmbedded) {
      return scrollSelf();
    }

    const tryFrameElementScroll = () => new Promise(resolve => {
      try {
        const frameEl = window.frameElement;
        if (!frameEl || typeof frameEl.scrollIntoView !== 'function') {
          resolve(false);
          return;
        }
        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        frameEl.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        setTimeout(() => resolve(true), prefersReducedMotion ? 0 : 30);
      } catch (error) {
        // Parent frame may reject scroll requests; ignore failures
        resolve(false);
      }
    });

    const parentScrollFallback = () => {
      const requestId = `bubbleTutorial-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return new Promise(resolve => {
        let resolved = false;

        const handleAck = (event) => {
          if (event?.data?.type === 'bubbleTutorialScrollComplete' && event.data.requestId === requestId) {
            window.removeEventListener('message', handleAck);
            resolved = true;
            resolve();
          }
        };

        window.addEventListener('message', handleAck);

        try {
          window.parent.postMessage({ type: 'scrollToBubbleTutorial', requestId }, '*');
        } catch (error) {
          // Parent scroll requests can fail in locked-down hosts
          window.removeEventListener('message', handleAck);
          resolve();
          return;
        }

        setTimeout(() => {
          if (!resolved) {
            window.removeEventListener('message', handleAck);
            resolve();
          }
        }, 140);
      });
    };

    return tryFrameElementScroll()
      .then(success => success ? null : parentScrollFallback())
      .then(scrollSelf);
  }

  async function showOverlay(source = 'user') {
    if (overlayActive) {
      return;
    }
    await scrollTutorialIntoView();
    overlayActive = true;
    lastFocusedElement = document.activeElement;
    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
    openBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('tutorial-open');
    currentVisibleLayers.forEach(suffix => {
      const img = layerBySuffix.get(suffix);
      if (img) {
        img.classList.remove('visible');
      }
    });
    currentVisibleLayers = new Set();
    showSlide(0, true);
    document.addEventListener('keydown', handleOverlayKeydown);
    notifyParentTutorialState('opened', source);
    requestAnimationFrame(() => {
      if (closeBtn) {
        closeBtn.focus();
      }
    });
  }

  function hideOverlay(source = 'user') {
    if (!overlayActive) {
      return;
    }
    overlayActive = false;
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    openBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('tutorial-open');
    document.removeEventListener('keydown', handleOverlayKeydown);
    touchStartX = null;
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    } else {
      openBtn.focus();
    }
    lastFocusedElement = null;
    notifyParentTutorialState('closed', source);
  }

  openBtn.addEventListener('click', () => showOverlay('user'));
  if (closeBtn) {
    closeBtn.addEventListener('click', () => hideOverlay('user'));
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', showPrevSlide);
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', showNextSlide);
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      hideOverlay('user');
    }
  });

  if (stage) {
    stage.addEventListener('touchstart', handleTouchStart, { passive: true });
    stage.addEventListener('touchend', handleTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', () => {
      touchStartX = null;
    }, { passive: true });
  }

  showSlide(0, true);

  tutorialOverlayApi.open = showOverlay;
  tutorialOverlayApi.hide = hideOverlay;
  tutorialOverlayApi.isActive = () => overlayActive;

  if (pendingTutorialOpenReason) {
    showOverlay(pendingTutorialOpenReason);
    pendingTutorialOpenReason = null;
  }
}

function measureBubbleContentHeight() {
  const body = document.body;
  const html = document.documentElement;
  const documentHeight = Math.max(
    body?.scrollHeight || 0,
    body?.offsetHeight || 0,
    html?.scrollHeight || 0,
    html?.offsetHeight || 0
  );

  const chartShell = document.querySelector('.chart-shell');
  const mainContent = document.getElementById('mainContent');
  const wrapperEl = layoutHeightManager?.getWrapperElement?.() || document.querySelector('.chart-wrapper');
  const overlay = document.getElementById('bubbleTutorialOverlay');
  const overlayVisible = Boolean(
    overlay && (
      (typeof tutorialOverlayApi.isActive === 'function' && tutorialOverlayApi.isActive())
      || overlay.classList.contains('visible')
      || overlay.getAttribute('aria-hidden') === 'false'
    )
  );

  const shellBottom = getElementBottom(chartShell);
  const mainContentBottom = getElementBottom(mainContent);
  const wrapperBottom = getElementBottom(wrapperEl);
  const overlayBottom = overlayVisible ? getElementBottom(overlay) : 0;

  const candidates = [
    { label: 'chartShell', value: shellBottom },
    { label: 'mainContent', value: mainContentBottom },
    { label: 'chartWrapper', value: wrapperBottom }
  ];

  if (overlayBottom) {
    candidates.push({ label: 'tutorialOverlay', value: overlayBottom });
  }

  const validCandidates = candidates.filter(candidate => Number.isFinite(candidate.value) && candidate.value > 0);
  let measuredHeight = 0;
  let preferredSource = 'none';

  if (validCandidates.length) {
    const bestCandidate = validCandidates.reduce((prev, next) => (next.value > prev.value ? next : prev));
    measuredHeight = bestCandidate.value;
    preferredSource = bestCandidate.label;
  }

  const fallbackEstimate = Math.max(
    MIN_CHART_CANVAS_HEIGHT + CHART_HEADER_BUFFER + FOOTER_GAP,
    layoutHeightManager?.getLastEstimatedHeight?.() || window.__NAEI_LAST_CHART_HEIGHT || MIN_CHART_CANVAS_HEIGHT
  );

  if (!measuredHeight && documentHeight) {
    measuredHeight = documentHeight;
    preferredSource = 'document';
  }

  if (!measuredHeight) {
    measuredHeight = fallbackEstimate;
    preferredSource = 'fallback';
  }

  if (measuredHeight < 300) {
    measuredHeight = Math.max(1100, fallbackEstimate);
    preferredSource = 'fallback-min';
  }

  return {
    height: Math.round(measuredHeight),
    source: preferredSource,
    documentHeight: Math.round(documentHeight || 0),
    shellBottom,
    mainContentBottom,
    wrapperBottom,
    overlayBottom,
    overlayVisible,
    fallbackEstimate: Math.round(fallbackEstimate)
  };
}

function sendContentHeightToParent(force = false) {
  try {
    if (!IS_EMBEDDED) {
      return;
    }

    const measurement = measureBubbleContentHeight();
    const measuredHeight = Math.max(MIN_CHART_CANVAS_HEIGHT, measurement.height);

    if (!force && lastSentHeight && Math.abs(measuredHeight - lastSentHeight) < MIN_HEIGHT_DELTA) {
      return;
    }

    lastSentHeight = measuredHeight;

    window.parent.postMessage({
      type: 'contentHeight',
      chart: 'bubble',
      height: measuredHeight
    }, '*');

    requestAnimationFrame(() => updateChartWrapperHeight('post-height-send'));
  } catch (error) {
    // Suppress height-posting failures; parent will request updates if needed
  }
}


function notifyParentChartReady() {
  if (chartReadyNotified) {
    sendContentHeightToParent();
    return;
  }

  chartReadyNotified = true;

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'chartReady',
        chart: 'bubble'
      }, '*');
      // Send initial height immediately after signalling readiness
      setTimeout(sendContentHeightToParent, 100);
    }
  } catch (error) {
    // Parent may be unavailable; no logging to keep console quiet
  }
}

/**
 * Reveal main content (no loading overlay to manage)
 */
async function revealMainContent() {
  return new Promise(resolve => {
    const mainContent = document.getElementById('mainContent');
    const loadingOverlay = document.getElementById('loadingOverlay');


    if (!mainContent) {
      console.error('Missing mainContent element for reveal');
      resolve();
      return;
    }

    // Hide loading overlay
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }

    // Make content visible
    mainContent.style.display = 'block';
    mainContent.removeAttribute('aria-hidden');
    freezeWidthForOpera('#downloadBtn', {
      extraPadding: 0,
      attempts: 6,
      attemptDelay: 160
    });
    freezeWidthForOpera('#yearSelect', {
      fixedWidth: 100,
      attempts: 6,
      attemptDelay: 160
    });
    
    // Render the chart
    chartRenderingUnlocked = true;
    const pendingSkipFlag = pendingDrawRequest?.skipHeightUpdate || false;
    pendingDrawRequest = null;
    drawChart(pendingSkipFlag);
    updateChartWrapperHeight('revealMainContent');
    
    // Wait for chart to render, then complete the loading process
    setTimeout(() => {
      
      // Start fade in of main content
      requestAnimationFrame(() => {
        mainContent.classList.add('loaded');
      });
      
      // Complete after transition
      setTimeout(() => {
        updateChartWrapperHeight('post-load');
        notifyParentChartReady();
        resolve();
      }, 16);
    }, 16);
  });
}

/**
 * Auto-load with default selections
 */
/**
 * Render initial view based on URL parameters or defaults (matching linechart v2.3)
 */
async function renderInitialView() {
  return new Promise(resolve => {
    const params = parseUrlParameters();
    const pollutantSelect = document.getElementById('pollutantSelect');
    
    // Use a small timeout to allow the DOM to update with options
    setTimeout(() => {
      
      if (params.pollutantName) {
        const pollutant = window.supabaseModule.allPollutants.find(p => p.pollutant === params.pollutantName);
        if (pollutant) {
          selectedPollutantId = pollutant.id;
          pollutantSelect.value = String(pollutant.id);
        }
      } else {
        // Default to PM2.5 if no pollutant is in the URL
        const pm25 = window.supabaseModule.allPollutants.find(p => p.pollutant === 'PM2.5');
        if (pm25) {
          selectedPollutantId = pm25.id;
          pollutantSelect.value = String(pm25.id);
        }
      }

      // Clear existing group selectors and add new ones based on URL or defaults
      const groupContainer = document.getElementById('groupContainer');
      groupContainer.innerHTML = '';

      if (params.groupNames && params.groupNames.length > 0) {
        // Store comparison flags from URL for use in refreshButtons
        initialComparisonFlags = params.comparisonFlags || [];
        params.groupNames.forEach(name => addGroupSelector(name, false));
      } else {
        // Clear comparison flags for default groups (will be set to checked by default)
        initialComparisonFlags = [];
        // Add default groups if none are in the URL
      const allGroups = window.allGroupsList || [];
        
        // Find specific "Ecodesign Stove - Ready To Burn" group
        const ecodesignGroup = allGroups.find(g => 
          g === 'Ecodesign Stove - Ready To Burn'
        );
        
        // Find "Gas Boilers"  
        const gasBoilerGroup = allGroups.find(g => 
          g.toLowerCase().includes('gas boiler')
        );
        
        // Always try to add both default groups
        if (ecodesignGroup) {
          addGroupSelector(ecodesignGroup, false);
        }
        
        if (gasBoilerGroup) {
          addGroupSelector(gasBoilerGroup, false);
        }
        
        // If we didn't find either specific group, add first 2 available groups
        if (!ecodesignGroup && !gasBoilerGroup && allGroups.length > 0) {
          addGroupSelector(allGroups[0], false);
          if (allGroups.length > 1) {
            addGroupSelector(allGroups[1], false);
          }
        } else if (!ecodesignGroup && gasBoilerGroup && allGroups.length > 0) {
          // If we only found Gas Boilers, add first available group as well
          const firstGroup = allGroups[0];
          if (firstGroup !== gasBoilerGroup) {
            addGroupSelector(firstGroup, false);
          }
        } else if (ecodesignGroup && !gasBoilerGroup && allGroups.length > 1) {
          // If we only found Ecodesign, add second available group as well
          const secondGroup = allGroups.find(g => g !== ecodesignGroup);
          if (secondGroup) {
            addGroupSelector(secondGroup, false);
          }
        }
      }

      // Set year from URL params or default to latest
      const yearSelect = document.getElementById('yearSelect');
      const availableYears = window.supabaseModule.getAvailableYears() || [];
      const mostRecentYear = availableYears.length > 0 ? Math.max(...availableYears) : null;

      if (Number.isInteger(params.year) && yearSelect.querySelector(`option[value="${params.year}"]`)) {
        yearSelect.value = String(params.year);
        selectedYear = params.year;
      } else {
        // Default to most recent available year
        if (mostRecentYear) {
          yearSelect.value = String(mostRecentYear);
          selectedYear = mostRecentYear;
        } else {
          selectedYear = null;
        }
      }
      
      
      // Refresh group dropdowns and buttons after adding default groups
      refreshGroupDropdowns();
      refreshButtons();
      
      resolve();
    }, 50);
  });
}

/**
 * Parse URL parameters (simplified version for scatter chart)
 * Read from parent window if embedded in iframe
 */
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
  
  // Check if this is the active chart - only parse params if chart=1 (bubble chart)
  const chartParam = params.get('chart');
  if (chartParam && chartParam !== '1') {
    // Return empty params so defaults will be used
    return {
      pollutantName: null,
      groupNames: [],
      comparisonFlags: [],
      year: null
    };
  }
  
  const pollutantId = params.get('pollutant_id');
  const groupIdsParam = params.get('group_ids')?.split(',') || [];
  const yearParamRaw = params.get('year');
  const yearParam = yearParamRaw ? parseInt(yearParamRaw, 10) : null;

  const pollutants = window.supabaseModule.allPollutants || [];
  const groups = window.supabaseModule.allGroups || [];
  const activeGroupIdSet = new Set(
    window.supabaseModule.activeActDataGroupIds
    || window.supabaseModule.activeGroupIds
    || []
  );
  const availableYears = window.supabaseModule.getAvailableYears() || [];

  let pollutantName = null;
  if (pollutantId) {
    const pollutant = pollutants.find(p => String(p.id) === String(pollutantId));
    if (pollutant) {
      pollutantName = pollutant.pollutant;
    }
  }

  // Parse group IDs and comparison flags (e.g., "20c" means group 20 with comparison checked)
  let groupNames = [];
  let comparisonFlags = []; // Track which groups should have comparison checkbox checked
  
  if (groupIdsParam && groupIdsParam.length > 0) {
    groupIdsParam.forEach(idStr => {
      const hasComparisonFlag = idStr.endsWith('c');
      const id = parseInt(hasComparisonFlag ? idStr.slice(0, -1) : idStr);
      
      if (id) {
        const group = groups.find(g => g.id === id);
        if (group) {
          if (activeGroupIdSet.size && !activeGroupIdSet.has(group.id)) {
            return;
          }
          groupNames.push(group.group_title);
          comparisonFlags.push(hasComparisonFlag);
        }
      }
    });
  }

  // Validate year against available years
  let year = null;
  if (availableYears.length > 0) {
    const mostRecentYear = Math.max(...availableYears);
    if (Number.isInteger(yearParam) && availableYears.includes(yearParam)) {
      // Year is valid
      year = yearParam;
    } else if (Number.isInteger(yearParam)) {
      // Year provided but invalid - use most recent available
      year = mostRecentYear;
    } else {
      // No year provided - use most recent
      year = mostRecentYear;
    }
  }

  return {
    pollutantName,
    groupNames,
    comparisonFlags,
    year
  };
}

/**
 * Setup year selector
 */
function setupYearSelector() {
  const years = window.supabaseModule.getAvailableYears();
  // Sort years in ascending order (smallest first, 2023 at bottom)
  const sortedYears = [...years].sort((a, b) => a - b);
  const select = document.getElementById('yearSelect');
  
  select.innerHTML = '<option value="">Select year</option>';
  sortedYears.forEach(year => {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    select.appendChild(option);
  });

  // Default to most recent year (which will be the last in the sorted array)
  if (sortedYears.length > 0) {
    selectedYear = sortedYears[sortedYears.length - 1];
    select.value = selectedYear;
  }
}

/**
 * Setup pollutant selector
 */
function setupPollutantSelector() {
  const actDataId = window.supabaseModule.actDataPollutantId || window.supabaseModule.activityDataId;
  const pollutants = window.supabaseModule.allPollutants
    .filter(p => p.id !== actDataId) // Exclude Activity Data
    .sort((a, b) => a.pollutant.localeCompare(b.pollutant));
  
  const select = document.getElementById('pollutantSelect');
  select.innerHTML = '<option value="">Select pollutant</option>';
  
  pollutants.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.pollutant;
    select.appendChild(option);
  });
}

// Get selected groups from dropdown selectors (like linechart)
function getSelectedGroups(){ 
  const selects = document.querySelectorAll('#groupContainer select');
  
  const values = [...selects].map((s, i) => {
    return s.value;
  }).filter(Boolean);
  
  return values;
}

// Add group selector dropdown (adapted from linechart)
function addGroupSelector(defaultValue = "", usePlaceholder = true){
  const groupName = (defaultValue && typeof defaultValue === 'object')
    ? defaultValue.group_title
    : defaultValue;
  const container = document.getElementById('groupContainer');
  const div = document.createElement('div');
  div.className = 'groupRow';
  div.draggable = true; // Make row draggable

  // drag handle (like linechart)
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
  
  // Keyboard handlers for reordering when handleBtn is focused
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
          // Move focus back to the handle for continued keyboard moves
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
      // Keyboard reordering failed; leave current order unchanged
    }
  });
  
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
  allGroups.forEach(groupTitle => {
    if (!selected.includes(groupTitle) || groupTitle === groupName) {
      sel.add(new Option(groupTitle, groupTitle));
    }
  });
  
  
  if (groupName) {
    sel.value = groupName;
    
    // Verify the option exists
    const optionExists = [...sel.options].some(opt => opt.value === groupName);
  }
  sel.addEventListener('change', () => { 
    refreshGroupDropdowns(); 
    refreshButtons();
    updateChart(); 
  });

  controlWrap.appendChild(sel);
  div.appendChild(controlWrap);

  container.appendChild(div);
  addDragAndDropHandlers(div); // Add drag-and-drop event listeners
  
  // Delay the refresh to avoid conflicts during initialization
  setTimeout(() => {
    refreshGroupDropdowns();
    refreshButtons();
    // alignComparisonHeader();
  }, 10);
}

// Refresh group dropdown options (like linechart)
function refreshGroupDropdowns() {
  const allGroups = window.supabaseModule.activeActDataGroups
    || window.supabaseModule.activeGroups
    || window.supabaseModule.allGroups
    || [];
  const allGroupNames = allGroups
    .map(g => g.group_title)
    .filter(Boolean)
    .sort();
  const selected = getSelectedGroups();
  
  document.querySelectorAll('#groupContainer select').forEach(select => {
    const currentValue = select.value;
    // Clear and rebuild options
    select.innerHTML = '';
    
    // Add placeholder
    const ph = new Option('Select group','');
    ph.disabled = true;
    if (!currentValue) ph.selected = true;
    select.add(ph);
    
    // Add available groups
    allGroupNames.forEach(groupTitle => {
      if (!selected.includes(groupTitle) || groupTitle === currentValue) {
        const option = new Option(groupTitle, groupTitle);
        if (groupTitle === currentValue) option.selected = true;
        select.add(option);
      }
    });
  });
}

// Add button management like linechart
function refreshButtons() {
  const container = document.getElementById('groupContainer');
  // Remove any existing Add/Remove buttons to rebuild cleanly
  container.querySelectorAll('.add-btn, .remove-btn').forEach(n => n.remove());

  const rows = container.querySelectorAll('.groupRow');

  // Process all rows to add remove buttons and checkboxes
  rows.forEach(row => {
    // Store current checkbox state before removing (to preserve state when rebuilding)
    const existingCheckbox = row.querySelector('.comparison-checkbox');
    const wasChecked = existingCheckbox ? existingCheckbox.checked : false;
    
    // Remove all existing checkboxes and buttons to rebuild them cleanly
    const existingCheckboxes = row.querySelectorAll('.group-checkbox');
    existingCheckboxes.forEach(checkbox => checkbox.remove());
    const existingRemoveButtons = row.querySelectorAll('.remove-btn');
    existingRemoveButtons.forEach(btn => btn.remove());

    // Add remove button only if there are 2 or more groups
    if (rows.length >= 2) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-btn';
      removeBtn.innerHTML = '<span class="remove-icon" aria-hidden="true"></span> Remove Group';
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
      row.appendChild(removeBtn);
    }
    
    // Comparison statement checkboxes disabled per requirements
    // if (rows.length >= 2) {
    //   const comparisonCheckbox = document.createElement('input');
    //   comparisonCheckbox.type = 'checkbox';
    //   comparisonCheckbox.className = 'group-checkbox comparison-checkbox';
    //   
    //   // Determine checked state
    //   const rowIndex = Array.from(rows).indexOf(row);
    //   
    //   // Priority: 1) Preserve existing state, 2) Use URL flags on initial load, 3) Default to unchecked
    //   if (existingCheckbox) {
    //     // Preserve the current state for existing rows
    //     comparisonCheckbox.checked = wasChecked;
    //   } else if (initialComparisonFlags.length > 0 && rowIndex < initialComparisonFlags.length) {
    //     // Use comparison flag from URL (on initial load only)
    //     comparisonCheckbox.checked = initialComparisonFlags[rowIndex];
    //   } else {
    //     // Default to unchecked for new groups
    //     comparisonCheckbox.checked = false;
    //   }
    //   
    //   comparisonCheckbox.style.width = '18px';
    //   comparisonCheckbox.style.height = '18px';
    //   comparisonCheckbox.style.marginLeft = '50px';
    //   comparisonCheckbox.title = 'Include in comparison statement';
    //   comparisonCheckbox.addEventListener('change', refreshCheckboxes);
    //   row.appendChild(comparisonCheckbox);
    // }
  });
  
  // Clear initialComparisonFlags after first use
  if (initialComparisonFlags.length > 0) {
    initialComparisonFlags = [];
  }
  
  // Align the comparison header with the checkboxes
  // alignComparisonHeader();
  
  // Apply checkbox limit logic (disable unchecked boxes if 2 are already checked)
  refreshCheckboxes();

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
    addBtn.disabled = true;
    addBtn.textContent = 'Maximum 10 groups';
  } else {
    addBtn.disabled = false;
    addBtn.innerHTML = '<span class="add-icon" aria-hidden="true"></span> Add Group';
  }
  
}

// Ensure checkboxes are only checked for two groups at once
function refreshCheckboxes() {
  const checkboxes = document.querySelectorAll('.comparison-checkbox');
  const checkedBoxes = Array.from(checkboxes).filter(checkbox => checkbox.checked);

  // Limit to max 2 checked boxes
  if (checkedBoxes.length > 2) {
    // Uncheck boxes beyond the first 2
    checkedBoxes.forEach((checkbox, index) => {
      if (index >= 2) {
        checkbox.checked = false;
      }
    });
  }
  
  // Recalculate after limiting
  const finalCheckedBoxes = Array.from(checkboxes).filter(checkbox => checkbox.checked);
  
  // Disable unchecked boxes if already at limit (2 checked)
  checkboxes.forEach(checkbox => {
    if (!checkbox.checked && finalCheckedBoxes.length >= 2) {
      checkbox.disabled = true;
      checkbox.style.opacity = '0.5';
      checkbox.style.cursor = 'not-allowed';
    } else {
      checkbox.disabled = false;
      checkbox.style.opacity = '1';
      checkbox.style.cursor = 'pointer';
    }
  });
  
  // Update the comparison statement based on checked boxes count
  drawChart();
}

// Update checkbox behavior when adding a new group
function addGroup() {
  const container = document.getElementById('groupContainer');
  const newGroupRow = document.createElement('div');
  newGroupRow.className = 'groupRow';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'group-checkbox';
  checkbox.checked = false; // Default unchecked for new groups

  newGroupRow.appendChild(checkbox);
  container.appendChild(newGroupRow);

  refreshCheckboxes();
}

/**
 * Setup group selector with dropdown approach like linechart
 */
function setupGroupSelector() {
  const container = document.getElementById('groupContainer');
  container.innerHTML = '';
  
  // Don't add initial group here - let renderInitialView handle defaults
  // addGroupSelector();
}

/**
 * Update chart when selections change
 */
function updateChart() {
  // This will be called automatically when groups change

  // Reset the color system to ensure consistent color assignments
  window.Colors.resetColorSystem();

  // Get selected groups and assign colors
  const selectedGroupNames = getSelectedGroups();
  const colors = selectedGroupNames.map(groupName => window.Colors.getColorForGroup(groupName));

  // Redraw the chart to reflect the new selections
  drawChart();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Year change
  document.getElementById('yearSelect').addEventListener('change', (e) => {
    selectedYear = e.target.value ? parseInt(e.target.value) : null;
    updateChart();
  });

  // Pollutant change
  document.getElementById('pollutantSelect').addEventListener('change', (e) => {
    selectedPollutantId = e.target.value ? parseInt(e.target.value) : null;
    updateChart();
  });

  // Share button
  document.getElementById('shareBtn').addEventListener('click', () => {
    window.ExportShare.showShareDialog();
  });

  // Download PNG button
  document.getElementById('downloadBtn').addEventListener('click', () => {
    window.ExportShare.downloadChartPNG();
  });

  // Download CSV button
  document.getElementById('downloadCSVBtn').addEventListener('click', () => {
    window.ExportShare.exportData('csv');
  });

  // Download Excel button
  document.getElementById('downloadXLSXBtn').addEventListener('click', () => {
    window.ExportShare.exportData('xlsx');
  });

  // Resize handler – only redraw when width/height change beyond threshold to avoid loops
  lastKnownViewportWidth = window.innerWidth || lastKnownViewportWidth;
  window.addEventListener('resize', debounce(() => {
    updateChartWrapperHeight('window-resize');
    const currentWidth = window.innerWidth || 0;
    const currentHeight = window.innerHeight || 0;
    const widthDelta = Math.abs(currentWidth - lastKnownViewportWidth);
    const heightDelta = Math.abs(currentHeight - lastKnownViewportHeight);
    if (widthDelta < RESIZE_THRESHOLD && heightDelta < RESIZE_THRESHOLD) {
      if (!pendingHeightPokeTimer) {
        pendingHeightPokeTimer = setTimeout(() => {
          pendingHeightPokeTimer = null;
          sendContentHeightToParent(true);
        }, 200);
      }
      return;
    }

    lastKnownViewportWidth = currentWidth;
    lastKnownViewportHeight = currentHeight;
    drawChart(true); // Pass skipHeightUpdate flag to prevent immediate update
    
    // After chart redraws and layout settles, check if height actually changed
    setTimeout(() => {
      const currentHeight = Math.max(
        document.body?.scrollHeight || 0,
        document.body?.offsetHeight || 0
      );
      if (lastSentHeight && Math.abs(currentHeight - lastSentHeight) >= MIN_HEIGHT_DELTA) {
        sendContentHeightToParent(true);
      }
    }, 200);
  }, 250));

  if (layoutHeightManager) {
    layoutHeightManager.observeWrapper(() => {
      drawChart(true);
      sendContentHeightToParent(true);
    });
  }
}

/**
 * Draw the scatter chart
 * @param {boolean} skipHeightUpdate - If true, don't send height update to parent (for resize events)
 */
function drawChart(skipHeightUpdate = false) {
  if (!chartRenderingUnlocked) {
    pendingDrawRequest = { skipHeightUpdate };
    return;
  }
  window.ChartRenderer.clearMessage();

  if (!selectedYear) {
    window.ChartRenderer.showMessage('Please select a year', 'warning');
    return;
  }

  if (!selectedPollutantId) {
    window.ChartRenderer.showMessage('Please select a pollutant', 'warning');
    return;
  }

  // Get selected groups from dropdowns
  const selectedGroupNames = getSelectedGroups();
  
  if (selectedGroupNames.length === 0) {
    window.ChartRenderer.showMessage('Please select at least one group', 'warning');
    return;
  }

  // Convert group names to IDs
  const allGroups = window.supabaseModule.allGroups || [];
  
  const selectedGroupIds = selectedGroupNames.map(name => {
    const group = allGroups.find(g => g.group_title === name);
    return group ? group.id : null;
  }).filter(id => id !== null);


  if (selectedGroupIds.length === 0) {
    window.ChartRenderer.showMessage('Selected groups not found', 'warning');
    return;
  }

  const estimateContext = skipHeightUpdate ? 'drawChart-resume' : 'drawChart';
  const latestEstimate = updateChartWrapperHeight(estimateContext);
  if (Number.isFinite(latestEstimate)) {
    window.__BUBBLE_PRE_LEGEND_ESTIMATE = latestEstimate;
  }

  // Reset colors for new chart
  window.Colors.resetColorSystem();

  // Draw chart
  window.ChartRenderer.drawBubbleChart(selectedYear, selectedPollutantId, selectedGroupIds);

  // Update the comparison statement based on checked comparison checkboxes
  const checkedCheckboxes = document.querySelectorAll('.comparison-checkbox:checked');
  const checkedCount = checkedCheckboxes.length;
  
  
  if (checkedCount >= 2) {
    const dataPoints = window.supabaseModule.getScatterData(selectedYear, selectedPollutantId, selectedGroupIds);
    const group1 = dataPoints[0];
    const group2 = dataPoints[1];

    const higherPolluter = group1.pollutantValue > group2.pollutantValue ? group1 : group2;
    const lowerPolluter = group1.pollutantValue > group2.pollutantValue ? group2 : group1;

    const pollutionRatio = lowerPolluter.pollutantValue !== 0 ? higherPolluter.pollutantValue / lowerPolluter.pollutantValue : Infinity;
    const heatRatio = higherPolluter.actDataValue !== 0 ? lowerPolluter.actDataValue / higherPolluter.actDataValue : Infinity;

    const pollutantName = window.supabaseModule.getPollutantName(selectedPollutantId);

    // Get display names for groups
    const higherPolluter_displayName = getGroupDisplayName(higherPolluter.groupName);
    const lowerPolluter_displayName = getGroupDisplayName(lowerPolluter.groupName);

    // Create enhanced comparison statement with arrows and calculated values
    const statement = {
      line1: `${higherPolluter_displayName} emit ${pollutionRatio.toFixed(1)} times more ${pollutantName} than ${lowerPolluter_displayName}`,
      line2: `yet produce around ${heatRatio.toFixed(1)} times less heat nationally`,
      pollutionRatio: pollutionRatio,
      heatRatio: heatRatio,
      pollutantName: pollutantName
    };
    updateComparisonStatement(statement);
  } else {
    // Hide comparison statement when less than 2 checkboxes checked
    hideComparisonStatement();
  }
  
  // Update URL
  updateURL();
  
  // Track chart draw event
  window.supabaseModule.trackAnalytics('bubble_chart_drawn', {
    year: selectedYear,
    pollutant: window.supabaseModule.getPollutantName(selectedPollutantId),
    group_count: selectedGroupIds.length
  });

  // Only send height update if not triggered by resize (prevents growing gap)
  if (!skipHeightUpdate) {
    setTimeout(sendContentHeightToParent, 150);
  }
}

function ensureComparisonDivExists() {
  let comparisonContainer = document.getElementById('comparisonContainer');
  if (!comparisonContainer) {
    comparisonContainer = document.createElement('div');
    comparisonContainer.id = 'comparisonContainer';
    comparisonContainer.style.textAlign = 'center';
    comparisonContainer.style.marginTop = '2px';
    
    const customLegend = document.getElementById('customLegend');
    if (customLegend) {
      customLegend.parentNode.insertBefore(comparisonContainer, customLegend.nextSibling);
    } else {
      console.error('customLegend element not found. Cannot append comparisonContainer.');
    }
  }

  let comparisonDiv = document.getElementById('comparisonDiv');
  if (!comparisonDiv) {
    comparisonDiv = document.createElement('div');
    comparisonDiv.id = 'comparisonDiv';
    comparisonDiv.className = 'comparison-statement';
    comparisonContainer.appendChild(comparisonDiv);
  }
  
  return comparisonDiv;
}

// Get custom display name for comparison statements
function getGroupDisplayName(groupName) {
  const displayNames = {
    'Ecodesign Stove - Ready To Burn': 'Ecodesign stoves burning Ready to Burn wood',
    'Gas Boilers': 'gas boilers'
  };
  return displayNames[groupName] || groupName.toLowerCase();
}

function updateComparisonStatement(statement) {
  const comparisonDiv = ensureComparisonDivExists();
  if (comparisonDiv) {
    comparisonDiv.style.display = 'block'; // Make sure it's visible
    if (typeof statement === 'object' && statement.line1 && statement.line2) {
      // Responsive design using JavaScript-calculated sizes based on window width
      const windowWidth = window.innerWidth;
      
      // Responsive scaling - optimized breakpoints
      let baseScale;
      if (windowWidth <= 480) {
        baseScale = 0.5; // Mobile phones
      } else if (windowWidth <= 768) {
        baseScale = 0.65; // Tablets
      } else if (windowWidth <= 1024) {
        baseScale = 0.8; // Small laptops
      } else if (windowWidth <= 1440) {
        baseScale = 0.9; // Standard desktops
      } else {
        baseScale = 1.0; // Large screens
      }
      
      const triangleWidth = Math.floor(180 * baseScale);
      const triangleHeight = Math.floor(140 * baseScale);
      const triangleBorder = Math.floor(90 * baseScale);
      const triangleBorderHeight = Math.floor(140 * baseScale);
      const triangleTextSize = Math.max(Math.floor(18 * baseScale), 12); // Minimum 12px
      const centerTextSize = Math.max(Math.floor(26 * baseScale), 16); // Minimum 16px
      const containerPadding = Math.floor(25 * baseScale);
      const containerHeight = Math.floor(140 * baseScale);
      const centerPadding = Math.floor(30 * baseScale);
      
      comparisonDiv.innerHTML = `
        <div style="background: #FEAE00 !important; background-image: none !important; padding: ${containerPadding}px; margin: 0 auto; border-radius: 25px; display: flex; justify-content: space-between; align-items: center; min-height: ${containerHeight}px; box-sizing: border-box; width: calc(100% - 140px); position: relative; border: none; box-shadow: none;">
          
          <!-- Left Triangle (UP) -->
          <div style="position: relative; width: ${triangleWidth}px; height: ${triangleHeight}px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 0; height: 0; border-left: ${triangleBorder}px solid transparent; border-right: ${triangleBorder}px solid transparent; border-bottom: ${triangleBorderHeight}px solid #dc2626; position: relative;">
            </div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -25%); color: white; font-weight: bold; font-size: ${triangleTextSize}px; text-align: center; line-height: 1.2;">
              ${statement.pollutionRatio.toFixed(1)} x<br>${statement.pollutantName}
            </div>
          </div>

          <!-- Center Text -->
          <div style="flex: 1; text-align: center; color: white; font-weight: bold; font-size: ${centerTextSize}px; line-height: 1.4; padding: 0 ${centerPadding}px;">
            ${statement.line1}<br><br>${statement.line2}
          </div>

          <!-- Right Triangle (DOWN) -->
          <div style="position: relative; width: ${triangleWidth}px; height: ${triangleHeight}px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 0; height: 0; border-left: ${triangleBorder}px solid transparent; border-right: ${triangleBorder}px solid transparent; border-top: ${triangleBorderHeight}px solid #dc2626; position: relative;">
            </div>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -75%); color: white; font-weight: bold; font-size: ${triangleTextSize}px; text-align: center; line-height: 1.2;">
              ${statement.heatRatio.toFixed(1)}x<br>less<br>heat
            </div>
          </div>

        </div>
      `;
    } else {
      // Simple format for fallback
      comparisonDiv.innerHTML = `
        <div style="background: #f97316; padding: 15px; margin: 15px auto; border-radius: 8px; text-align: center; color: white; font-weight: bold; max-width: 1000px;">
          ${statement}
        </div>
      `;
    }
    comparisonDiv.className = 'comparison-statement';
  }
}

/**
 * Hide the comparison statement
 */
function hideComparisonStatement() {
  const comparisonDiv = document.getElementById('comparisonDiv');
  if (comparisonDiv) {
    comparisonDiv.style.display = 'none';
  } else {
  }
}

/**
 * Show a notification message
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (e.g., 'error', 'success')
 */
function showNotification(message, type) {
  const container = document.querySelector('.notification-container') || document.createElement('div');
  if (!container.className) {
    container.className = 'notification-container';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  container.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      notification.remove();
      if (!container.hasChildNodes()) {
        container.remove();
      }
    }, 300);
  }, 5000);
}

/**
 * Update URL with current parameters
 */
function updateURL() {
  const selectedGroupNames = getSelectedGroups();
  if (!selectedYear || !selectedPollutantId || selectedGroupNames.length === 0) {
    return;
  }

  // Convert group names to IDs for URL
  const allGroups = window.supabaseModule.allGroups || [];
  const groupRows = document.querySelectorAll('.groupRow');
  
  const groupIdsWithFlags = selectedGroupNames.map((name, index) => {
    const group = allGroups.find(g => g.group_title === name);
    if (!group) return null;
    
    // Check if the corresponding checkbox is checked
    const row = groupRows[index];
    const checkbox = row?.querySelector('.comparison-checkbox');
    const isChecked = checkbox?.checked || false;
    
    // Add 'c' suffix if checkbox is checked
    return isChecked ? `${group.id}c` : `${group.id}`;
  }).filter(id => id !== null);

  // Build params array - use raw strings to avoid encoding commas
  const params = [
    `pollutant_id=${selectedPollutantId}`,
    `group_ids=${groupIdsWithFlags.join(',')}`,  // Comma NOT encoded
    `year=${selectedYear}`
  ];
  
  // Update iframe's own URL (for standalone use)
  const query = params.join('&');
  const newURL = window.location.pathname + '?' + query;
  window.history.replaceState({}, '', newURL);
  
  // Send message to parent to update its URL (for embedded use)
  // But ONLY if this is the active chart (chart=1 in parent URL)
  if (window.parent && window.parent !== window) {
    try {
      const parentParams = new URLSearchParams(window.parent.location.search);
      const chartParam = parentParams.get('chart');
      
      // Only send if chart=1 (bubble) or no chart param (default to bubble)
      if (!chartParam || chartParam === '1') {
        window.parent.postMessage({
          type: 'updateURL',
          params: params  // Send as array of raw strings
        }, '*');
      } else {
      }
    } catch (e) {
      // Cross-origin restriction - send anyway (standalone mode)
      window.parent.postMessage({
        type: 'updateURL',
        params: params
      }, '*');
    }
  }
}

/**
 * Load chart from URL parameters
 */
function loadFromURLParameters() {
  const params = new URLSearchParams(window.location.search);
  
  const year = params.get('year');
  const pollutantId = params.get('pollutant_id');
  const groupIds = params.get('group_ids');

  if (year && pollutantId && groupIds) {
    selectedYear = parseInt(year);
    selectedPollutantId = parseInt(pollutantId);
    selectedGroupIds = groupIds.split(',').map(id => parseInt(id));

    // Update UI
    document.getElementById('yearSelect').value = selectedYear;
    document.getElementById('pollutantSelect').value = selectedPollutantId;
    
    // Check appropriate group checkboxes
    selectedGroupIds.forEach(groupId => {
      const checkbox = document.getElementById(`group_${groupId}`);
      if (checkbox) {
        checkbox.checked = true;
      }
    });
    
    updateGroupCheckboxes();

    // Draw chart automatically
    setTimeout(() => {
      drawChart();
    }, 500);
  }
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
  div.addEventListener('drop', () => { 
    refreshGroupDropdowns(); 
    refreshButtons();
    updateChart(); 
  });
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

// Listen for parent window messages (iframe coordination)
window.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') {
    return;
  }

  if (event.data.type === 'overlayHidden') {
    lastSentHeight = 0; // allow re-measurement after parent finishes layout work
    setTimeout(() => sendContentHeightToParent(true), 100);
  }

  if (event.data.type === 'requestHeight') {
    lastSentHeight = 0; // ensure we re-send the latest measurement on explicit request
    sendContentHeightToParent(true);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Align comparison header with checkboxes
function alignComparisonHeader() {
  const header = document.getElementById('comparisonHeader');
  const checkboxes = document.querySelectorAll('.comparison-checkbox');
  
  // Hide header if there are fewer than 2 groups
  const rows = document.querySelectorAll('.groupRow');
  
  if (!header) {
    return;
  }
  
  if (rows.length < 2) {
    header.style.display = 'none';
    return;
  }
  
  // Only show and position header if we have checkboxes to align with
  if (checkboxes.length > 0) {
    header.style.display = 'block';
    
    const firstCheckbox = checkboxes[0];
    const containerRect = header.parentElement.getBoundingClientRect();
    
    // Calculate center position of all checkboxes
    let totalLeft = 0;
    checkboxes.forEach(checkbox => {
      const rect = checkbox.getBoundingClientRect();
      totalLeft += rect.left + (rect.width / 2); // Center of each checkbox
    });
    const averageCenterX = totalLeft / checkboxes.length;
    
    // Center the header horizontally with the average checkbox position
    const headerWidth = 80; // Approximate width of "Comparison Statement"
    const leftOffset = (averageCenterX - containerRect.left) - (headerWidth / 2);
    
    // Position header above first checkbox (moved up more)
    const firstCheckboxRect = firstCheckbox.getBoundingClientRect();
    const topOffset = firstCheckboxRect.top - containerRect.top - 45; // Increased from 35px to 45px
    
    header.style.left = leftOffset + 'px';
    header.style.top = topOffset + 'px';
  } else {
    header.style.display = 'none';
  }
}
