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
Privacy-friendly analytics tracking system.
- Session tracking
- User fingerprinting (privacy-preserving)
- Country detection via timezone
- Exports: `Analytics.trackAnalytics()`, `Analytics.getUserCountry()`, etc.

#### `colors.js`
Consistent color palette and assignment logic.
- 10-color distinct palette for data visualization
- Category-based color preferences (fireplace=red, power=green, etc.)
- Smart color assignment avoiding duplicates
- Exports: `Colors.getColorForGroup()`, `Colors.resetColorSystem()`, etc.

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
<link rel="stylesheet" href="../Shared Resources/common-styles.css">

<!-- Scripts -->
<script src="../Shared Resources/supabase-config.js"></script>
<script src="../Shared Resources/analytics.js"></script>
<script src="../Shared Resources/colors.js"></script>

<!-- Images -->
<img src="../Shared Resources/images/CIC - Square - Border - Words - Alpha 360x360.png" alt="CIC Logo">
```

### In JavaScript
```javascript
// Initialize Supabase
const supabase = window.SupabaseConfig.initSupabaseClient();

// Track analytics
window.Analytics.trackAnalytics(supabase, 'event_name', { data: 'value' });

// Get colors
const color = window.Colors.getColorForGroup('groupName');
window.Colors.resetColorSystem(); // Reset for new chart
```

## Applications Using Shared Resources

1. **NAEI Multi-Group Line Chart Viewer** (`../CIC-test-naei-linechart/v2.3-modular-CIC-testdb/`)
   - Time-series line charts comparing emissions across years
   - Multiple groups, year range selection

2. **NAEI Activity Data Scatter Chart** (`../CIC-test-naei-activity-data-scatterchart/`)
   - Scatter plots showing activity data vs pollutant emissions
   - Single year, multiple groups (up to 10)

## Maintenance

When updating shared resources:
1. Test changes in all applications using the resources
2. Ensure backwards compatibility
3. Update this README if new resources are added
4. Document any breaking changes

## Database Schema

The shared Supabase configuration connects to these tables:
- `NAEI_global_Pollutants` - Pollutant definitions and units
- `NAEI_global_t_Group` - Emission source group definitions
- `NAEI_2023ds_t_Group_Data` - Time-series data (1970-2023)
- `analytics_events` - Usage analytics tracking (optional)

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
- `page_load` - Application initialized
- `chart_drawn` / `scatter_chart_drawn` - Chart rendered
- `share_url_copied` - Shareable URL copied
- `share_png_copied` - Chart image copied to clipboard
- `chart_downloaded` / `scatter_chart_downloaded` - PNG downloaded

Analytics can be disabled with URL parameter: `?analytics=off`

## Credits

- Created for [Chronic Illness Channel](https://www.youtube.com/@ChronicIllnessChannel)
- Data from [UK NAEI](https://naei.beis.gov.uk/)
- Built with Supabase, Google Charts, and vanilla JavaScript
