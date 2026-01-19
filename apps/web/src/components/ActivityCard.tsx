import { useState } from 'react';
import { format } from 'date-fns';
import * as TablerIcons from '@tabler/icons-react';
import StatusBadge from './StatusBadge';
import ContextMenu from './ContextMenu';
import './ActivityCard.css';

interface ActivityType {
  id: string;
  name: string;
  description: string | null;
  desiredFrequency: number;
  icon: string | null;
  tag?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
}

interface Recommendation {
  activityType: ActivityType;
  lastPerformedDate: string | null;
  daysSinceLastActivity: number | null;
  averageFrequencyLast3: number | null;
  averageFrequencyLast10: number | null;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
  difference: number | null;
  status: 'ahead' | 'due_soon' | 'due_today' | 'overdue' | 'critically_overdue' | 'no_data';
  priorityScore: number;
  currentStreak: number;
  currentStreakStart: string | null;
  firstActivityDate: string | null;
}

interface ActivityCardProps {
  recommendation: Recommendation;
  variant?: 'compact' | 'detailed';
  section?: 'today' | 'tomorrow' | 'other';
  highlightOverdue?: boolean;
  showDetailedData?: boolean;
  showStreakFlame?: boolean;
  onCompletedToday?: (activityTypeId: string) => void;
  onLongPressStart?: (activityTypeId: string) => void;
  onLongPressEnd?: () => void;
}

