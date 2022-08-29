import StrictEventEmitter from "strict-event-emitter-types";
import { EventEmitter } from "events";
import fillInPrediction from "./imageRecognition/tensorflow";
import SudokuSolver from "./solver/sudokuSolver";
import getLargestConnectedComponent, {
  Point,
} from "./imageProcessing/getLargestConnectedComponent";
import findHomographicTransform, {
  Transform,
  transformPoint,
} from "./imageProcessing/findHomographicTransform";
import captureImage from "./imageProcessing/captureImage";
import adaptiveThreshold from "./imageProcessing/adaptiveThreshold";
import getCornerPoints from "./imageProcessing/getCornerPoints";
import extractSquareFromRegion from "./imageProcessing/applyHomographicTransform";
import extractBoxes from "./imageProcessing/extractBoxes";

const MIN_BOXES = 15;
const PROCESSING_SIZE = 900;

export type VideoReadyPayload = { width: number; height: number };

interface ProcessorEvents {
  videoReady: VideoReadyPayload;
}

type ProcessorEventEmitter = StrictEventEmitter<EventEmitter, ProcessorEvents>;

type SolvedBox = {
  isKnown: boolean;
  digit: number;
  digitHeight: number;
  digitRotation: number;
  position: Point;
};

export default class Processor extends (EventEmitter as {
  new(): ProcessorEventEmitter;
}) {
  video: HTMLVideoElement;
  isVideoRunning: boolean = false;
  isProcessing: boolean = false;
  corners: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  };
  gridLines: { p1: Point; p2: Point }[];
  solvedPuzzle: SolvedBox[][];
  captureTime: number = 0;
  thresholdTime: number = 0;
  connectedComponentTime: number = 0;
  cornerPointTime: number = 0;
  extractPuzzleTime: number = 0;
  extractBoxesTime: number = 0;
  neuralNetTime: number = 0;
  solveTime: number = 0;

  async startVideo(video: HTMLVideoElement) {
    this.video = video;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 640 },
      audio: false,
    });
    const canPlayListener = () => {
      this.video.removeEventListener("canplay", canPlayListener);
      this.emit("videoReady", {
        width: this.video.videoWidth,
        height: this.video.videoHeight,
      });
      this.isVideoRunning = true;
      this.processFrame();
    };
    this.video.addEventListener("canplay", canPlayListener);
    this.video.srcObject = stream;
    this.video.play();
  }

  createGridLines(transform: Transform) {
    const boxSize = PROCESSING_SIZE / 9;
    const gridLines = [];
    for (let l = 1; l < 9; l++) {
      gridLines.push({
        p1: transformPoint({ x: 0, y: l * boxSize }, transform),
        p2: transformPoint({ x: PROCESSING_SIZE, y: l * boxSize }, transform),
      });
      gridLines.push({
        p1: transformPoint({ y: 0, x: l * boxSize }, transform),
        p2: transformPoint({ y: PROCESSING_SIZE, x: l * boxSize }, transform),
      });
    }
    return gridLines;
  }

  getTextDetailsForBox(
    x: number,
    y: number,
    digit: number,
    isKnown: boolean,
    transform: Transform
  ): SolvedBox {
    const boxSize = PROCESSING_SIZE / 9;
    const p1 = transformPoint(
      { x: (x + 0.5) * boxSize, y: y * boxSize },
      transform
    );
    const p2 = transformPoint(
      { x: (x + 0.5) * boxSize, y: (y + 1) * boxSize },
      transform
    );
    const textPosition = transformPoint(
      { x: (x + 0.5) * boxSize, y: (y + 0.5) * boxSize },
      transform
    );
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const digitRotation = Math.atan2(dx, dy);

    const digitHeight = 0.8 * Math.sqrt(dx * dx + dy * dy);

    return {
      digit,
      digitHeight,
      digitRotation,
      isKnown: isKnown,
      position: textPosition,
    };
  }

  createSolvedPuzzle(solver: SudokuSolver, transform: Transform) {
    const results: SolvedBox[][] = new Array(9);
    for (let y = 0; y < 9; y++) {
      results[y] = new Array(9);
    }
    solver.solution.forEach((sol) => {
      const { x, y, entry, isKnown } = sol.guess;
      results[y][x] = this.getTextDetailsForBox(
        x,
        y,
        entry,
        isKnown,
        transform
      );
    });
    return results;
  }

  sanityCheckCorners({
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
  }: {
    topLeft: Point;
    topRight: Point;
    bottomLeft: Point;
    bottomRight: Point;
  }) {
    function length(p1: Point, p2: Point) {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    const topLineLength = length(topLeft, topRight);
    const leftLineLength = length(topLeft, bottomLeft);
    const rightLineLength = length(topRight, bottomRight);
    const bottomLineLength = length(bottomLeft, bottomRight);
    if (
      topLineLength < 0.5 * bottomLineLength ||
      topLineLength > 1.5 * bottomLineLength
    )
      return false;
    if (
      leftLineLength < 0.7 * rightLineLength ||
      leftLineLength > 1.3 * rightLineLength
    )
      return false;
    if (
      leftLineLength < 0.5 * bottomLineLength ||
      leftLineLength > 1.5 * bottomLineLength
    )
      return false;
    return true;
  }

  async processFrame() {
    if (!this.isVideoRunning) {
      return;
    }
    if (this.isProcessing) {
      return;
    }
    try {
      let startTime = performance.now();
      const image = captureImage(this.video);
      this.captureTime =
        0.1 * (performance.now() - startTime) + this.captureTime * 0.9;
      startTime = performance.now();
      const thresholded = adaptiveThreshold(image.clone(), 20, 20);
      this.thresholdTime =
        0.1 * (performance.now() - startTime) + this.thresholdTime * 0.9;
      startTime = performance.now();
      const largestConnectedComponent = getLargestConnectedComponent(
        thresholded,
        {
          minAspectRatio: 0.5,
          maxAspectRatio: 1.5,
          minSize:
            Math.min(this.video.videoWidth, this.video.videoHeight) * 0.3,
          maxSize:
            Math.min(this.video.videoWidth, this.video.videoHeight) * 0.9,
        }
      );
      this.connectedComponentTime =
        0.1 * (performance.now() - startTime) +
        this.connectedComponentTime * 0.9;

      if (largestConnectedComponent) {
        startTime = performance.now();
        const potentialCorners = getCornerPoints(largestConnectedComponent);
        this.cornerPointTime =
          0.1 * (performance.now() - startTime) + this.cornerPointTime * 0.9;

        if (this.sanityCheckCorners(potentialCorners)) {
          this.corners = potentialCorners;
          startTime = performance.now();
          const transform = findHomographicTransform(
            PROCESSING_SIZE,
            this.corners
          );
          this.gridLines = this.createGridLines(transform);
          const extractedImageGreyScale = extractSquareFromRegion(
            image,
            PROCESSING_SIZE,
            transform
          );
          const extractedImageThresholded = extractSquareFromRegion(
            thresholded,
            PROCESSING_SIZE,
            transform
          );
          this.extractPuzzleTime =
            0.1 * (performance.now() - startTime) +
            this.extractPuzzleTime * 0.9;
          startTime = performance.now();
          const boxes = extractBoxes(
            extractedImageGreyScale,
            extractedImageThresholded
          );
          this.extractBoxesTime =
            0.1 * (performance.now() - startTime) + this.extractBoxesTime * 0.9;
          if (boxes.length > MIN_BOXES) {
            startTime = performance.now();
            await fillInPrediction(boxes);
            this.neuralNetTime =
              0.1 * (performance.now() - startTime) + this.neuralNetTime * 0.9;
            startTime = performance.now();
            const solver = new SudokuSolver();
            boxes.forEach((box) => {
              if (box.contents !== 0) {
                solver.setNumber(box.x, box.y, box.contents - 1);
              }
            });
            if (solver.search(0)) {
              this.solvedPuzzle = this.createSolvedPuzzle(solver, transform);
            } else {
              this.solvedPuzzle = null;
            }
            this.solveTime =
              0.1 * (performance.now() - startTime) + this.solveTime * 0.9;
          }
        } else {
          this.corners = null;
          this.gridLines = null;
          this.solvedPuzzle = null;
        }
      } else {
        this.corners = null;
        this.gridLines = null;
        this.solvedPuzzle = null;
      }
    } catch (error) {
      console.error(error);
    }
    this.isProcessing = false;
    setTimeout(() => this.processFrame(), 20);
  }
}
