import { useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup } from 'react-leaflet'
import './App.css'

interface LocationPoint {
  lat: number
  lng: number
  timestamp: number
}

interface LapData {
  distance: number
  time: number
  avgSpeed: number
}

export default function App() {
  const [isTracking, setIsTracking] = useState(false)
  const [currentSpeed, setCurrentSpeed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [avgSpeed, setAvgSpeed] = useState(0)
  const [laps, setLaps] = useState<LapData[]>([])
  const [currentLapDistance, setCurrentLapDistance] = useState(0)
  const [currentLapTime, setCurrentLapTime] = useState(0)

  const locationRef = useRef<LocationPoint | null>(null)
  const pathRef = useRef<LocationPoint[]>([])
  const watchIdRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371 // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  const handleLocationUpdate = (position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords
    const newLocation: LocationPoint = { lat: latitude, lng: longitude, timestamp: Date.now() }

    if (locationRef.current) {
      const dist = calculateDistance(
        locationRef.current.lat,
        locationRef.current.lng,
        latitude,
        longitude
      )

      const timeDiff = (newLocation.timestamp - locationRef.current.timestamp) / 3600000 // hours
      const speed = dist / timeDiff

      setCurrentSpeed(Math.max(0, speed))
      setDistance(prev => prev + dist)
      setCurrentLapDistance(prev => prev + dist)
    }

    locationRef.current = newLocation
    pathRef.current.push(newLocation)
  }

  const startTracking = () => {
    if (!isTracking) {
      setIsTracking(true)
      startTimeRef.current = Date.now()

      watchIdRef.current = navigator.geolocation.watchPosition(
        handleLocationUpdate,
        error => console.error('Geolocation error:', error),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
      )

      timerRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = (Date.now() - startTimeRef.current) / 1000
          setElapsedTime(elapsed)
          setCurrentLapTime(elapsed)

          const hours = elapsed / 3600
          if (hours > 0) {
            setAvgSpeed(distance / hours)
          }
        }
      }, 100)
    }
  }

  const stopTracking = () => {
    setIsTracking(false)
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
    }
  }

  const recordLap = () => {
    if (currentLapDistance > 0 && currentLapTime > 0) {
      const lapData: LapData = {
        distance: currentLapDistance,
        time: currentLapTime,
        avgSpeed: currentLapDistance / (currentLapTime / 3600),
      }
      setLaps([...laps, lapData])
      setCurrentLapDistance(0)
      setCurrentLapTime(0)
    }
  }

  const resetData = () => {
    stopTracking()
    setDistance(0)
    setElapsedTime(0)
    setAvgSpeed(0)
    setCurrentSpeed(0)
    setLaps([])
    setCurrentLapDistance(0)
    setCurrentLapTime(0)
    locationRef.current = null
    pathRef.current = []
    startTimeRef.current = null
  }

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const mapCenter: [number, number] = locationRef.current
    ? [locationRef.current.lat, locationRef.current.lng]
    : [51.505, -0.09]

  const pathCoordinates = pathRef.current.map(p => [p.lat, p.lng] as [number, number])
  const polylineOptions = { color: 'blue', weight: 3, opacity: 0.7 }
  const circleMarkerOptions = { radius: 8, fillColor: '#ff7800', color: '#ff7800', weight: 2, opacity: 1, fillOpacity: 0.8 }

  return (
    <div className="container">
      <div className="metrics-panel">
        <div className="header">
          <h1>🚴 Cycle Computer</h1>
        </div>

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Speed</div>
            <div className="metric-value">{currentSpeed.toFixed(1)}</div>
            <div className="metric-unit">km/h</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Distance</div>
            <div className="metric-value">{distance.toFixed(2)}</div>
            <div className="metric-unit">km</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Time</div>
            <div className="metric-value">{formatTime(elapsedTime)}</div>
            <div className="metric-unit">hh:mm:ss</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Avg Speed</div>
            <div className="metric-value">{avgSpeed.toFixed(1)}</div>
            <div className="metric-unit">km/h</div>
          </div>
        </div>

        <div className="lap-info">
          <h3>Current Lap</h3>
          <div className="lap-stats">
            <div>Distance: {currentLapDistance.toFixed(2)} km</div>
            <div>Time: {formatTime(currentLapTime)}</div>
            {currentLapTime > 0 && (
              <div>Speed: {(currentLapDistance / (currentLapTime / 3600)).toFixed(1)} km/h</div>
            )}
          </div>
        </div>

        <div className="controls">
          <button
            className={`btn btn-primary ${isTracking ? 'active' : ''}`}
            onClick={isTracking ? stopTracking : startTracking}
          >
            {isTracking ? 'Stop' : 'Start'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={recordLap}
            disabled={!isTracking}
          >
            Lap
          </button>
          <button className="btn btn-danger" onClick={resetData}>
            Reset
          </button>
        </div>

        {laps.length > 0 && (
          <div className="laps-history">
            <h3>Laps History</h3>
            <div className="laps-list">
              {laps.map((lap, idx) => (
                <div key={idx} className="lap-item">
                  <span>Lap {idx + 1}</span>
                  <span>{lap.distance.toFixed(2)} km</span>
                  <span>{formatTime(lap.time)}</span>
                  <span>{lap.avgSpeed.toFixed(1)} km/h</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="map-panel">
        <MapContainer center={mapCenter} zoom={15} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          {pathCoordinates.length > 0 && (
            <Polyline positions={pathCoordinates} pathOptions={polylineOptions} />
          )}
          {locationRef.current && (
            <CircleMarker center={[locationRef.current.lat, locationRef.current.lng]} pathOptions={circleMarkerOptions}>
              <Popup>Current Location</Popup>
            </CircleMarker>
          )}
        </MapContainer>
      </div>
    </div>
  )
}
