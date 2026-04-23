package expo.modules.voiceembedding

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Pass B — real ONNX Runtime speaker embedding via WeSpeaker ECAPA-TDNN-512-LM.
 *
 * Model:
 *   Input : feats float32 [B, T, 80] OR [B, 80, T] — 80-dim log-mel fbank, T dynamic
 *   Output: embs  float32 [B, 192]   — L2-normalized speaker embedding
 *
 * Pipeline:
 *   1. Decode audio file (m4a/mp4/wav) via MediaExtractor + MediaCodec to 16kHz
 *      mono PCM in [-1, 1]
 *   2. Pre-emphasis (0.97)
 *   3. Frame into 25ms / 10ms windows (400 samples / 160 hop)
 *   4. Hamming window per frame
 *   5. 512-point FFT, power spectrum
 *   6. 80 triangular mel filters (20–7600 Hz, HTK scale)
 *   7. log(x + 1e-10)
 *   8. CMVN per utterance (subtract mean, divide by std per feature)
 *   9. Feed fbank to ONNX Runtime, read [1, 192], L2-normalize, return
 */
class VoiceEmbeddingModule : Module() {
  @Volatile
  private var session: OrtSession? = null
  @Volatile
  private var inputName: String? = null
  @Volatile
  private var channelFirst: Boolean = false
  @Volatile
  private var melFilterbank: Array<DoubleArray>? = null
  @Volatile
  private var hammingCache: FloatArray? = null

  override fun definition() = ModuleDefinition {
    Name("VoiceEmbeddingModule")

    AsyncFunction("generateEmbedding") { audioPath: String ->
      val path = stripFileScheme(audioPath)
      val file = File(path)
      if (!file.exists()) {
        throw IllegalArgumentException("Audio file not found: $path")
      }

      val pcm = decodeAudioTo16kMono(path)
      if (pcm.isEmpty()) {
        throw IOException("Decoded 0 samples from $path")
      }

      val fbank = extractLogFbank(pcm)
      if (fbank.isEmpty()) {
        throw IOException("No frames produced from audio (signal too short for 25ms window)")
      }

      applyCmvn(fbank)
      val embedding = runInference(fbank)
      normalizeInPlace(embedding)
      embedding.map { it.toDouble() }
    }

    AsyncFunction("isStub") {
      false
    }
  }

  // ── Audio decoding ─────────────────────────────────────────────

  private fun decodeAudioTo16kMono(filePath: String): FloatArray {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(filePath)
    } catch (e: Exception) {
      extractor.release()
      throw IOException("Cannot open audio file: $filePath", e)
    }

