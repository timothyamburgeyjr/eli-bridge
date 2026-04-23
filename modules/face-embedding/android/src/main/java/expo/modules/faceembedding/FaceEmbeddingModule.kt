package expo.modules.faceembedding

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Pass A — real ML Kit face detection + deterministic stub embedding per
 * cropped face. Pass B will replace the stub with real MobileFaceNet inference
 * against mobilefacenet.tflite.
 *
 * Why 128-dim output: matches MobileFaceNet so the Pass B swap is drop-in.
 */
class FaceEmbeddingModule : Module() {
  private val detector by lazy {
    val opts = FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
      .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
      .setMinFaceSize(0.1f)
      .build()
    FaceDetection.getClient(opts)
  }

  override fun definition() = ModuleDefinition {
    Name("FaceEmbeddingModule")

    AsyncFunction("detectAndEmbedFaces") { imagePath: String, promise: Promise ->
      try {
        val path = stripFileScheme(imagePath)
        val file = File(path)
        if (!file.exists()) {
          promise.reject("ENOENT", "Image file not found: $path", null)
          return@AsyncFunction
        }
        val bitmap = BitmapFactory.decodeFile(path)
        if (bitmap == null) {
          promise.reject("EDECODE", "Could not decode image at $path", null)
          return@AsyncFunction
        }
        val input = InputImage.fromBitmap(bitmap, 0)
        detector.process(input)
          .addOnSuccessListener { faces ->
            val out = faces.map { face -> faceToEmbedding(bitmap, face) }
            promise.resolve(out)
          }
          .addOnFailureListener { err ->
            promise.reject("EDETECT", err.localizedMessage ?: "Face detection failed", err)
          }
      } catch (err: Throwable) {
        promise.reject("EUNCAUGHT", err.localizedMessage ?: "Face detection uncaught error", err)
      }
    }

    AsyncFunction("isStub") {
      true
    }
  }

  companion object {
    private const val EMBEDDING_DIM = 128

    private fun stripFileScheme(uri: String): String {
      return if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri
    }

    /**
     * Crop to the face bbox, resize to 112x112 (matches MobileFaceNet input),
     * hash the crop bytes, and expand into a 128-dim unit vector. Pass B
     * replaces this with real TFLite inference using the same crop + resize
     * preprocessing.
     */
    private fun faceToEmbedding(source: Bitmap, face: Face): Map<String, Any> {
      val raw = face.boundingBox
      val clamped = Rect(
        max(0, raw.left),
        max(0, raw.top),
        min(source.width, raw.right),
        min(source.height, raw.bottom)
      )
      val w = max(1, clamped.width())
      val h = max(1, clamped.height())
      val cropped = Bitmap.createBitmap(source, clamped.left, clamped.top, w, h)
      val resized = Bitmap.createScaledBitmap(cropped, FACE_INPUT_SIZE, FACE_INPUT_SIZE, true)

      // Hash the resized pixel bytes for a deterministic stub embedding
      val bytes = ByteArray(resized.byteCount)
      val buffer = java.nio.ByteBuffer.wrap(bytes)
      resized.copyPixelsToBuffer(buffer)
      val hash = MessageDigest.getInstance("SHA-256").digest(bytes)

      val embedding = FloatArray(EMBEDDING_DIM)
      var current = hash
      var idx = 0
      while (idx < EMBEDDING_DIM) {
        for (byte in current) {
          if (idx >= EMBEDDING_DIM) break
          embedding[idx] = byte.toInt().toFloat() / 128f
          idx++
        }
        if (idx < EMBEDDING_DIM) {
          current = MessageDigest.getInstance("SHA-256").digest(current)
        }
      }
      normalizeInPlace(embedding)

      return mapOf(
        "bbox" to mapOf(
          "x" to clamped.left,
          "y" to clamped.top,
          "width" to w,
          "height" to h
        ),
        "embedding" to embedding.toList(),
        "detectionConfidence" to (face.trackingId?.let { 1.0 } ?: 0.9)
      )
    }

    private const val FACE_INPUT_SIZE = 112

    private fun normalizeInPlace(v: FloatArray) {
      var norm = 0.0
      for (x in v) norm += (x * x).toDouble()
      val n = sqrt(norm).toFloat()
      if (n > 0f) for (i in v.indices) v[i] /= n
    }
  }
}
