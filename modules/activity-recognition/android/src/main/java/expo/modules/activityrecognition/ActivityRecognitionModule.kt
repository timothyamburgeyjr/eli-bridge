package expo.modules.activityrecognition

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionClient
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Activity Recognition module — thin Kotlin wrapper around Google Play
 * Services' ActivityRecognitionClient.
 *
 * Lifecycle:
 *   startUpdates(intervalMs) → requestActivityUpdates(intervalMs, PendingIntent)
 *   stopUpdates()           → removeActivityUpdates(PendingIntent)
 *
 * The PendingIntent targets ActivityRecognitionReceiver, which parses each
 * broadcast, picks the highest-confidence DetectedActivity (skipping noisy
 * TILTING/UNKNOWN values), maps it to a TransportMode string, and stores it
 * in a companion-object var. getCurrentActivity() reads that var — sticky,
 * so a JS read shortly after the receiver fires still sees the value.
 *
 * Permission handling is intentionally NOT done here. The JS service layer
 * uses React Native's PermissionsAndroid to prompt; this module only reports
 * the current grant state via hasPermission().
 */
class ActivityRecognitionModule : Module() {

  private val context: Context
    get() = appContext.reactContext
      ?: throw IllegalStateException("React context unavailable")

  private val client: ActivityRecognitionClient
    get() = ActivityRecognition.getClient(context)

  // Lazy so the PendingIntent is reused across start/stop pairs — the same
  // instance must be passed to removeActivityUpdates as was given to
  // requestActivityUpdates, or the OS won't recognize the subscription.
  private val pendingIntent: PendingIntent by lazy {
    val intent = Intent(context, ActivityRecognitionReceiver::class.java).apply {
      action = ACTION_ACTIVITY_RESULT
    }
    // FLAG_MUTABLE is required on Android 12+ because the system writes the
    // ActivityRecognitionResult extras into the intent before delivering it.
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
  }

  override fun definition() = ModuleDefinition {
    Name("ActivityRecognitionModule")

    AsyncFunction("hasPermission") { promise: Promise ->
      promise.resolve(checkPermissionGranted())
    }

    AsyncFunction("startUpdates") { intervalMs: Int, promise: Promise ->
      if (!checkPermissionGranted()) {
        promise.reject(
          "AR_PERMISSION_DENIED",
          "ACTIVITY_RECOGNITION not granted — call JS-side requestActivityPermission() first",
          null
        )
        return@AsyncFunction
      }
      client.requestActivityUpdates(intervalMs.toLong(), pendingIntent)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e ->
          promise.reject("AR_START_FAILED", e.message ?: "requestActivityUpdates failed", e)
        }
    }

    AsyncFunction("stopUpdates") { promise: Promise ->
      client.removeActivityUpdates(pendingIntent)
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { e ->
          promise.reject("AR_STOP_FAILED", e.message ?: "removeActivityUpdates failed", e)
        }
    }

    AsyncFunction("getCurrentActivity") { promise: Promise ->
      val latest = ActivityRecognitionReceiver.latest
      if (latest == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val map = HashMap<String, Any?>()
      map["activity"] = latest.activity
      map["confidence"] = latest.confidence
      map["timestamp"] = latest.timestamp
      promise.resolve(map)
    }
  }

  /**
   * Android 10+ promoted ACTIVITY_RECOGNITION to a runtime permission. On
   * older versions it's install-time and always present, so we short-circuit
   * to true rather than calling checkSelfPermission (which would still work
   * but isn't necessary).
   */
  private fun checkPermissionGranted(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACTIVITY_RECOGNITION,
    ) == PackageManager.PERMISSION_GRANTED
  }

  companion object {
    const val ACTION_ACTIVITY_RESULT =
      "expo.modules.activityrecognition.ACTION_ACTIVITY_RESULT"
    private const val REQUEST_CODE = 0
  }
}
