import { Point, ConnectedRegion } from "./getLargestConnectedComponent";


function getNearestPoint(points: Point[], x: number, y: number) {
  let closestPoint = points[0];
  let minDistance = Number.MAX_SAFE_INTEGER;
  points.forEach((point) => {
    const dx = Math.abs(point.x - x);
    const dy = Math.abs(point.y - y);
    const distance = dx + dy;
    if (distance < minDistance) {
      minDistance = distance;
      closestPoint = point;
    }
  });
  return closestPoint;
}

export type CornerPoints = {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
};

export default function getCornerPoints(region: ConnectedRegion): CornerPoints {
  const { x: minX, y: minY } = region.bounds.topLeft;
  const { x: maxX, y: maxY } = region.bounds.bottomRight;
  const { points } = region;
  return {
    topLeft: getNearestPoint(points, minX, minY),
    topRight: getNearestPoint(points, maxX, minY),
    bottomLeft: getNearestPoint(points, minX, maxY),
    bottomRight: getNearestPoint(points, maxX, maxY),
  };
}
