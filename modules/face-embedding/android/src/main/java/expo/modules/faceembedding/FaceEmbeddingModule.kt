package expo.modules.faceembedding

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.net.Uri
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.tensorflow.lite.Interpreter
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Pass B — real MobileFaceNet TFLite embeddings.
 *
 * Pipeline (per detected face):
 *   1. ML Kit face detection → bounding box + detection confidence.
 *   2. Crop source bitmap to bbox (clamped to image bounds).
 *   3. Resize to 112×112 (MobileFaceNet's expected input).
 *   4. Convert RGB pixels to float32, normalize via (px - 127.5) / 128
 *      → range [-1, 1].
 *   5. Feed as [1, 112, 112, 3] to the TFLite interpreter.
 *   6. Read [1, 128] output, L2-normalize, return.
 *
 * The TFLite interpreter is shared across all faces in a photo (single
 * allocation) and reused across calls (singleton).
 */
class FaceEmbeddingModule : Module() {
  @Volatile
  private var interpreter: Interpreter? = null

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
        val ctx = appContext.reactContext
        detector.process(input)
          .addOnSuccessListener { faces ->
            try {
              val itp = ctx?.let { getInterpreter(it) }
                ?: throw IllegalStateException("No React context for TFLite model load")
              val out = faces.map { face -> faceToEmbedding(itp, bitmap, face) }
              promise.resolve(out)
            } catch (err: Throwable) {
              promise.reject(
                "EEMBED",
                err.localizedMessage ?: "Embedding inference failed",
                err
              )
            }
          }
          .addOnFailureListener { err ->
            promise.reject("EDETECT", err.localizedMessage ?: "Face detection failed", err)
          }
      } catch (err: Throwable) {
        promise.reject("EUNCAUGHT", err.localizedMessage ?: "Face detection uncaught error", err)
      }
    }

    AsyncFunction("isStub") {
      false
    }
  }

  @Synchronized
  private fun getInterpreter(context: Context): Interpreter {
    interpreter?.let { return it }
    val modelBuffer = loadMappedModel(context)
    val options = Interpreter.Options()
    val itp = Interpreter(modelBuffer, options)
    val inputShape = itp.getInputTensor(0).shape()
    val outputShape = itp.getOutputTensor(0).shape()
    Log.i(
      TAG,
      "MobileFaceNet TFLite ready — input=${inputShape.toList()} output=${outputShape.toList()}"
    )
    interpreter = itp
    return itp
  }

  private fun loadMappedModel(context: Context): MappedByteBuffer {
    val afd = context.assets.openFd(MODEL_FILE)
    FileInputStream(afd.fileDescriptor).use { fis ->
      return fis.channel.map(
        FileChannel.MapMode.READ_ONLY,
        afd.startOffset,
        afd.declaredLength
      )
    }
  }

  private fun faceToEmbedding(
    itp: Interpreter,
    source: Bitmap,
    face: Face
  ): Map<String, Any> {
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

    // Build the input tensor: [1, 112, 112, 3] float32, normalized [-1, 1].
    // Extract ARGB pixels once, then drop alpha and normalize each channel.
    val pixels = IntArray(FACE_INPUT_SIZE * FACE_INPUT_SIZE)
    resized.getPixels(pixels, 0, FACE_INPUT_SIZE, 0, 0, FACE_INPUT_SIZE, FACE_INPUT_SIZE)

    val inputBuffer = ByteBuffer
      .allocateDirect(4 * FACE_INPUT_SIZE * FACE_INPUT_SIZE * 3)
      .order(ByteOrder.nativeOrder())
    for (p in pixels) {
      // Android's Color.RED/GREEN/BLUE layout in an Int — ARGB8888.
      val r = ((p shr 16) and 0xFF).toFloat()
      val g = ((p shr 8) and 0xFF).toFloat()
      val b = (p and 0xFF).toFloat()
      inputBuffer.putFloat((r - 127.5f) / 128f)
      inputBuffer.putFloat((g - 127.5f) / 128f)
      inputBuffer.putFloat((b - 127.5f) / 128f)
    }
    inputBuffer.rewind()

    val output = Array(1) { FloatArray(EMBEDDING_DIM) }
    itp.run(inputBuffer, output)

    val embedding = output[0]
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

  companion object {
    private const val TAG = "FaceEmbedding"
    private const val MODEL_FILE = "mobile_face_net.tflite"
    private const val EMBEDDING_DIM = 128
    private const val FACE_INPUT_SIZE = 112

    private fun stripFileScheme(uri: String): String {
      return if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri
    }

    private fun normalizeInPlace(v: FloatArray) {
      var norm = 0.0
      for (x in v) norm += (x * x).toDouble()
      val n = sqrt(norm).toFloat()
      if (n > 0f) for (i in v.indices) v[i] /= n
    }
  }
}
