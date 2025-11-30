import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import './ActivityChart.css';

interface BarChartData {
  name: string;
  desired: number;
  actual: number;
}

interface HorizontalBarData {
  name: string;
  value: number;
}

interface ActivityChartProps {
  type: 'comparison-bar' | 'horizontal-bar';
  data: BarChartData[] | HorizontalBarData[];
  title?: string;
}

export default function ActivityChart({ type, data, title }: ActivityChartProps) {
  const renderComparisonBar = (chartData: BarChartData[]) => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" opacity={0.3} />
        <XAxis
          dataKey="name"
          stroke="var(--color-text-secondary)"
          tick={{ fill: 'var(--color-text-secondary)' }}
        />
        <YAxis
          stroke="var(--color-text-secondary)"
          tick={{ fill: 'var(--color-text-secondary)' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0d0d0d',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-primary)'
          }}
          cursor={{ fill: 'rgba(26, 77, 77, 0.1)' }}
        />
        <Legend
          wrapperStyle={{ color: 'var(--color-text-primary)' }}
          iconType="circle"
        />
        <Bar
          dataKey="desired"
          fill="var(--color-primary-gold)"
          name="Desired Frequency"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="actual"
          fill="var(--color-aurora-teal)"
          name="Actual Frequency"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderHorizontalBar = (chartData: HorizontalBarData[]) => (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 50)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" opacity={0.3} />
        <XAxis
          type="number"
          stroke="var(--color-text-secondary)"
          tick={{ fill: 'var(--color-text-secondary)' }}
        />
        <YAxis
          dataKey="name"
          type="category"
          stroke="var(--color-text-secondary)"
          tick={{ fill: 'var(--color-text-secondary)' }}
          width={90}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#0d0d0d',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-primary)'
          }}
          cursor={{ fill: 'rgba(26, 77, 77, 0.1)' }}
        />
        <Bar
          dataKey="value"
          fill="var(--color-aurora-green)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="activity-chart">
      {title && <h4 className="chart-title">{title}</h4>}
      <div className="chart-wrapper">
        {type === 'comparison-bar' && renderComparisonBar(data as BarChartData[])}
        {type === 'horizontal-bar' && renderHorizontalBar(data as HorizontalBarData[])}
      </div>
    </div>
  );
}
