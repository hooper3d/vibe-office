const MIN_SPLIT_PERCENT = 35;
const MAX_SPLIT_PERCENT = 70;
const SPLIT_NUDGE_STEP = 4;

export function clampSplitPercent(value: number) {
  return Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, value));
}

export function getSplitPercentFromClientX({
  clientX,
  left,
  width,
}: {
  clientX: number;
  left: number;
  width: number;
}) {
  if (width <= 0) return MIN_SPLIT_PERCENT;
  return clampSplitPercent(((clientX - left) / width) * 100);
}

export function nudgeSplitPercent(current: number, direction: "left" | "right") {
  const next = direction === "left" ? current - SPLIT_NUDGE_STEP : current + SPLIT_NUDGE_STEP;
  return clampSplitPercent(next);
}
