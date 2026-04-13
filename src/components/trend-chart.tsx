import type { Locale, RoundEvaluation } from "@/types/debate";
import { text } from "@/lib/text-helpers";

function chartPath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export function TrendChart({
  evaluations,
  enabled,
  locale,
}: {
  evaluations: RoundEvaluation[];
  enabled: boolean;
  locale: Locale;
}) {
  if (!enabled) return null;
  if (!evaluations.length) {
    return (
      <div className="chart-card">
        <strong>{text(locale, "动态胜率会显示在这里", "Dynamic win-rate trend appears here")}</strong>
        <p>{text(locale, "只有在动态停止模式真正运行后，裁判才会在每次辩手发言后更新曲线。", "The curve updates after each debater speech once dynamic-stop mode is running.")}</p>
      </div>
    );
  }

  const width = 520;
  const height = 200;
  const padding = 28;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const supportPoints = evaluations.map((item, index) => ({
    x: padding + (evaluations.length === 1 ? usableWidth / 2 : (usableWidth / (evaluations.length - 1)) * index),
    y: padding + usableHeight - (item.supportWinRate / 100) * usableHeight,
  }));
  const opposePoints = evaluations.map((item, index) => ({
    x: padding + (evaluations.length === 1 ? usableWidth / 2 : (usableWidth / (evaluations.length - 1)) * index),
    y: padding + usableHeight - (item.opposeWinRate / 100) * usableHeight,
  }));

  return (
    <div className="chart-card">
      <div className="chart-head">
        <strong>{text(locale, "动态胜率走势", "Dynamic win-rate trend")}</strong>
        <p>{text(locale, "系统会在每次辩手发言后重新估算当前哪一方更占优势。", "After each debater speech, the system re-estimates which side currently has the edge.")}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" aria-label="win rate chart">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padding + usableHeight - (tick / 100) * usableHeight;
          return (
            <g key={tick}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} className="chart-grid" />
              <text x={0} y={y + 4} className="chart-label">
                {tick}%
              </text>
            </g>
          );
        })}
        <path d={chartPath(supportPoints)} className="chart-line chart-line-support" />
        <path d={chartPath(opposePoints)} className="chart-line chart-line-oppose" />
      </svg>
    </div>
  );
}
