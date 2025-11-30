import './TrendIndicator.css';

type Trend = 'improving' | 'stable' | 'declining' | 'insufficient_data';

interface TrendIndicatorProps {
  trend: Trend;
  last3Avg: number | null;
  last10Avg: number | null;
  desiredFrequency: number;
}

const TREND_CONFIG = {
  improving: {
    arrow: '↗',
    label: 'improving',
    color: 'var(--color-trend-improving)',
  },
  declining: {
    arrow: '↘',
    label: 'declining',
    color: 'var(--color-trend-declining)',
  },
  stable: {
    arrow: '→',
    label: 'stable',
    color: 'var(--color-trend-stable)',
  },
  insufficient_data: {
    arrow: '•',
    label: 'insufficient data',
    color: 'var(--color-trend-insufficient)',
  },
};

export default function TrendIndicator({
  trend,
  last3Avg,
  last10Avg,
  desiredFrequency,
}: TrendIndicatorProps) {
  const config = TREND_CONFIG[trend];
  const displayValue = last3Avg ?? last10Avg ?? desiredFrequency;

  return (
    <div
      className="trend-indicator"
      title={`Last 3: ${last3Avg?.toFixed(1) ?? 'N/A'} | Last 10: ${last10Avg?.toFixed(1) ?? 'N/A'} | Desired: ${desiredFrequency.toFixed(1)}`}
    >
      <span
        className="trend-value"
        style={{ color: config.color }}
      >
        {displayValue.toFixed(1)}
      </span>
      <span
        className="trend-arrow"
        style={{ color: config.color }}
      >
        {config.arrow}
      </span>
    </div>
  );
}
