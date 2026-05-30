package expo.modules.activityrecognition

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * Receives Activity Recognition broadcasts fired by our PendingIntent.
 *
 * On each broadcast we:
 *   1. Extract the ActivityRecognitionResult (containing 1..N candidate
 *      DetectedActivity entries, each with a confidence 0–100).
 *   2. Drop noisy types (TILTING, UNKNOWN) — feeding those into the emote
 *      pipeline would pollute Eli's framing with garbage like "Tim: tilting".
 *   3. Pick the highest-confidence remaining candidate.
 *   4. Map Android's type constants to the project's TransportMode strings.
 *   5. Store on the companion object — JS reads via getCurrentActivity().
 *
 * Stored in a static companion var rather than dispatched as an event so JS
 * pulls on its own cadence (the 15s sessionPoller tick) instead of every
 * receiver fire, which keeps the JS bridge quiet.
 */
class ActivityRecognitionReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ActivityRecognitionModule.ACTION_ACTIVITY_RESULT) return
    if (!ActivityRecognitionResult.hasResult(intent)) return

    val result = ActivityRecognitionResult.extractResult(intent) ?: return

    val best = result.probableActivities
      .filter { it.type != DetectedActivity.UNKNOWN && it.type != DetectedActivity.TILTING }
      .maxByOrNull { it.confidence }
      ?: return

    val mapped = mapType(best.type) ?: return

    latest = Latest(
      activity = mapped,
      confidence = best.confidence,
      timestamp = result.time,
    )
  }

  data class Latest(
    val activity: String,
    val confidence: Int,
    val timestamp: Long,
  )

  companion object {
    /**
     * Last detection — sticky across reads. Volatile so a JS read from the
     * main thread sees a write from the receiver's thread without a tear.
     */
    @Volatile
    var latest: Latest? = null

    private fun mapType(type: Int): String? = when (type) {
      DetectedActivity.IN_VEHICLE -> "car"
      DetectedActivity.ON_BICYCLE -> "bicycle"
      // ON_FOOT is a parent of WALKING+RUNNING; treat both as walking unless
      // RUNNING is reported explicitly with higher confidence (handled by the
      // maxByOrNull in onReceive — RUNNING wins on its own merits when fast).
      DetectedActivity.WALKING, DetectedActivity.ON_FOOT -> "walking"
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.STILL -> "still"
      else -> null
    }
  }
}
