# 🔄 WIP Sessions Viewer

## Overview
The WIP (Work In Progress) Sessions viewer provides real-time visibility into active and recent user sessions on the NAEI Multi-Group Pollutant Viewer. This feature helps you monitor current user activity and understand engagement patterns as they happen.

## What is a WIP Session?
A "Work In Progress" session represents an active or recent user interaction with the viewer. Sessions are automatically tracked through the analytics system and include:

- **Active Sessions**: Users who have interacted within the last 5 minutes
- **Recent Sessions**: Users who were active within the selected time window but are now idle
- **Session Progress**: Number of events, duration, and activities performed

## Features

### 📊 Real-Time Session Monitoring
- Live view of user sessions within a configurable time window (5 minutes to 3 hours)
- Auto-refresh every 30 seconds to show latest activity
- Visual status indicators (Active/Recent/Idle) with color coding

### 📈 Session Progress Tracking
Each session card displays:
- **Session ID**: Unique identifier for the session
- **Status**: Active (< 5 min), Recent (< 15 min), or Idle
- **Last Activity**: How long ago the user was last active
- **Duration**: Total time the user has been active
- **Event Count**: Number of interactions performed
- **Country**: Geographic location (privacy-friendly timezone-based)
- **Progress Bar**: Visual indicator of session engagement
- **Activity Summary**: Breakdown of event types and pollutants viewed

### 🔍 Filtering Options
- **Time Window**: Select from 5 minutes to 3 hours of session history
- **Minimum Events**: Filter sessions by minimum number of interactions
- **Quick Statistics**: Overview of total sessions, active sessions, events, and average duration

## Accessing the WIP Sessions Viewer

### Option 1: Direct URL
Navigate to: `wip-sessions.html`

### Option 2: From Analytics Dashboard
Click the **"🔄 View WIP Sessions"** button on the analytics dashboard

### Option 3: Mobile-Friendly Access
The viewer is fully responsive and optimized for mobile devices, including:
- GitHub mobile app preview
- iOS Safari
- Android Chrome
- Any mobile browser

## Use Cases

### 1. Real-Time Monitoring
Monitor active users and their behavior as they interact with the viewer. Perfect for:
- Testing new features
- Observing user patterns during peak hours
- Identifying engaged users

### 2. Session Analysis
Understand how users progress through the application:
- Average session duration
- Common event sequences
- Popular pollutants and groups

### 3. Engagement Insights
Track user engagement levels:
- Active vs. idle sessions
- Event frequency per session
- Geographic distribution of users

## Privacy & Security

### Privacy-First Design
- **No Personal Data**: Only anonymous session IDs and fingerprints are tracked
- **GDPR Compliant**: Users cannot be individually identified
- **Minimal Fingerprinting**: Basic browser info for unique user counting only
- **Local Storage**: All data stays in your Supabase instance

### Data Retention
Session data is stored in the `analytics_events` table in Supabase. You control:
- How long data is retained
- Who can access the WIP viewer
- What gets tracked

## Technical Details

### Session Status Classification
```
Active:  Last activity < 5 minutes ago
Recent:  Last activity < 15 minutes ago
Idle:    Last activity > 15 minutes ago
```

### Auto-Refresh
The page automatically refreshes every 30 seconds to show the latest sessions without requiring manual page reload.

### Mobile Optimization
The interface is designed with mobile-first principles:
- Responsive grid layout
- Touch-friendly controls
- Optimized for small screens
- Fast loading on mobile networks

## Requirements

### Prerequisites
- Supabase account with analytics setup
- Analytics events table (created via `analytics_setup.sql`)
- Supabase URL and API key configured in `supabase.js`

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Android Chrome)
- GitHub mobile app preview

## Troubleshooting

### No Sessions Displayed
1. Check that analytics tracking is enabled in the main viewer
2. Verify Supabase connection in browser console
3. Ensure time window is wide enough (try 1-3 hours)
4. Lower the minimum events filter

### Sessions Not Updating
1. Check browser console for errors
2. Verify Supabase credentials are correct
3. Ensure analytics_events table exists
4. Check internet connection

### Mobile Display Issues
1. Ensure viewport meta tag is present
2. Clear browser cache
3. Try rotating device orientation
4. Update browser to latest version

## Future Enhancements

Potential improvements for the WIP sessions viewer:
- Real-time WebSocket updates (instead of polling)
- Session replay capability
- Advanced filtering by country, device, or pollutant
- Export session data to CSV
- Session comparison tools
- Notification alerts for high-value sessions

## Related Pages

- **Analytics Dashboard** (`analytics-dashboard.html`): Historical analytics and statistics
- **Main Viewer** (`index.html`): The NAEI Multi-Group Pollutant Viewer
- **Analytics Setup** (`ANALYTICS_SETUP.md`): Instructions for setting up analytics

## Support

For issues or questions:
1. Check the main README.md
2. Review ANALYTICS_SETUP.md
3. Visit the YouTube Channel: [@ChronicIllnessChannel](https://www.youtube.com/@ChronicIllnessChannel)
