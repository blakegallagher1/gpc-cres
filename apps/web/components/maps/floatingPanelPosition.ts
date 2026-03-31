/**
 * Simple viewport-clamped panel position helper for map overlays.
 */
export interface FloatingPoint {
  x: number;
  y: number;
}

/**
 * Bounding box for the container the overlay is rendered inside.
 */
export interface FloatingBounds {
  width: number;
  height: number;
}

/**
 * Size of the floating panel.
 */
export interface FloatingPanelSize {
  width: number;
  height: number;
}

/**
 * Computed overlay position in container coordinates.
 */
export interface FloatingPanelPosition {
  left: number;
  top: number;
  flippedX: boolean;
  flippedY: boolean;
}

const DEFAULT_OFFSET = 12;

/**
 * Places a floating panel near a point and flips it when it would overflow
 * the container bounds.
 */
export function clampFloatingPanelPosition(
  point: FloatingPoint,
  container: FloatingBounds | null,
  panel: FloatingPanelSize,
  offset: number = DEFAULT_OFFSET,
): FloatingPanelPosition {
  if (!container || container.width <= 0 || container.height <= 0) {
    return {
      left: Math.max(offset, point.x + offset),
      top: Math.max(offset, point.y + offset),
      flippedX: false,
      flippedY: false,
    };
  }

  const fitsRight = point.x + offset + panel.width <= container.width;
  const fitsBottom = point.y + offset + panel.height <= container.height;
  const leftCandidate = fitsRight ? point.x + offset : point.x - panel.width - offset;
  const topCandidate = fitsBottom ? point.y + offset : point.y - panel.height - offset;
  const maxLeft = Math.max(offset, container.width - panel.width - offset);
  const maxTop = Math.max(offset, container.height - panel.height - offset);

  return {
    left: Math.min(Math.max(leftCandidate, offset), maxLeft),
    top: Math.min(Math.max(topCandidate, offset), maxTop),
    flippedX: !fitsRight,
    flippedY: !fitsBottom,
  };
}
