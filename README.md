# 🚴 Cycle Computer

A responsive web-based cycle computer app that tracks cycling metrics and displays real-time location on a map.

## Features

- **Real-time Metrics**: Speed, distance, elapsed time, and average speed
- **GPS Tracking**: Continuous location tracking with visual trail on the map
- **Lap Recording**: Track multiple laps with individual statistics
- **Map Navigation**: OpenStreetMap integration with current position display
- **Responsive Design**: Works on desktop and mobile devices

## Metrics Displayed

**Left Panel:**
- Current Speed (km/h)
- Total Distance (km)
- Elapsed Time (hh:mm:ss)
- Average Speed (km/h)
- Current Lap Information
- Lap History

**Right Panel:**
- Interactive map showing the cycling route
- Current location marker
- Route polyline

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

The app will open at http://localhost:5173

## Building

```bash
npm run build
```

## Requirements

- Modern web browser with geolocation support
- HTTPS connection (required for geolocation API on production)

## Technologies

- React 18
- TypeScript
- Vite
- Leaflet & React-Leaflet
- OpenStreetMap
