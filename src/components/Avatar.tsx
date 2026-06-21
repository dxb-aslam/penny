// Penny — animated agent avatar (dot = locked production variant: coral blob + face)
export function AgentAvatar({
  size = 40,
  thinking = false,
}: {
  size?: number;
  thinking?: boolean;
  onDark?: boolean;
}) {
  return (
    <div
      className={`penny-ava ava-dot${thinking ? ' thinking' : ''}`}
      style={{ width: size, height: size }}
      aria-label="Penny"
    >
      <div
        className="body"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '46% 54% 52% 48% / 52% 48% 52% 48%',
          background: 'linear-gradient(140deg, #E0854F, #D96845 60%, #C2532F)',
          boxShadow: 'inset 0 -3px 6px rgba(120,40,15,0.25), inset 0 2px 4px rgba(255,235,210,0.5)',
        }}
      />
      <svg viewBox="0 0 40 40" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <g fill="#3A2418">
          <rect className="eye" x="13" y="15" width="3.6" height="8" rx="1.8" />
          <rect className="eye" x="23.4" y="15" width="3.6" height="8" rx="1.8" />
        </g>
        <path d="M16 28 q4 3 8 0" stroke="#3A2418" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
