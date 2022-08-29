import Image from "./Image";

export default function captureImage(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  const width = video.videoWidth;
  const height = video.videoHeight;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context!.drawImage(video, 0, 0, width, height);
  const imageData = context!.getImageData(0, 0, width, height);
  const bytes = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const g = imageData.data[(row + x) * 4 + 1];
      bytes[row + x] = g;
    }
  }
  return new Image(bytes, width, height);
}
