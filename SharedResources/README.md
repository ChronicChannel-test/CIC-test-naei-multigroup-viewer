# Shared Resources for NAEI Data Viewers

This directory contains shared assets and modules used by multiple NAEI data visualization applications.

## Contents

### Images (`images/`)
- `CIC - Square - Border - Words - Alpha 360x360.png` - Chronic Illness Channel logo
- `favicon.png` - Website favicon
- `Bluesky_Logo.svg` - Bluesky social media icon
- `Twitter dead bird with X.svg` - X/Twitter social media icon
- `facebook.svg` - Facebook social media icon
- `youtube-logo-6.svg` - YouTube social media icon
- `kofi_symbol.png` - Ko-fi support icon
- `kofi_symbol.svg` - Ko-fi support icon (vector)

### JavaScript Modules

#### `supabase-config.js`
Centralized Supabase database connection configuration.
- Exports: `SupabaseConfig.initSupabaseClient()`
- Used by all applications to connect to the NAEI database

#### `analytics.js`
Lightweight site-wide analytics helper.
- Session tracking via sessionStorage IDs (no fingerprinting)
- Auto `page_drawn` event + manual `interaction` events
- Country detection via timezone/locale (best-effort)
- Exports: `SiteAnalytics.trackInteraction()`, `SiteAnalytics.trackPageView()`, legacy `Analytics.trackAnalytics()` shim

#### `colors.js`
Consistent color palette and assignment logic.
- 10-color distinct palette for data visualization
- Category-based color preferences (fireplace=red, power=green, etc.)
- Smart color assignment avoiding duplicates
- Exports: `Colors.getColorForCategory()`, `Colors.resetColorSystem()`, etc.

### Stylesheets

#### `common-styles.css`
Base styling shared across all NAEI viewers:
- Typography and layout
- Branding and logo placement
- Form controls (buttons, selects)
- Chart wrappers
- Loading overlays
- Modal/dialog styles
- Responsive design adjustments

## Usage

### In HTML
```html
<!-- Styles -->
<link rel="stylesheet" href="../SharedResources/common-styles.css">

<!-- Scripts -->
<script src="../SharedResources/supabase-config.js"></script>
<script src="../SharedResources/analytics.js"></script>
<script src="../SharedResources/colors.js"></script>

<!-- Images -->
<img src="../SharedResources/images/CIC - Square - Border - Words - Alpha 360x360.png" alt="CIC Logo">
```

### In JavaScript
```javascript
// Optional: set a friendly slug or defaults before auto page_drawn fires
window.SiteAnalytics.configure({
   pageSlug: '/linechart',
   defaults: { app: 'linechart' }
});

// Track a user interaction
window.SiteAnalytics.trackInteraction('share_click', {
   format: 'png',
   pollutant: 'PM2.5'
});

// Get colors
const color = window.Colors.getColorForCategory('categoryName');
window.Colors.resetColorSystem(); // Reset for new chart
```

## Applications Using Shared Resources

1. **NAEI Multi-Group Line Chart Viewer** (`../CIC-test-naei-linechart-v2.4/`)
   - Time-series line charts comparing emissions across years
   - Multiple groups, flexible year range selection

2. **NAEI Activity Data Scatter Chart** (`../CIC-test-naei-scatterchart-v2.0/`)
   - Scatter plots showing activity data vs pollutant emissions
   - Single year, multiple groups (up to 10)

3. **NAEI Activity Data Bubble Chart** (`../CIC-test-naei-bubblechart-v2.0/`)
   - Bubble visualization showing pollutant vs activity with emission factor sizing
   - Single year focus with responsive comparison overlays

## Maintenance

When updating shared resources:
1. Test changes in all applications using the resources
2. Ensure backwards compatibility
3. Update this README if new resources are added
4. Document any breaking changes

## Database Schema

The shared Supabase configuration connects to these tables:
- `naei_global_t_pollutant` - Pollutant definitions and units
- `naei_global_t_category` - Emission source group definitions
- `naei_2023ds_t_category_data` - Time-series data (1970-2023)
- `site_events` - Lightweight site-wide analytics (optional)

## Color Palette

The shared color palette (from `colors.js`):
1. `#E6194B` - Red (fireplace)
2. `#3CB44B` - Green (power stations)
3. `#FFE119` - Yellow
4. `#4363D8` - Blue (gas)
5. `#F58231` - Orange (ecodesign)
6. `#911EB4` - Purple
7. `#46F0F0` - Cyan (road transport)
8. `#F032E6` - Magenta
9. `#BCF60C` - Lime
10. `#FABEBE` - Pink

Category assignments:
- Ecodesign → Orange
- Fireplace → Red
- Gas → Blue
- Power → Green
- Road → Cyan

## Analytics Events

Standard analytics events tracked across applications:
- `page_drawn` - Emitted automatically once per load when the DOM is ready
- `interaction` - Custom label provided via `trackInteraction(label, data)`
- `page_seen` - Optional heartbeat fired ~15s after load to approximate human viewing

Analytics can be disabled with URL parameter: `?analytics=off`

## Credits

- Created for [Chronic Illness Channel](https://www.youtube.com/@ChronicIllnessChannel)
- Data from [UK NAEI](https://naei.beis.gov.uk/)
- Built with Supabase, Google Charts, and vanilla JavaScript