export default function ActivityCard({
  recommendation: rec,
  variant = 'compact',
  section = 'other',
  highlightOverdue = false,
  showDetailedData = false,
  showStreakFlame = true,
  onCompletedToday,
  onLongPressStart,
  onLongPressEnd,
}: ActivityCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [lastTap, setLastTap] = useState<number>(0);
  const renderIcon = (iconName: string, color?: string | null) => {
    const IconComponent = (TablerIcons as any)[`Icon${iconName}`];
    return IconComponent ? <IconComponent size={32} stroke={1.5} style={{ color: color || 'currentColor' }} /> : null;
  };

  const getSectionColor = (section: 'today' | 'tomorrow' | 'other'): { dark: string; light: string } => {
    switch (section) {
      case 'today':
        return { dark: '#44cc52', light: '#2d9e3a' }; // Green
      case 'tomorrow':
        return { dark: '#4a9eff', light: '#2b7dd6' }; // Blue
      case 'other':
        return { dark: '#a66fff', light: '#7c3fd9' }; // Vibrant Purple
    }
  };

  const formatLastPerformed = (date: string | null, daysSince: number | null): string => {
    if (!date || daysSince === null) {
      return 'Never';
    }
    if (daysSince === 0) {
      return 'Today';
    }
    if (daysSince === 1) {
      return '1 day ago';
    }
    return `${daysSince} days ago`;
  };

  const getNumberColor = (value: number | null, desiredFrequency: number): string => {
    if (value === null) return 'inherit';
    return value <= desiredFrequency ? '#44cc52' : '#ef4444'; // green if <= desired, red if >
  };

  const sectionColors = getSectionColor(section);

  // Check if card is overdue (1 or more days overdue)
  const isOverdue = rec.difference !== null && rec.difference >= 1;
  const shouldHighlight = highlightOverdue && isOverdue;

  const handleContextMenu = (e: React.MouseEvent) => {
    // Only allow context menu on desktop (not touch devices)
    // On mobile, use double-tap instead
    if ('ontouchstart' in window) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleCompletedToday = () => {
    if (onCompletedToday) {
      onCompletedToday(rec.activityType.id);
    }
  };

  // Long press handlers for mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only handle left click
    if (e.button !== 0) return;

    const timer = setTimeout(() => {
      if (onLongPressStart) {
        onLongPressStart(rec.activityType.id);
      }
    }, 500); // 500ms for long press

    setLongPressTimer(timer);
  };

  const handleMouseUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    if (onLongPressEnd) {
      onLongPressEnd();
    }
  };

  const handleMouseLeave = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    if (onLongPressEnd) {
      onLongPressEnd();
    }
  };

  // Long press handlers for touch
  const handleTouchStart = () => {
    const timer = setTimeout(() => {
      if (onLongPressStart) {
        onLongPressStart(rec.activityType.id);
      }
    }, 500); // 500ms for long press

    setLongPressTimer(timer);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Clear long press timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    if (onLongPressEnd) {
      onLongPressEnd();
    }

    // Double tap detection (only on mobile)
    const currentTime = new Date().getTime();
    const tapGap = currentTime - lastTap;

    if (tapGap < 300 && tapGap > 0) {
      // Double tap detected - show context menu
      e.preventDefault();
      e.stopPropagation();
      const touch = e.changedTouches[0];
      setContextMenu({ x: touch.clientX, y: touch.clientY });
    }

    setLastTap(currentTime);
  };

  // Determine if we should show the streak flame icon
  const shouldShowStreakFlame = (): { show: boolean; isGold: boolean } => {
    // Must have a current streak
    if (rec.currentStreak === 0 || !rec.currentStreakStart) {
      return { show: false, isGold: false };
    }

    // Calculate if streak is at least 3 intervals (3 * desired frequency)
    const minStreakDays = rec.activityType.desiredFrequency * 3;
    if (rec.currentStreak < minStreakDays) {
      return { show: false, isGold: false };
    }

    // Check if this is a current streak (last activity was recent enough)
    if (rec.daysSinceLastActivity !== null && rec.daysSinceLastActivity > rec.activityType.desiredFrequency) {
      return { show: false, isGold: false };
    }

    // Check if streak goes back to the first activity (gold flame)
    const isGold = rec.currentStreakStart === rec.firstActivityDate;

    return { show: true, isGold };
  };

  const streakFlame = shouldShowStreakFlame();

  return (
    <>
      <div
        className={`activity-card activity-card-${variant} ${shouldHighlight ? 'activity-card-overdue' : ''}`}
        style={{
          '--border-color': sectionColors.dark,
          '--text-color-dark': sectionColors.dark,
          '--text-color-light': sectionColors.light,
        } as React.CSSProperties}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
      <div className="activity-card-header">
        <div className="activity-card-title-section">
          <h3 className="activity-card-title">{rec.activityType.name}</h3>
          <StatusBadge status={rec.status} size="small" />
        </div>
        <div className="activity-card-icons">
          {showStreakFlame && streakFlame.show && (
            <div className={`streak-flame-icon ${streakFlame.isGold ? 'streak-flame-gold' : 'streak-flame-silver'}`}>
              <TablerIcons.IconFlame size={28} stroke={1.5} />
            </div>
          )}
          {rec.activityType.icon && (
            <div className="activity-card-icon">{renderIcon(rec.activityType.icon, rec.activityType.tag?.color)}</div>
          )}
        </div>
      </div>

      <div className="activity-card-body">
        <div className="activity-card-info">
          <span className="activity-card-label">Last performed</span>
          <span
            className="activity-card-value"
            style={{
              color: rec.daysSinceLastActivity !== null
                ? getNumberColor(rec.daysSinceLastActivity, rec.activityType.desiredFrequency)
                : '#ffffff'
            }}
          >
            {formatLastPerformed(rec.lastPerformedDate, rec.daysSinceLastActivity)}
          </span>
        </div>

        <div className="activity-card-info">
          <span className="activity-card-label">Desired Frequency</span>
          <span className="activity-card-value">
            {rec.activityType.desiredFrequency} {rec.activityType.desiredFrequency === 1 ? 'day' : 'days'}
          </span>
        </div>

        {showDetailedData && (
          <div className="activity-card-detailed-stats">
            <div className="activity-card-stat-row">
              <div className="activity-card-stat">
                <span className="stat-label">Last 3 Avg:</span>
                <span
                  className="stat-value"
                  style={{
                    color: getNumberColor(rec.averageFrequencyLast3, rec.activityType.desiredFrequency)
                  }}
                >
                  {rec.averageFrequencyLast3 !== null ? `${rec.averageFrequencyLast3} days` : 'N/A'}
                </span>
              </div>
              <div className="activity-card-stat">
                <span className="stat-label">Last 10 Avg:</span>
                <span
                  className="stat-value"
                  style={{
                    color: getNumberColor(rec.averageFrequencyLast10, rec.activityType.desiredFrequency)
                  }}
                >
                  {rec.averageFrequencyLast10 !== null ? `${rec.averageFrequencyLast10} days` : 'N/A'}
                </span>
              </div>
            </div>
            <div className="activity-card-stat-row">
              {rec.currentStreak > 0 && rec.currentStreakStart ? (
                <>
                  <div className="activity-card-stat">
                    <span className="stat-label">Streak:</span>
                    <span className="stat-value">
                      {format(new Date(rec.currentStreakStart), 'M/d/yyyy')}
                    </span>
                  </div>
                  <div className="activity-card-stat">
                    <span className="stat-label">Duration:</span>
                    <span className="stat-value">
                      {rec.currentStreak} {rec.currentStreak === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="activity-card-stat">
                  <span className="stat-label">Streak:</span>
                  <span className="stat-value">None</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {variant === 'detailed' && rec.activityType.description && (
        <div className="activity-card-footer">
          <span className="activity-card-description">{rec.activityType.description}</span>
        </div>
      )}
    </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onCompletedToday={handleCompletedToday}
        />
      )}
    </>
  );
}
