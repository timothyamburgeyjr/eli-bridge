import * as VideoThumbnails from "expo-video-thumbnails";

/**
 * Extracts 5 equidistant still frames from a video file for Eli to "see"
 * the moment. The full video goes to Gemini for emote assembly; these 5
 * JPEGs become the `image_urls` payload on the Kindroid send so the AI
 * companion has visual grounding alongside Tim's emote.
 *
 * Sample points: 16.7%, 33.3%, 50%, 66.7%, 83.3% of the video duration.
 * These are the interior 5 evenly-spaced positions (1/6 through 5/6) —
 * intentionally avoiding the 0% and 100% endpoints which often contain
 * the dead-air of pressing the record button.
 *
 * On Android the native MediaMetadataRetriever backs expo-video-thumbnails;
 * it's fast (≤200ms/frame typical) and works on local file URIs. iOS uses
 * AVAsset which has equivalent characteristics.
 *
 * Returns the local file URIs of the extracted JPEGs. Caller uploads them
 * to the image server and discards the local paths.
 */

const SAMPLE_FRACTIONS = [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6] as const;

export interface ExtractedFrame {
  uri: string;
  /** ms offset into the video where the frame was sampled. */
  timeMs: number;
}

/**
 * Pull 5 stills from a video at the canonical equidistant sample points.
 *
 * `durationMs` is required because expo-video-thumbnails doesn't expose a
 * way to read video duration directly — we have to know it up front.
 * Callers typically have it from the recorder (`recorderRef.currentTime`
 * or the `duration` field on the staged attachment).
 *
 * Robust to per-frame failures: if one of the five extractions fails (rare,
 * usually due to a malformed time offset), we skip it and return whatever
 * we got. An entirely-failed extraction throws.
 */
export async function extractFiveFrames(
  videoUri: string,
  durationMs: number
): Promise<ExtractedFrame[]> {
  if (durationMs <= 0) {
    throw new Error(
      `extractFiveFrames: invalid duration ${durationMs}ms — refusing to sample`
    );
  }
  const frames: ExtractedFrame[] = [];
  for (const f of SAMPLE_FRACTIONS) {
    const t = Math.round(durationMs * f);
    try {
      const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
        time: t,
        quality: 0.7, // JPEG quality 0-1; 0.7 is a good size/clarity balance
      });
      frames.push({ uri, timeMs: t });
    } catch (err) {
      console.warn(
        `[videoThumbnails] frame at ${t}ms failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  if (frames.length === 0) {
    throw new Error(
      "extractFiveFrames: all 5 sample attempts failed — video may be unreadable"
    );
  }
  return frames;
}
