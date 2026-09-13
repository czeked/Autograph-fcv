import React from 'react';
import { INDICATOR_GROUPS, savePrefs } from './indicatorPrefs.js';

const Tick = () => (
  <svg width="11" height="9" viewBox="0 0 11 9" fill="none" style={{ display: 'block' }}>
    <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function CustomCheck({ checked, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: '17px', height: '17px', borderRadius: '4px', flexShrink: 0,
        border: `1.5px solid ${checked ? '#00a8d6' : '#3a3a3a'}`,
        background: checked ? '#00a8d6' : '#1a1a1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {checked && <Tick />}
    </div>
  );
}

export default function IndicatorPrefsModal({ prefs, onSave, onClose, isFirstTime }) {
  const [local, setLocal] = React.useState({ ...prefs });

  const toggle      = (key) => setLocal(p => ({ ...p, [key]: !p[key] }));
  const selectAll   = () => setLocal(p => Object.fromEntries(Object.keys(p).map(k => [k, true])));
  const deselectAll = () => setLocal(p => Object.fromEntries(Object.keys(p).map(k => [k, false])));

  const handleSave = () => {
    savePrefs(local);
    onSave(local);
  };

  const checkedCount = Object.values(local).filter(Boolean).length;
  const totalCount   = Object.keys(local).length;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 999, padding: '1rem',
    }}>
      <div style={{
        background: '#1e1e1e',
        border: '1px solid #333',
        borderTop: '3px solid #00a8d6',
        borderRadius: '12px',
        width: '100%', maxWidth: '680px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
      }}>

        {/* ── Header ── */}
        <div style={{ padding: '1.75rem 2rem 1.5rem', borderBottom: '1px solid #2a2a2a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 700, color: '#f0f0f0', margin: '0 0 6px' }}>
                {isFirstTime ? 'Witaj w analizatorze' : 'Preferencje wskaźników'}
              </h2>
              <p style={{ fontSize: '0.81rem', color: '#777', margin: 0, lineHeight: 1.5 }}>
                {isFirstTime
                  ? 'Wybierz które sekcje i wskaźniki chcesz widzieć. Możesz to zmienić w każdej chwili.'
                  : 'Zaznacz sekcje i wskaźniki, które mają być widoczne podczas analizy.'}
              </p>
            </div>
            {!isFirstTime && (
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', color: '#555', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1, padding: '2px 6px', flexShrink: 0, marginLeft: '12px' }}
              >×</button>
            )}
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div style={{ padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a' }}>
          <span style={{ fontSize: '0.75rem', color: '#555' }}>
            Zaznaczono: <strong style={{ color: '#aaa' }}>{checkedCount}</strong> / {totalCount}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={selectAll} style={{
              background: 'transparent', border: '1px solid #3a3a3a', borderRadius: '6px',
              color: '#999', padding: '4px 12px', fontSize: '0.76rem', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}>Wybierz wszystkie</button>
            <button onClick={deselectAll} style={{
              background: 'transparent', border: '1px solid #3a3a3a', borderRadius: '6px',
              color: '#999', padding: '4px 12px', fontSize: '0.76rem', cursor: 'pointer',
              fontFamily: 'Inter, sans-serif',
            }}>Wyczyść</button>
          </div>
        </div>

        {/* ── Groups ── */}
        <div style={{ padding: '1.5rem 2rem 1.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {INDICATOR_GROUPS.map(group => (
            <div key={group.category}>
              <div style={{
                fontSize: '0.65rem', color: '#00a8d6', fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                marginBottom: '0.9rem',
                paddingLeft: '10px',
                borderLeft: '2px solid #00a8d6',
              }}>
                {group.category}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {group.items.map(item => {
                  const on = local[item.key] ?? true;
                  return (
                    <div
                      key={item.key}
                      onClick={() => toggle(item.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        cursor: 'pointer', padding: '8px 10px', borderRadius: '7px',
                        background: on ? 'rgba(0,168,214,0.07)' : 'transparent',
                        transition: 'background 0.15s',
                        userSelect: 'none',
                      }}
                    >
                      <CustomCheck checked={on} onChange={() => toggle(item.key)} />
                      <span style={{
                        fontSize: '0.82rem',
                        color: on ? '#e0e0e0' : '#4a4a4a',
                        transition: 'color 0.15s',
                        lineHeight: 1,
                      }}>
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: '1rem 2rem 1.5rem', borderTop: '1px solid #2a2a2a', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          {!isFirstTime && (
            <button onClick={onClose} style={{
              padding: '9px 20px', borderRadius: '7px', border: '1px solid #333',
              background: 'transparent', color: '#888', cursor: 'pointer',
              fontSize: '0.86rem', fontFamily: 'Inter, sans-serif',
            }}>Anuluj</button>
          )}
          <button onClick={handleSave} style={{
            padding: '9px 28px', borderRadius: '7px', border: 'none',
            background: '#00a8d6', color: '#fff', cursor: 'pointer',
            fontSize: '0.86rem', fontWeight: 700, fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.02em',
          }}>
            {isFirstTime ? 'Rozpocznij' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
