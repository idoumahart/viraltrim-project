/**
 * Browser-based face detection using MediaPipe.
 * Replaces the Cloud Run vision service for crop center calculation.
 * Falls back to server vision if MediaPipe fails.
 */

import {
  FaceDetector,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

let faceDetector: FaceDetector | null = null;
let loadingPromise: Promise<FaceDetector> | null = null;

/**
 * Lazy-load the MediaPipe face detection model.
 * Downloads ~10MB on first use, cached by browser.
 */
export async function loadFaceDetector(): Promise<FaceDetector> {
  if (faceDetector) return faceDetector;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
    );
    const detector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
    });
    faceDetector = detector;
    return detector;
  })();

  return loadingPromise;
}

/**
 * Detect faces in a video element and calculate the median face center X.
 *
 * @param videoElement The <video> element to analyze
 * @param sampleCount How many frames to sample (default 30 = 1 second at 30fps)
 * @returns Normalized face center X (0-1), or undefined if no faces found
 */
export async function detectFaceCenterX(
  videoElement: HTMLVideoElement,
  sampleCount = 30
): Promise<number | undefined> {
  const detector = await loadFaceDetector();
  const centers: number[] = [];

  const duration = videoElement.duration || 0;
  if (!duration || !videoElement.videoWidth) return undefined;

  // Sample frames evenly across the video
  for (let i = 0; i < sampleCount; i++) {
    const time = (duration * i) / sampleCount;
    videoElement.currentTime = time;

    // Wait for seek to complete
    await new Promise<void>((resolve) => {
      const handler = () => {
        videoElement.removeEventListener("seeked", handler);
        resolve();
      };
      videoElement.addEventListener("seeked", handler);
    });

    const detections = detector.detectForVideo(
      videoElement,
      performance.now()
    ).detections;

    if (detections.length > 0) {
      // Use the largest face (by bounding box area)
      const largest = detections.reduce((biggest, d) => {
        const area =
          d.boundingBox?.width * d.boundingBox?.height || 0;
        const biggestArea =
          biggest.boundingBox?.width * biggest.boundingBox?.height || 0;
        return area > biggestArea ? d : biggest;
      });

      if (largest.boundingBox) {
        const centerX =
          (largest.boundingBox.originX + largest.boundingBox.width / 2) /
          videoElement.videoWidth;
        centers.push(centerX);
      }
    }
  }

  // Reset video to start
  videoElement.currentTime = 0;

  if (centers.length === 0) return undefined;

  // Use median for stability (less sensitive to outliers than mean)
  centers.sort((a, b) => a - b);
  const median = centers[Math.floor(centers.length / 2)];

  return median;
}

/**
 * Quick face detection on a single frame.
 * Returns the face center X or undefined.
 */
export async function detectFaceSingleFrame(
  videoElement: HTMLVideoElement
): Promise<number | undefined> {
  const detector = await loadFaceDetector();

  const detections = detector.detectForVideo(
    videoElement,
    performance.now()
  ).detections;

  if (detections.length === 0) return undefined;

  const largest = detections.reduce((biggest, d) => {
    const area = d.boundingBox?.width * d.boundingBox?.height || 0;
    const biggestArea =
      biggest.boundingBox?.width * biggest.boundingBox?.height || 0;
    return area > biggestArea ? d : biggest;
  });

  if (!largest.boundingBox) return undefined;

  return (
    (largest.boundingBox.originX + largest.boundingBox.width / 2) /
    videoElement.videoWidth
  );
}
