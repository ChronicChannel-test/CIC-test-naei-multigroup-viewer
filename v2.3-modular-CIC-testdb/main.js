// Main chart logic, event handlers, and UI extracted from v2.2 index.html

// Chart rendering and UI logic
const distinctPalette=['#E6194B','#3CB44B','#FFE119','#4363D8','#F58231','#911EB4','#46F0F0','#F032E6','#BCF60C','#FABEBE'];
const categoryBaseColor={ecodesign:distinctPalette[4],fireplace:distinctPalette[0],gas:distinctPalette[3],power:distinctPalette[1],road:distinctPalette[6]};
let colorCache={}, availableColors=[...distinctPalette];
let chart;
let seriesVisibility = [];
const EXPORT_MIN_SCALE = 16;
const EXPORT_MAX_DIM = 16000;
const EXPORT_MAX_PIXELS = 100_000_000;
let smoothLines = true;
google.charts.load('current', {packages:['corechart']});

function resetColorSystem() { /* ...existing code from v2.2... */ }
function getColorForGroup(name) { /* ...existing code from v2.2... */ }
function computeSafeExportScale(origW, origH, desiredScale) { /* ...existing code from v2.2... */ }
function setupSelectors() { /* ...existing code from v2.2... */ }
function getSelectedGroups() { /* ...existing code from v2.2... */ }
function addGroupSelector(defaultValue = "", usePlaceholder = true) { /* ...existing code from v2.2... */ }
function refreshGroupDropdowns() { /* ...existing code from v2.2... */ }
function refreshButtons() { /* ...existing code from v2.2... */ }
function calculateYearTicks(years, chartWidth) { /* ...existing code from v2.2... */ }
function pruneYearsFromSVG(svgRoot, opts = {}) { /* ...existing code from v2.2... */ }
function addDragAndDropHandlers(div) { /* ...existing code from v2.2... */ }
function getDragAfterElement(container, y) { /* ...existing code from v2.2... */ }
function updateChart() { /* ...existing code from v2.2... */ }
window.addEventListener('resize', () => { clearTimeout(window._resizeTimer); window._resizeTimer = setTimeout(updateChart, 200); });
async function renderInitialView() { /* ...existing code from v2.2... */ }
async function revealMainContent() { /* ...existing code from v2.2... */ }
function setupDownloadButton() { /* ...existing code from v2.2... */ }
function setupInteractionTracking() { /* ...existing code from v2.2... */ }
function setupSmoothingToggle() { /* ...existing code from v2.2... */ }
function parseUrlParameters() { /* ...existing code from v2.2... */ }
async function init() { /* ...existing code from v2.2... */ }
document.addEventListener('DOMContentLoaded', () => google.charts.setOnLoadCallback(init));
