import { useRef, useState } from 'react';

export default function IntroScreen({ onDone }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      maxWidth: '600px', margin: '0 auto'
    }}>
      <video
        ref={videoRef}
        src={`${import.meta.env.BASE_URL}intro.mp4`}
        autoPlay
        muted
        playsInline
        onCanPlay={() => setReady(true)}
        onEnded={onDone}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block'
        }}
      />

      {ready && (
        <button
          onClick={onDone}
          style={{
            position: 'absolute', bottom: '2.5rem', right: '1.25rem',
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            padding: '0.45rem 1rem',
            borderRadius: '999px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            backdropFilter: 'blur(6px)'
          }}
        >
          Saltar →
        </button>
      )}
    </div>
  );
}
