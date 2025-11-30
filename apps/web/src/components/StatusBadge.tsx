import './StatusBadge.css';

type Status =
  | 'ahead'
  | 'due_soon'
  | 'due_today'
  | 'overdue'
  | 'critically_overdue'
  | 'no_data';

interface StatusBadgeProps {
  status: Status;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const STATUS_CONFIG = {
  ahead: {
    color: 'var(--color-status-ahead)',
    label: 'Ahead',
  },
  due_soon: {
    color: 'var(--color-status-due-soon)',
    label: 'Due Soon',
  },
  due_today: {
    color: 'var(--color-status-due-today)',
    label: 'Due Today',
  },
  overdue: {
    color: 'var(--color-status-overdue-light)',
    label: 'Overdue',
  },
  critically_overdue: {
    color: 'var(--color-status-critically-overdue)',
    label: 'Critical',
  },
  no_data: {
    color: 'var(--color-status-neutral)',
    label: 'No Data',
  },
};

export default function StatusBadge({
  status,
  size = 'medium',
  showLabel = false
}: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={`status-badge status-badge-${size}`}
      style={{
        borderColor: config.color,
        '--status-color': config.color
      } as React.CSSProperties}
    >
      {showLabel && <span className="status-badge-label">{config.label}</span>}
    </div>
  );
}
