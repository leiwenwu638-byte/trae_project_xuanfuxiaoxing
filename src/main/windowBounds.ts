export type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

const margin = 16;

export function ensureVisibleBounds(position: Point, workArea: Rectangle, size: Size): Point {
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;
  const maxX = workArea.x + workArea.width - size.width - margin;
  const maxY = workArea.y + workArea.height - size.height - margin;

  return {
    x: clamp(position.x, minX, Math.max(minX, maxX)),
    y: clamp(position.y, minY, Math.max(minY, maxY))
  };
}

export function getTopCenterPosition(workArea: Rectangle, size: Size, topMargin = 24): Point {
  return ensureVisibleBounds(
    {
      x: workArea.x + Math.round((workArea.width - size.width) / 2),
      y: workArea.y + topMargin
    },
    workArea,
    size
  );
}

export function getPanelPositionNearAnchor(anchor: Rectangle | null, workArea: Rectangle, size: Size): Point {
  const position = anchor
    ? {
        x: anchor.x + anchor.width + 8,
        y: anchor.y
      }
    : {
        x: workArea.x + workArea.width - size.width - 24,
        y: workArea.y + workArea.height - size.height - 24
      };

  return ensureVisibleBounds(position, workArea, size);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