    val trackIndex = (0 until extractor.trackCount).firstOrNull { i ->
      val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME)
      mime?.startsWith("audio/") == true
    } ?: run {
      extractor.release()
      throw IOException("No audio track in $filePath")
    }

    extractor.selectTrack(trackIndex)
    val format = extractor.getTrackFormat(trackIndex)
    val mime = format.getString(MediaFormat.KEY_MIME)!!
    val sourceSampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    val sourceChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

    val decoder = MediaCodec.createDecoderByType(mime)
    decoder.configure(format, null, null, 0)
    decoder.start()

    val samples = ArrayList<Float>(16000 * 10) // pre-size for 10s of audio
    val timeoutUs = 10_000L
    var inputEos = false
    var outputEos = false
    val bufferInfo = MediaCodec.BufferInfo()

    try {
      while (!outputEos) {
        if (!inputEos) {
          val inIdx = decoder.dequeueInputBuffer(timeoutUs)
          if (inIdx >= 0) {
            val inBuf = decoder.getInputBuffer(inIdx)!!
            val size = extractor.readSampleData(inBuf, 0)
            if (size < 0) {
              decoder.queueInputBuffer(
                inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM
              )
              inputEos = true
            } else {
              decoder.queueInputBuffer(
                inIdx, 0, size, extractor.sampleTime, 0
              )
              extractor.advance()
            }
          }
        }

        val outIdx = decoder.dequeueOutputBuffer(bufferInfo, timeoutUs)
        when {
          outIdx >= 0 -> {
            if (bufferInfo.size > 0) {
              val outBuf = decoder.getOutputBuffer(outIdx)!!
              outBuf.position(bufferInfo.offset)
              outBuf.limit(bufferInfo.offset + bufferInfo.size)
              val shortBuf = outBuf.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
              val frameCount = shortBuf.remaining() / sourceChannels
              for (f in 0 until frameCount) {
                var sum = 0f
                for (c in 0 until sourceChannels) {
                  sum += shortBuf.get().toFloat() / 32768f
                }
                samples.add(sum / sourceChannels)
              }
            }
            decoder.releaseOutputBuffer(outIdx, false)
            if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
              outputEos = true
            }
          }
          outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            // Format change (happens once right after first dequeue).
            // Continue — our sourceChannels/sourceSampleRate from input format
            // are still valid for the decoded PCM in practice.
          }
          outIdx == MediaCodec.INFO_TRY_AGAIN_LATER -> {
            // No output ready yet; loop.
          }
        }
      }
    } finally {
      try { decoder.stop() } catch (_: Exception) {}
      decoder.release()
      extractor.release()
    }

    val monoSamples = FloatArray(samples.size)
    for (i in samples.indices) monoSamples[i] = samples[i]

    return if (sourceSampleRate == TARGET_SAMPLE_RATE) monoSamples
    else resample(monoSamples, sourceSampleRate, TARGET_SAMPLE_RATE)
  }

  /** Linear-interpolation resampler. Cheap; acceptable for speaker embeddings. */
  private fun resample(input: FloatArray, fromRate: Int, toRate: Int): FloatArray {
    if (fromRate == toRate || input.isEmpty()) return input
    val ratio = toRate.toDouble() / fromRate
    val outputLength = max(1, (input.size * ratio).toInt())
    val output = FloatArray(outputLength)
    for (i in 0 until outputLength) {
      val srcIdx = i.toDouble() / ratio
      val idx1 = srcIdx.toInt().coerceIn(0, input.size - 1)
      val idx2 = (idx1 + 1).coerceAtMost(input.size - 1)
      val frac = (srcIdx - idx1).toFloat()
      output[i] = input[idx1] * (1f - frac) + input[idx2] * frac
    }
    return output
  }

  // ── Fbank extraction ───────────────────────────────────────────

  private fun extractLogFbank(pcm: FloatArray): Array<FloatArray> {
    // Pre-emphasis
    val emphasized = FloatArray(pcm.size)
    emphasized[0] = pcm[0]
    for (i in 1 until pcm.size) {
      emphasized[i] = pcm[i] - PRE_EMPHASIS * pcm[i - 1]
    }

    // Frame count
    val numFrames = if (emphasized.size < FRAME_LENGTH) 0
    else 1 + (emphasized.size - FRAME_LENGTH) / FRAME_SHIFT

    if (numFrames <= 0) return emptyArray()

    val melFb = getMelFilterbank()
    val hamming = getHammingWindow()
    val fbank = Array(numFrames) { FloatArray(N_MELS) }

    // Reusable buffers
    val fftReal = DoubleArray(N_FFT)
    val fftImag = DoubleArray(N_FFT)
    val powerSpec = DoubleArray(N_BINS)

    for (t in 0 until numFrames) {
      val start = t * FRAME_SHIFT
      // Fill frame with windowed samples, zero-pad to N_FFT
      for (i in 0 until N_FFT) {
        if (i < FRAME_LENGTH) {
          fftReal[i] = (emphasized[start + i] * hamming[i]).toDouble()
        } else {
          fftReal[i] = 0.0
        }
        fftImag[i] = 0.0
      }
      fft(fftReal, fftImag)
      for (j in 0 until N_BINS) {
        powerSpec[j] = fftReal[j] * fftReal[j] + fftImag[j] * fftImag[j]
      }
      // Apply mel filterbank + log
      for (m in 0 until N_MELS) {
        var sum = 0.0
        val fbRow = melFb[m]
        for (j in 0 until N_BINS) {
          sum += powerSpec[j] * fbRow[j]
        }
        fbank[t][m] = ln(sum + LOG_EPSILON).toFloat()
      }
    }
    return fbank
  }

  @Synchronized
  private fun getHammingWindow(): FloatArray {
    hammingCache?.let { return it }
    val w = FloatArray(FRAME_LENGTH)
    val denom = (FRAME_LENGTH - 1).toDouble()
    for (i in 0 until FRAME_LENGTH) {
      w[i] = (0.54 - 0.46 * cos(2.0 * Math.PI * i / denom)).toFloat()
    }
    hammingCache = w
    return w
  }

  /** In-place radix-2 iterative Cooley-Tukey FFT. N must be a power of 2. */
  private fun fft(real: DoubleArray, imag: DoubleArray) {
    val n = real.size
    require(n > 0 && (n and (n - 1)) == 0) { "FFT size must be a power of 2" }

    // Bit-reversal permutation
    var j = 0
    for (i in 1 until n) {
      var bit = n ushr 1
      while (j and bit != 0) {
        j = j xor bit
        bit = bit ushr 1
      }
      j = j or bit
      if (i < j) {
        val tr = real[i]; real[i] = real[j]; real[j] = tr
        val ti = imag[i]; imag[i] = imag[j]; imag[j] = ti
      }
    }

    // Butterflies
    var len = 2
    while (len <= n) {
      val angle = -2.0 * Math.PI / len
      val wReal = cos(angle)
      val wImag = kotlin.math.sin(angle)
      var i = 0
      while (i < n) {
        var currWReal = 1.0
        var currWImag = 0.0
        for (k in 0 until len / 2) {
          val idxEven = i + k
          val idxOdd = i + k + len / 2
          val tReal = currWReal * real[idxOdd] - currWImag * imag[idxOdd]
          val tImag = currWReal * imag[idxOdd] + currWImag * real[idxOdd]
          real[idxOdd] = real[idxEven] - tReal
          imag[idxOdd] = imag[idxEven] - tImag
          real[idxEven] += tReal
          imag[idxEven] += tImag
          val newWReal = currWReal * wReal - currWImag * wImag
          currWImag = currWReal * wImag + currWImag * wReal
          currWReal = newWReal
        }
        i += len
      }
      len *= 2
    }
  }

  @Synchronized
  private fun getMelFilterbank(): Array<DoubleArray> {
    melFilterbank?.let { return it }
    val fb = computeMelFilterbank(N_MELS, N_FFT, TARGET_SAMPLE_RATE, F_MIN, F_MAX)
    melFilterbank = fb
    return fb
  }

  /** HTK-style mel-scale triangular filter bank. Matches WeSpeaker's fbank. */
  private fun computeMelFilterbank(
    nMels: Int, nFft: Int, sampleRate: Int, fMin: Double, fMax: Double
  ): Array<DoubleArray> {
    val nBins = nFft / 2 + 1
    val mel = { f: Double -> 2595.0 * log10(1.0 + f / 700.0) }
    val invMel = { m: Double -> 700.0 * (10.0.pow(m / 2595.0) - 1.0) }

    val melLow = mel(fMin)
    val melHigh = mel(fMax)
    val melPoints = DoubleArray(nMels + 2) { i ->
      melLow + (melHigh - melLow) * i / (nMels + 1)
    }
    val binPoints = DoubleArray(nMels + 2) { i ->
      (nFft + 1) * invMel(melPoints[i]) / sampleRate
    }

    val filterbank = Array(nMels) { DoubleArray(nBins) }
    for (i in 0 until nMels) {
      val left = binPoints[i]
      val center = binPoints[i + 1]
      val right = binPoints[i + 2]
      for (jbin in 0 until nBins) {
        val jd = jbin.toDouble()
        when {
          jd < left || jd > right -> continue
          jd <= center -> filterbank[i][jbin] =
            if (center > left) (jd - left) / (center - left) else 0.0
          else -> filterbank[i][jbin] =
            if (right > center) (right - jd) / (right - center) else 0.0
        }
      }
    }
    return filterbank
  }

  /** Utterance-level CMVN: subtract mean, divide by std per feature across all frames. */
  private fun applyCmvn(fbank: Array<FloatArray>) {
    val numFrames = fbank.size
    if (numFrames == 0) return
    val dim = fbank[0].size

    val means = DoubleArray(dim)
    for (t in 0 until numFrames) {
      for (i in 0 until dim) means[i] += fbank[t][i].toDouble()
    }
    for (i in 0 until dim) means[i] /= numFrames

    val variances = DoubleArray(dim)
    for (t in 0 until numFrames) {
      for (i in 0 until dim) {
        val diff = fbank[t][i].toDouble() - means[i]
        variances[i] += diff * diff
      }
    }
    for (i in 0 until dim) {
      val std = sqrt(variances[i] / numFrames)
      val normalizer = if (std > CMVN_EPSILON) std else 1.0
      for (t in 0 until numFrames) {
        fbank[t][i] = ((fbank[t][i] - means[i]) / normalizer).toFloat()
      }
    }
  }

  // ── Inference ──────────────────────────────────────────────────

  @Synchronized
  private fun getSession(): OrtSession {
    session?.let { return it }
    val context: Context = appContext.reactContext
      ?: throw IllegalStateException("No React context available to load model")
    val modelBytes = loadModelBytes(context)
    val env = OrtEnvironment.getEnvironment()
    val options = OrtSession.SessionOptions()
    val s = env.createSession(modelBytes, options)

    // Pick layout from the declared input shape — channel-first [B, 80, T]
    // if dim 1 is fixed at N_MELS, otherwise time-first [B, T, 80].
    val firstInputName = s.inputInfo.keys.first()
    val firstInputShape = (s.inputInfo[firstInputName]!!.info as TensorInfo).shape
    channelFirst = firstInputShape.size >= 3 && firstInputShape[1] == N_MELS.toLong()
    inputName = firstInputName
    Log.i(
      TAG,
      "ECAPA ONNX session ready — layout=${if (channelFirst) "[B,80,T]" else "[B,T,80]"}"
    )

    session = s
    return s
  }

  private fun loadModelBytes(context: Context): ByteArray {
    context.assets.open(MODEL_FILE).use { stream ->
      return stream.readBytes()
    }
  }

  @Synchronized
  private fun runInference(fbank: Array<FloatArray>): FloatArray {
    val s = getSession()
    val numFrames = fbank.size

    val flat = FloatArray(numFrames * N_MELS)
    val shape: LongArray
    if (channelFirst) {
      // [1, 80, T] — channels major, then time
      for (m in 0 until N_MELS) {
        val base = m * numFrames
        for (t in 0 until numFrames) {
          flat[base + t] = fbank[t][m]
        }
      }
      shape = longArrayOf(1L, N_MELS.toLong(), numFrames.toLong())
    } else {
      // [1, T, 80] — time major, then mel
      for (t in 0 until numFrames) {
        val base = t * N_MELS
        val row = fbank[t]
        for (m in 0 until N_MELS) {
          flat[base + m] = row[m]
        }
      }
      shape = longArrayOf(1L, numFrames.toLong(), N_MELS.toLong())
    }

    val env = OrtEnvironment.getEnvironment()
    val buffer = FloatBuffer.wrap(flat)
    OnnxTensor.createTensor(env, buffer, shape).use { inputTensor ->
      s.run(mapOf(inputName!! to inputTensor)).use { results ->
        @Suppress("UNCHECKED_CAST")
        val raw = results[0].value as Array<FloatArray>
        if (raw.isEmpty() || raw[0].size != EMBEDDING_DIM) {
          throw IOException(
            "Unexpected ECAPA output shape: batch=${raw.size} dim=${if (raw.isEmpty()) 0 else raw[0].size}"
          )
        }
        return raw[0].copyOf()
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  private fun stripFileScheme(uri: String): String {
    return if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri
  }

  private fun normalizeInPlace(v: FloatArray) {
    var norm = 0.0
    for (x in v) norm += (x * x).toDouble()
    val n = sqrt(norm).toFloat()
    if (n > 0f) for (i in v.indices) v[i] /= n
  }

  companion object {
    private const val TAG = "VoiceEmbedding"
    private const val MODEL_FILE = "ecapa_tdnn.onnx"
    private const val EMBEDDING_DIM = 192
    private const val TARGET_SAMPLE_RATE = 16000
    private const val PRE_EMPHASIS = 0.97f
    private const val FRAME_LENGTH = 400   // 25ms @ 16kHz
    private const val FRAME_SHIFT = 160    // 10ms @ 16kHz
    private const val N_FFT = 512
    private const val N_BINS = N_FFT / 2 + 1  // 257
    private const val N_MELS = 80
    private const val F_MIN = 20.0
    private const val F_MAX = 7600.0
    private const val LOG_EPSILON = 1e-10
    private const val CMVN_EPSILON = 1e-8
  }
}
