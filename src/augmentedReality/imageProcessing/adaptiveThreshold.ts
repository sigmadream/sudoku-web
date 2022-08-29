import Image from "./Image";
import boxBlur from "./boxBlur";

export default function adaptiveThreshold(
  image: Image,
  threshold: number,
  blurSize: number
): Image {
  const { width, height, bytes } = image;
  const blurred = boxBlur(image, blurSize, blurSize);
  const blurredBytes = blurred.bytes;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      bytes[row + width + x] =
        blurredBytes[row + x] - bytes[row + width + x] > threshold ? 255 : 0;
    }
  }
  return image;
}
