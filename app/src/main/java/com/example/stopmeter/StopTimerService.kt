package com.example.stopmeter

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlin.math.sqrt

/**
 * 停車時間の判定処理をフォアグラウンドサービスとして実行する。
 * これにより、他のアプリを開いていたり画面がスリープしていても
 * GPS/加速度センサーによる計測がバックグラウンドで継続する。
 */
class StopTimerService : Service() {

    companion object {
        const val ACTION_START = "com.example.stopmeter.action.START"
        const val ACTION_STOP  = "com.example.stopmeter.action.STOP"
        private const val CHANNEL_ID   = "stopmeter_running"
        private const val NOTIFICATION_ID = 1001
    }

    private val handler = Handler(Looper.getMainLooper())
    private var locationManager: LocationManager? = null
    private var sensorManager: SensorManager? = null
    private var tickRunnable: Runnable? = null

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(loc: Location) {
            AppState.engine.lastGpsSpeedKmh = if (loc.hasSpeed()) loc.speed * 3.6 else null
            AppState.engine.lastGpsUpdateAt = System.currentTimeMillis()
        }
        @Deprecated("Deprecated in Java")
        override fun onStatusChanged(p: String?, s: Int, e: Bundle?) {}
        override fun onProviderEnabled(p: String) {}
        override fun onProviderDisabled(p: String) {}
    }

    private val sensorListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            val x = event.values[0]; val y = event.values[1]; val z = event.values[2]
            AppState.engine.pushAccel(sqrt((x * x + y * y + z * z).toDouble()))
        }
        override fun onAccuracyChanged(s: Sensor?, a: Int) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        // プロセスが再生成された場合に備え、保存済みの設定・履歴を読み込む
        Prefs.loadInto(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                finalizeAndStop()
                return START_NOT_STICKY
            }
            else -> startMeasuring()
        }
        return START_STICKY
    }

    private fun hasLocationPermission(): Boolean {
        val fine   = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }

    private fun startMeasuring() {
        val notification = buildNotification("計測中", "GPS/加速度センサーで停車時間を計測しています")
        try {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } catch (e: Exception) {
            AppState.message = "バックグラウンド計測の開始に失敗しました: ${e.message}"
            stopSelf()
            return
        }

        AppState.running = true
        if (AppState.measurementStartMs == null && AppState.lastBreakEndMs == null) {
            AppState.measurementStartMs = System.currentTimeMillis()
        }

        locationManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        sensorManager   = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val accelSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
            ?: sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        if (hasLocationPermission()) {
            try {
                listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).forEach { p ->
                    if (locationManager?.isProviderEnabled(p) == true) {
                        locationManager?.requestLocationUpdates(p, 1000L, 0f, locationListener, Looper.getMainLooper())
                    }
                }
            } catch (e: SecurityException) {
                AppState.message = "位置情報の取得に失敗しました: ${e.message}"
            }
        }
        accelSensor?.let { sensorManager?.registerListener(sensorListener, it, SensorManager.SENSOR_DELAY_NORMAL) }

        startTickLoop()
    }

    private fun startTickLoop() {
        stopTickLoop()
        val runnable = object : Runnable {
            override fun run() {
                if (!AppState.running) return
                tick()
                handler.postDelayed(this, TICK_MS)
            }
        }
        tickRunnable = runnable
        handler.post(runnable)
    }

    private fun stopTickLoop() {
        tickRunnable?.let { handler.removeCallbacks(it) }
        tickRunnable = null
    }

    private fun tick() {
        val engine = AppState.engine
        val now = System.currentTimeMillis()

        // 速度取得（GPS優先、GPSが無い/古い場合は加速度センサーで補佐）
        val gpsIsFresh = engine.lastGpsUpdateAt != 0L && (now - engine.lastGpsUpdateAt) <= GPS_STALE_MS
        engine.smoothedSpeedKmh = if (gpsIsFresh) {
            engine.lastGpsSpeedKmh?.let { gps ->
                val prev = engine.smoothedSpeedKmh
                if (prev == null) gps else prev * 0.7 + gps * 0.3
            }
        } else null

        val hasRealSpeed = engine.smoothedSpeedKmh != null
        val currentSpeedKmh: Double
        var stoppedNow: Boolean
        if (hasRealSpeed) {
            currentSpeedKmh    = engine.smoothedSpeedKmh!!
            stoppedNow         = currentSpeedKmh <= STOP_SPEED_KMH
            AppState.displaySpeed = currentSpeedKmh
        } else {
            val moving = engine.accelVariance() > ACCEL_VAR_THRESHOLD
            stoppedNow = !moving
            currentSpeedKmh = 0.0
            AppState.displaySpeed = null
        }

        if (AppState.manualStop) {
            stoppedNow = true
        }

        if (hasRealSpeed && currentSpeedKmh > RESERVE_CANCEL_SPEED) {
            if (AppState.reserved)   AppState.reserved = false
            if (AppState.manualStop) AppState.manualStop = false
        }

        if (stoppedNow) {
            if (engine.currentStopStart == null) {
                engine.currentStopStart = now
                AppState.currentStopQualified = false
            }
            AppState.currentStopMs = now - (engine.currentStopStart ?: now)

            if (AppState.currentStopMs >= AppState.qualifyMs && !AppState.currentStopQualified && !AppState.reserved) {
                AppState.currentStopQualified = true
            }
        } else {
            val start = engine.currentStopStart
            if (start != null) {
                val dur = now - start
                if (dur >= AppState.qualifyMs && !AppState.reserved) {
                    AppState.totalMs       += dur
                    AppState.lastBreakEndMs = now
                    AppState.intervalMs     = 0L
                    AppState.breakWarning   = BreakWarning.NONE
                    AppState.recordBreak(applicationContext, start, now)
                }
                engine.currentStopStart = null
                AppState.currentStopQualified = false
            }
            AppState.currentStopMs = 0L

            val base = AppState.lastBreakEndMs ?: AppState.measurementStartMs
            if (base != null) AppState.intervalMs = now - base
        }

        if ((AppState.lastBreakEndMs != null || AppState.measurementStartMs != null) && !stoppedNow) {
            AppState.breakWarning = when {
                AppState.intervalMs >= DANGER_MS -> BreakWarning.DANGER
                AppState.intervalMs >= WARN_MS   -> BreakWarning.WARN
                else                              -> BreakWarning.NONE
            }
        }

        AppState.statusKind = when {
            !stoppedNow -> StatusKind.MOVING
            AppState.currentStopMs >= AppState.qualifyMs && !AppState.reserved -> StatusKind.COUNTING
            else -> StatusKind.PENDING
        }

        updateNotification()
    }

    private fun finalizeAndStop() {
        val engine = AppState.engine
        val start = engine.currentStopStart
        if (start != null) {
            val endMs = System.currentTimeMillis()
            val dur = endMs - start
            if (dur >= AppState.qualifyMs && !AppState.reserved) {
                AppState.totalMs       += dur
                AppState.lastBreakEndMs = endMs
                AppState.intervalMs     = 0L
                AppState.breakWarning   = BreakWarning.NONE
                AppState.recordBreak(applicationContext, start, endMs)
            }
            engine.currentStopStart = null
        }
        AppState.currentStopMs = 0L
        AppState.statusKind    = StatusKind.IDLE
        AppState.running       = false

        stopTickLoop()
        locationManager?.removeUpdates(locationListener)
        sensorManager?.unregisterListener(sensorListener)

        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopTickLoop()
        locationManager?.removeUpdates(locationListener)
        sensorManager?.unregisterListener(sensorListener)
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "停車時間計測", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "計測中はここに現在の状態を表示します"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(title: String, text: String): Notification {
        val openAppIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = openAppIntent?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    private var lastNotificationText: String = ""

    private fun updateNotification() {
        val statusText = when (AppState.statusKind) {
            StatusKind.MOVING   -> "走行中 ・ 合計 ${fmtHMS(AppState.totalMs)}"
            StatusKind.COUNTING -> "停車中（加算対象） ・ 合計 ${fmtHMS(AppState.totalMs + AppState.currentStopMs)}"
            StatusKind.PENDING  -> "停車中 ・ 合計 ${fmtHMS(AppState.totalMs)}"
            StatusKind.IDLE     -> "計測中 ・ 合計 ${fmtHMS(AppState.totalMs)}"
        }
        if (statusText == lastNotificationText) return
        lastNotificationText = statusText
        val notification = buildNotification("停車時間加算アプリ", statusText)
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }
}
