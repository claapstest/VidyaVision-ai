import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Sparkles } from 'lucide-react';

/**
 * Safely parse a datetime string (ISO or local format) into constituent parts
 */
function parseDateTimeParts(val) {
  let d;
  if (val && typeof val === 'string' && val.includes('T')) {
    const [dPart, tPart] = val.split('T');
    const [year, month, day] = dPart.split('-').map(Number);
    const [hour = 0, minute = 0, second = 0] = tPart.split(':').map(Number);
    d = new Date(year, (month || 1) - 1, day || 1, hour, minute, second);
  } else if (val) {
    d = new Date(val);
  }

  if (!d || isNaN(d.getTime())) {
    d = new Date(Date.now() + 15 * 60 * 1000);
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const hours24 = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();

  const isPm = hours24 >= 12;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  return {
    dateStr,
    hours24,
    hours12: String(hours12).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
    ampm: isPm ? 'PM' : 'AM'
  };
}

/**
 * Construct YYYY-MM-DDTHH:mm:ss string
 */
function buildIsoString(dateStr, hours24, minutes, seconds) {
  const h = String(hours24).padStart(2, '0');
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  return `${dateStr}T${h}:${m}:${s}`;
}

/**
 * CampaignDateTimePicker - Fixes missing hour/sec/minute labels in browser calendar popup
 * by providing explicit, clearly labeled columns for Date, Hour, Minute, Second, and AM/PM.
 */
export default function CampaignDateTimePicker({
  value,
  onChange,
  countdownText = '',
  label = 'Select Exact Date & Time:'
}) {
  const [use24Hour, setUse24Hour] = useState(false);

  const parts = parseDateTimeParts(value);

  // Initialize parent state with default ISO datetime if empty
  useEffect(() => {
    if (!value && onChange) {
      const defaultIso = buildIsoString(parts.dateStr, parts.hours24, parts.minutes, parts.seconds);
      onChange(defaultIso);
    }
  }, [value]);

  // Get today's date formatted as YYYY-MM-DD for the date input minimum
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const handleDateChange = (newDate) => {
    if (!newDate) return;
    const iso = buildIsoString(newDate, parts.hours24, parts.minutes, parts.seconds);
    onChange(iso);
  };

  const handleHour12Change = (newH12) => {
    const hNum = parseInt(newH12, 10);
    let newH24;
    if (parts.ampm === 'PM') {
      newH24 = hNum === 12 ? 12 : hNum + 12;
    } else {
      newH24 = hNum === 12 ? 0 : hNum;
    }
    const iso = buildIsoString(parts.dateStr, newH24, parts.minutes, parts.seconds);
    onChange(iso);
  };

  const handleHour24Change = (newH24) => {
    const iso = buildIsoString(parts.dateStr, parseInt(newH24, 10), parts.minutes, parts.seconds);
    onChange(iso);
  };

  const handleMinuteChange = (newMin) => {
    const iso = buildIsoString(parts.dateStr, parts.hours24, parseInt(newMin, 10), parts.seconds);
    onChange(iso);
  };

  const handleSecondChange = (newSec) => {
    const iso = buildIsoString(parts.dateStr, parts.hours24, parts.minutes, parseInt(newSec, 10));
    onChange(iso);
  };

  const handleAmpmChange = (targetAmpm) => {
    if (targetAmpm === parts.ampm) return;
    let newH24 = parts.hours24;
    if (targetAmpm === 'PM' && newH24 < 12) {
      newH24 += 12;
    } else if (targetAmpm === 'AM' && newH24 >= 12) {
      newH24 -= 12;
    }
    const iso = buildIsoString(parts.dateStr, newH24, parts.minutes, parts.seconds);
    onChange(iso);
  };

  // Human-readable formatted display
  let formattedDisplay = '';
  try {
    const [y, m, d] = parts.dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, parts.hours24, parseInt(parts.minutes, 10), parseInt(parts.seconds, 10));
    formattedDisplay = dateObj.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }) + `, ${parts.hours12}:${parts.minutes}:${parts.seconds} ${parts.ampm} (${String(parts.hours24).padStart(2, '0')}:${parts.minutes} hrs)`;
  } catch (e) {
    formattedDisplay = `${parts.dateStr} ${parts.hours12}:${parts.minutes}:${parts.seconds} ${parts.ampm}`;
  }

  // Generate options
  const hours12Options = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const hours24Options = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const secondOptions = ['00', '10', '15', '20', '30', '40', '45', '50'];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '0.85rem 1rem'
    }}>
      {/* Header with Title and 12h/24h toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Calendar size={16} color="#4f46e5" />
          <span style={{ fontSize: '0.84rem', fontWeight: '700', color: 'var(--text-primary)' }}>
            {label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#e2e8f0', borderRadius: '6px', padding: '2px' }}>
          <button
            type="button"
            onClick={() => setUse24Hour(false)}
            style={{
              border: 'none',
              background: !use24Hour ? '#ffffff' : 'transparent',
              color: !use24Hour ? '#4f46e5' : '#64748b',
              fontWeight: !use24Hour ? '700' : '500',
              fontSize: '0.72rem',
              padding: '2px 7px',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: !use24Hour ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            12-Hour (AM/PM)
          </button>
          <button
            type="button"
            onClick={() => setUse24Hour(true)}
            style={{
              border: 'none',
              background: use24Hour ? '#ffffff' : 'transparent',
              color: use24Hour ? '#4f46e5' : '#64748b',
              fontWeight: use24Hour ? '700' : '500',
              fontSize: '0.72rem',
              padding: '2px 7px',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: use24Hour ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
            }}
          >
            24-Hour
          </button>
        </div>
      </div>

      {/* Clearly Labeled Inputs: Date, Hour, Min, Sec, AM/PM */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '0.5rem',
        flexWrap: 'wrap'
      }}>
        {/* 1. DATE COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            📅 Date
          </label>
          <input
            type="date"
            className="form-input"
            value={parts.dateStr}
            min={todayStr}
            onChange={(e) => handleDateChange(e.target.value)}
            style={{
              padding: '0.4rem 0.65rem',
              fontSize: '0.85rem',
              fontWeight: '600',
              minWidth: '140px',
              backgroundColor: '#ffffff'
            }}
          />
        </div>

        {/* 2. HOUR COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            🕐 Hour {use24Hour ? '(00-23)' : '(HH)'}
          </label>
          {use24Hour ? (
            <select
              className="form-input"
              value={String(parts.hours24).padStart(2, '0')}
              onChange={(e) => handleHour24Change(e.target.value)}
              style={{
                padding: '0.4rem 0.5rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                backgroundColor: '#ffffff',
                textAlign: 'center',
                width: '75px',
                cursor: 'pointer'
              }}
            >
              {hours24Options.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          ) : (
            <select
              className="form-input"
              value={parts.hours12}
              onChange={(e) => handleHour12Change(e.target.value)}
              style={{
                padding: '0.4rem 0.5rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                backgroundColor: '#ffffff',
                textAlign: 'center',
                width: '70px',
                cursor: 'pointer'
              }}
            >
              {hours12Options.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          )}
        </div>

        {/* Separator */}
        <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#94a3b8', paddingBottom: '0.4rem' }}>:</span>

        {/* 3. MINUTE COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            ⏱️ Minute (MM)
          </label>
          <select
            className="form-input"
            value={parts.minutes}
            onChange={(e) => handleMinuteChange(e.target.value)}
            style={{
              padding: '0.4rem 0.5rem',
              fontSize: '0.85rem',
              fontWeight: '700',
              backgroundColor: '#ffffff',
              textAlign: 'center',
              width: '70px',
              cursor: 'pointer'
            }}
          >
            {minuteOptions.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Separator */}
        <span style={{ fontSize: '1.1rem', fontWeight: '800', color: '#94a3b8', paddingBottom: '0.4rem' }}>:</span>

        {/* 4. SECOND COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{
            fontSize: '0.72rem',
            fontWeight: '700',
            color: '#475569',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            ⚡ Sec (SS)
          </label>
          <select
            className="form-input"
            value={secondOptions.includes(parts.seconds) ? parts.seconds : '00'}
            onChange={(e) => handleSecondChange(e.target.value)}
            style={{
              padding: '0.4rem 0.5rem',
              fontSize: '0.85rem',
              fontWeight: '700',
              backgroundColor: '#ffffff',
              textAlign: 'center',
              width: '70px',
              cursor: 'pointer'
            }}
          >
            {secondOptions.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* 5. AM / PM PILLS (Only for 12-hour mode) */}
        {!use24Hour && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{
              fontSize: '0.72rem',
              fontWeight: '700',
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.04em'
            }}>
              AM / PM
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid rgba(27, 59, 111, 0.15)',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              overflow: 'hidden'
            }}>
              <button
                type="button"
                onClick={() => handleAmpmChange('AM')}
                style={{
                  border: 'none',
                  padding: '0.45rem 0.65rem',
                  fontSize: '0.82rem',
                  fontWeight: parts.ampm === 'AM' ? '800' : '600',
                  backgroundColor: parts.ampm === 'AM' ? '#4f46e5' : '#ffffff',
                  color: parts.ampm === 'AM' ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => handleAmpmChange('PM')}
                style={{
                  border: 'none',
                  padding: '0.45rem 0.65rem',
                  fontSize: '0.82rem',
                  fontWeight: parts.ampm === 'PM' ? '800' : '600',
                  backgroundColor: parts.ampm === 'PM' ? '#4f46e5' : '#ffffff',
                  color: parts.ampm === 'PM' ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                PM
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation & Countdown Preview Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
        paddingTop: '0.35rem',
        borderTop: '1px dashed #cbd5e1'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <Clock size={13} color="#6366f1" />
          <span style={{ fontSize: '0.78rem', color: '#1e293b', fontWeight: '600' }}>
            {formattedDisplay}
          </span>
        </div>

        {countdownText && (
          <span style={{
            fontSize: '0.78rem',
            color: '#4338ca',
            fontWeight: '700',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            padding: '0.2rem 0.55rem',
            borderRadius: '6px'
          }}>
            Starts in: {countdownText}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Labeled Time Picker component for Cutoff Times (e.g., '18:30')
 */
export function CampaignTimePicker({
  value = '18:30',
  onChange,
  label = 'Stop calls strictly at:'
}) {
  const [hStr = '18', mStr = '30'] = String(value || '18:30').split(':');
  const hNum = parseInt(hStr, 10) || 0;
  const mNum = parseInt(mStr, 10) || 0;

  const isPm = hNum >= 12;
  const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
  const ampm = isPm ? 'PM' : 'AM';

  const updateTime = (newH24, newM) => {
    const hh = String(newH24).padStart(2, '0');
    const mm = String(newM).padStart(2, '0');
    onChange(`${hh}:${mm}`);
  };

  const handleHourChange = (newH12) => {
    const num = parseInt(newH12, 10);
    let newH24;
    if (ampm === 'PM') {
      newH24 = num === 12 ? 12 : num + 12;
    } else {
      newH24 = num === 12 ? 0 : num;
    }
    updateTime(newH24, mNum);
  };

  const handleMinuteChange = (newM) => {
    updateTime(hNum, parseInt(newM, 10));
  };

  const handleAmpmChange = (targetAmpm) => {
    if (targetAmpm === ampm) return;
    let newH24 = hNum;
    if (targetAmpm === 'PM' && newH24 < 12) {
      newH24 += 12;
    } else if (targetAmpm === 'AM' && newH24 >= 12) {
      newH24 -= 12;
    }
    updateTime(newH24, mNum);
  };

  const hours12Options = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minuteOptions = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.45rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)', paddingBottom: '0.4rem' }}>
        {label}
      </span>

      {/* HOUR */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <label style={{ fontSize: '0.68rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
          Hour
        </label>
        <select
          className="form-input"
          value={String(h12).padStart(2, '0')}
          onChange={(e) => handleHourChange(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', fontWeight: '700', width: '65px', textAlign: 'center' }}
        >
          {hours12Options.map(h => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
      </div>

      <span style={{ fontSize: '1rem', fontWeight: '800', color: '#94a3b8', paddingBottom: '0.35rem' }}>:</span>

      {/* MINUTE */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <label style={{ fontSize: '0.68rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
          Minute
        </label>
        <select
          className="form-input"
          value={String(mNum).padStart(2, '0')}
          onChange={(e) => handleMinuteChange(e.target.value)}
          style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', fontWeight: '700', width: '65px', textAlign: 'center' }}
        >
          {minuteOptions.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* AM / PM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <label style={{ fontSize: '0.68rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase' }}>
          AM/PM
        </label>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid rgba(27, 59, 111, 0.15)',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#ffffff'
        }}>
          <button
            type="button"
            onClick={() => handleAmpmChange('AM')}
            style={{
              border: 'none',
              padding: '0.35rem 0.5rem',
              fontSize: '0.78rem',
              fontWeight: ampm === 'AM' ? '800' : '600',
              backgroundColor: ampm === 'AM' ? '#ef4444' : '#ffffff',
              color: ampm === 'AM' ? '#ffffff' : '#64748b',
              cursor: 'pointer'
            }}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => handleAmpmChange('PM')}
            style={{
              border: 'none',
              padding: '0.35rem 0.5rem',
              fontSize: '0.78rem',
              fontWeight: ampm === 'PM' ? '800' : '600',
              backgroundColor: ampm === 'PM' ? '#ef4444' : '#ffffff',
              color: ampm === 'PM' ? '#ffffff' : '#64748b',
              cursor: 'pointer'
            }}
          >
            PM
          </button>
        </div>
      </div>

      <span style={{ fontSize: '0.78rem', color: '#64748b', paddingBottom: '0.4rem', fontWeight: '600' }}>
        ({String(hNum).padStart(2, '0')}:{String(mNum).padStart(2, '0')} hrs)
      </span>
    </div>
  );
}
