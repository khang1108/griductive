export interface BoardLayoutOptions {
  compact: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

export interface BoardLayoutMetrics {
  size: number;
  compact: boolean;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  headerGap: number;
  padding: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridWidth: number;
  gridHeight: number;
  totalWidth: number;
  totalHeight: number;
  scale: number;
}

export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

export interface BoardWorldBounds {
  widthWorld: number;
  heightWorld: number;
  worldPerPx: number;
}

interface BasePreset {
  cardWidth: number;
  cardHeight: number;
  gap: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  headerGap: number;
  padding: number;
}

const MIN_TOUCH_TARGET_PX = 44;
const MAX_BOARD_WORLD_SPAN_METERS = 1.1;

function getBasePreset(size: number, compact: boolean): BasePreset {
  if (compact) {
    if (size <= 3) {
      return {
        cardWidth: 124,
        cardHeight: 148,
        gap: 10,
        rowHeaderWidth: 24,
        colHeaderHeight: 20,
        headerGap: 6,
        padding: 10,
      };
    }
    if (size === 4) {
      return {
        cardWidth: 104,
        cardHeight: 124,
        gap: 9,
        rowHeaderWidth: 24,
        colHeaderHeight: 20,
        headerGap: 6,
        padding: 10,
      };
    }
    return {
      cardWidth: 88,
      cardHeight: 102,
      gap: 8,
      rowHeaderWidth: 22,
      colHeaderHeight: 20,
      headerGap: 6,
      padding: 8,
    };
  }

  if (size <= 3) {
    return {
      cardWidth: 148,
      cardHeight: 176,
      gap: 14,
      rowHeaderWidth: 28,
      colHeaderHeight: 24,
      headerGap: 8,
      padding: 16,
    };
  }
  if (size === 4) {
    return {
      cardWidth: 132,
      cardHeight: 158,
      gap: 12,
      rowHeaderWidth: 28,
      colHeaderHeight: 24,
      headerGap: 8,
      padding: 14,
    };
  }
  return {
    cardWidth: 112,
    cardHeight: 134,
    gap: 10,
    rowHeaderWidth: 26,
    colHeaderHeight: 22,
    headerGap: 8,
    padding: 12,
  };
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Single source of truth for board CSS pixel dimensions and grid coordinates.
 * Guarantees >= 44x44 CSS px touch targets and clean viewport fitting across
 * 3x3, 4x4, and 5x5 grids on desktop (1920x1080, 1366x768) and mobile (390x844).
 */
export function computeBoardLayout(
  size: number,
  options: BoardLayoutOptions
): BoardLayoutMetrics {
  const safeSize = Math.max(1, Math.round(size));
  const base = getBasePreset(safeSize, options.compact);

  const baseGridWidth =
    safeSize * base.cardWidth + Math.max(0, safeSize - 1) * base.gap;
  const baseGridHeight =
    safeSize * base.cardHeight + Math.max(0, safeSize - 1) * base.gap;
  const baseTotalWidth =
    base.padding * 2 + base.rowHeaderWidth + base.headerGap + baseGridWidth;
  const baseTotalHeight =
    base.padding * 2 + base.colHeaderHeight + base.headerGap + baseGridHeight;

  const hasMaxW = isPositiveFinite(options.maxWidth);
  const hasMaxH = isPositiveFinite(options.maxHeight);

  const widthRatio = hasMaxW ? options.maxWidth! / baseTotalWidth : 1;
  const heightRatio = hasMaxH ? options.maxHeight! / baseTotalHeight : 1;
  const rawScale = Math.min(1, widthRatio, heightRatio);

  let cardWidth = base.cardWidth;
  let cardHeight = base.cardHeight;
  let gap = base.gap;
  let rowHeaderWidth = base.rowHeaderWidth;
  let colHeaderHeight = base.colHeaderHeight;
  let headerGap = base.headerGap;
  let padding = base.padding;

  if (rawScale < 1) {
    gap = Math.max(4, Math.floor(base.gap * rawScale));
    padding = Math.max(4, Math.floor(base.padding * rawScale));
    rowHeaderWidth = Math.max(16, Math.floor(base.rowHeaderWidth * rawScale));
    colHeaderHeight = Math.max(16, Math.floor(base.colHeaderHeight * rawScale));
    headerGap = Math.max(4, Math.floor(base.headerGap * rawScale));

    const totalGap = Math.max(0, safeSize - 1) * gap;
    const chromeW = padding * 2 + rowHeaderWidth + headerGap + totalGap;
    const chromeH = padding * 2 + colHeaderHeight + headerGap + totalGap;

    const maxCardW = hasMaxW
      ? Math.floor((options.maxWidth! - chromeW) / safeSize)
      : base.cardWidth;
    const maxCardH = hasMaxH
      ? Math.floor((options.maxHeight! - chromeH) / safeSize)
      : base.cardHeight;

    const aspect = base.cardHeight / base.cardWidth;
    let targetW = Math.min(Math.floor(base.cardWidth * rawScale), maxCardW);
    let targetH = Math.min(
      Math.floor(targetW * aspect),
      Math.floor(base.cardHeight * rawScale),
      maxCardH
    );

    if (hasMaxH && targetH < Math.floor(targetW * aspect)) {
      targetW = Math.min(targetW, Math.floor(targetH / aspect));
    }

    cardWidth = Math.max(MIN_TOUCH_TARGET_PX, targetW);
    cardHeight = Math.max(MIN_TOUCH_TARGET_PX, targetH);
  }

  const gridWidth = safeSize * cardWidth + Math.max(0, safeSize - 1) * gap;
  const gridHeight = safeSize * cardHeight + Math.max(0, safeSize - 1) * gap;
  const gridOffsetX = padding + rowHeaderWidth + headerGap;
  const gridOffsetY = padding + colHeaderHeight + headerGap;
  const totalWidth = gridOffsetX + gridWidth + padding;
  const totalHeight = gridOffsetY + gridHeight + padding;

  return {
    size: safeSize,
    compact: options.compact,
    cardWidth,
    cardHeight,
    gap,
    rowHeaderWidth,
    colHeaderHeight,
    headerGap,
    padding,
    gridOffsetX,
    gridOffsetY,
    gridWidth,
    gridHeight,
    totalWidth,
    totalHeight,
    scale: cardWidth / base.cardWidth,
  };
}

/**
 * Computes card rectangle coordinates relative to the card grid's top-left origin.
 * Shared by both the board HTML cards and the SVG EvidenceOverlay.
 */
export function getCellRect(
  layout: BoardLayoutMetrics,
  row: number,
  col: number
): CellRect {
  const x = col * (layout.cardWidth + layout.gap);
  const y = row * (layout.cardHeight + layout.gap);
  const width = layout.cardWidth;
  const height = layout.cardHeight;
  return {
    x,
    y,
    width,
    height,
    cx: x + width / 2,
    cy: y + height / 2,
  };
}

/**
 * Maps pixel layout bounds onto 3D desk surface meters (~0.97m - 1.10m max span),
 * preserving exact aspect ratio and leaving clear margins for desk props.
 */
export function getBoardWorldBounds(
  layout: BoardLayoutMetrics
): BoardWorldBounds {
  const sizeScale = layout.size <= 3 ? 0.88 : layout.size === 4 ? 0.96 : 1.0;
  const targetMaxSpan = MAX_BOARD_WORLD_SPAN_METERS * sizeScale;
  const maxPx = Math.max(layout.totalWidth, layout.totalHeight, 1);
  const worldPerPx = targetMaxSpan / maxPx;
  return {
    widthWorld: layout.totalWidth * worldPerPx,
    heightWorld: layout.totalHeight * worldPerPx,
    worldPerPx,
  };
}
