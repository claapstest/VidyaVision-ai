import React, { useState } from 'react';
import { CALL_OUTCOME_STATUS, STATUS_DISPLAY_CONFIG } from '../constants/callStatus';
import { PieChart as PieIcon, CheckCircle2 } from 'lucide-react';

export default function CallOutcomePieChart({
  statusCounts = {},
  selectedStatus = null,
  onSelectStatus = () => {}
}) {
  const [hoveredStatus, setHoveredStatus] = useState(null);

  // The 7 final outcome statuses in order
  const outcomeOrder = [
    CALL_OUTCOME_STATUS.INTERESTED,
    CALL_OUTCOME_STATUS.CALLBACK,
    CALL_OUTCOME_STATUS.ALREADY_APPLIED,
    CALL_OUTCOME_STATUS.ALREADY_JOINED,
    CALL_OUTCOME_STATUS.NOT_INTERESTED,
    CALL_OUTCOME_STATUS.WRONG_NUMBER_INVALID,
    CALL_OUTCOME_STATUS.NOT_ANSWERED
  ];

  // Calculate total outcome count (strictly sum of the 7 mutually exclusive outcomes)
  const totalCalls = outcomeOrder.reduce((acc, key) => acc + (statusCounts[key] || 0), 0);

  // Prepare chart segments
  const segments = outcomeOrder.map((key) => {
    const config = STATUS_DISPLAY_CONFIG[key];
    const count = statusCounts[key] || 0;
    const percentage = totalCalls > 0 ? (count / totalCalls) * 100 : 0;
    return {
      key,
      label: config.label,
      color: config.color,
      bg: config.bg,
      icon: config.icon,
      count,
      percentage
    };
  });

  // Calculate SVG Pie/Donut paths
  let cumulativeAngle = 0;
  const radius = 95;
  const innerRadius = 58;
  const cx = 120;
  const cy = 120;

  const paths = segments
    .filter(seg => seg.count > 0)
    .map((seg) => {
      const angle = (seg.count / totalCalls) * 360;
      const startAngle = cumulativeAngle;
      const endAngle = cumulativeAngle + angle;
      cumulativeAngle += angle;

      // Handle full circle case
      if (angle >= 359.9) {
        return {
          ...seg,
          d: `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx - 0.01} ${cy - radius} L ${cx - 0.01} ${cy - innerRadius} A ${innerRadius} ${innerRadius} 0 1 0 ${cx} ${cy - innerRadius} Z`
        };
      }

      const startRad = ((startAngle - 90) * Math.PI) / 180;
      const endRad = ((endAngle - 90) * Math.PI) / 180;

      const x1 = cx + radius * Math.cos(startRad);
      const y1 = cy + radius * Math.sin(startRad);
      const x2 = cx + radius * Math.cos(endRad);
      const y2 = cy + radius * Math.sin(endRad);

      const ix1 = cx + innerRadius * Math.cos(endRad);
      const iy1 = cy + innerRadius * Math.sin(endRad);
      const ix2 = cx + innerRadius * Math.cos(startRad);
      const iy2 = cy + innerRadius * Math.sin(startRad);

      const largeArc = angle > 180 ? 1 : 0;

      const d = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix1} ${iy1}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,
        'Z'
      ].join(' ');

      return {
        ...seg,
        d
      };
    });

  const activeFocus = hoveredStatus || selectedStatus;
  const focusedSegment = segments.find(s => s.key === activeFocus);

  return (
    <div className="card" style={{ padding: '1.25rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 className="card-title" style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PieIcon size={18} style={{ color: 'var(--accent)' }} /> Call Outcome Distribution
        </h2>
        {selectedStatus && (
          <button
            onClick={() => onSelectStatus('ALL')}
            className="btn btn-secondary"
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', borderRadius: '4px' }}
          >
            Reset Chart Filter
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
        {/* SVG Donut Chart */}
        <div style={{ position: 'relative', width: '240px', height: '240px', flexShrink: 0 }}>
          {totalCalls === 0 ? (
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: '2px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.8rem',
              textAlign: 'center',
              padding: '1rem'
            }}>
              <PieIcon size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
              No call outcomes recorded
            </div>
          ) : (
            <svg width="240" height="240" viewBox="0 0 240 240" style={{ transform: 'rotate(0deg)' }}>
              {paths.map((p) => {
                const isSelected = selectedStatus === p.key;
                const isHovered = hoveredStatus === p.key;
                const isDimmed = activeFocus && activeFocus !== p.key;

                return (
                  <path
                    key={p.key}
                    d={p.d}
                    fill={p.color}
                    opacity={isDimmed ? 0.35 : isSelected ? 1 : 0.85}
                    stroke="var(--bg-secondary, #0f172a)"
                    strokeWidth="2.5"
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isHovered || isSelected ? 'scale(1.025)' : 'scale(1)',
                      transformOrigin: `${cx}px ${cy}px`,
                      filter: isHovered || isSelected ? `drop-shadow(0 0 8px ${p.color}80)` : 'none'
                    }}
                    onMouseEnter={() => setHoveredStatus(p.key)}
                    onMouseLeave={() => setHoveredStatus(null)}
                    onClick={() => onSelectStatus(isSelected ? 'ALL' : p.key)}
                  >
                    <title>{`${p.label}: ${p.count} calls (${p.percentage.toFixed(1)}%)`}</title>
                  </path>
                );
              })}
            </svg>
          )}

          {/* Center Donut Hole Content */}
          {totalCalls > 0 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
                width: '100px'
              }}
            >
              {focusedSegment ? (
                <>
                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: focusedSegment.color }}>
                    {focusedSegment.percentage.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', lineHeight: '1.1', marginTop: '2px', fontWeight: '600' }}>
                    {focusedSegment.label}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {focusedSegment.count} calls
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {totalCalls}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Total Calls
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Legend List */}
        <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {segments.map((seg) => {
            const isSelected = selectedStatus === seg.key;
            const isHovered = hoveredStatus === seg.key;
            const isDimmed = activeFocus && activeFocus !== seg.key;

            return (
              <div
                key={seg.key}
                onClick={() => onSelectStatus(isSelected ? 'ALL' : seg.key)}
                onMouseEnter={() => setHoveredStatus(seg.key)}
                onMouseLeave={() => setHoveredStatus(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.4rem 0.65rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? `${seg.color}20` : isHovered ? 'rgba(255,255,255,0.05)' : 'transparent',
                  border: isSelected ? `1px solid ${seg.color}` : '1px solid transparent',
                  opacity: isDimmed ? 0.45 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', overflow: 'hidden' }}>
                  <span
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      backgroundColor: seg.color,
                      flexShrink: 0
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', fontWeight: isSelected ? '700' : '500', whiteSpace: 'nowrap' }}>
                    {seg.label}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', fontFamily: 'var(--mono)', color: seg.count > 0 ? seg.color : 'var(--text-muted)' }}>
                    {seg.count}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', minWidth: '38px', textAlign: 'right' }}>
                    {seg.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
