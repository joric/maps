export function ptInPoly(point, polyPoints) {
  let [x,y] = [point.x, point.y];
  let inside = false;
  for (let i = 0, j = polyPoints.length - 1; i < polyPoints.length; j = i++) {
    var xi = polyPoints[i].x, yi = polyPoints[i].y;
    var xj = polyPoints[j].x, yj = polyPoints[j].y;
    var intersect = ((yi > y) != (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export function getCentroid(points) {
  if (!points || points.length === 0) return null;
  let sumX = 0, sumY = 0;
  const count = points.length;
  points.forEach(point => {
      sumX += point.x;
      sumY += point.y;
  });
  const centroidX = sumX / count;
  const centroidY = sumY / count;
  return { x: centroidX, y: centroidY };
}

export function getWeightedCentroid(points) {
  if (!points || points.length < 3) return null;

  // Ensure polygon is closed (last point = first point)
  const first = points[0];
  const last = points[points.length - 1];
  let closedPoints = points;
  if (first.x !== last.x || first.y !== last.y) {
    closedPoints = [...points, { x: first.x, y: first.y }];
  }

  let area = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let i = 0; i < closedPoints.length - 1; i++) {
    const { x: x1, y: y1 } = closedPoints[i];
    const { x: x2, y: y2 } = closedPoints[i + 1];

    // Cross product for area contribution
    const cross = x1 * y2 - x2 * y1;
    area += cross;

    // Weighted sum for centroid
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }

  area = area / 2;

  // Handle degenerate polygons (area ≈ 0)
  if (Math.abs(area) < 1e-10) {
    return getCentroid(points);
  }

  centroidX = centroidX / (6 * area);
  centroidY = centroidY / (6 * area);

  return { x: centroidX, y: centroidY };
}
