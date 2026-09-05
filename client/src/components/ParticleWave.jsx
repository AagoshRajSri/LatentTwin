import { useEffect, useRef } from 'react';

/**
 * ParticleWave — full-screen, label-free Google Stitch-style particle wave.
 * Mount it anywhere; it covers the entire viewport with a fixed overlay.
 */
export default function ParticleWave() {
  const canvasRef = useRef(null);
  const rafRef   = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const COLS        = 60;
    const ROWS        = 22;
    const BASE_RADIUS = 1.9;

    let W, H;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W * window.devicePixelRatio;
      canvas.height = H * window.devicePixelRatio;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    resize();
    window.addEventListener('resize', resize);

    // hue: 0→1 → indigo(240) → violet(270) → rose(340) → orange(30)
    function particleColor(norm, brightness) {
      // wrap hue across the indigo→violet→rose→orange arc
      const hue = (240 + norm * 150) % 360;
      const sat = 75 + brightness * 20;
      const lit = 40 + brightness * 35;
      const alpha = 0.45 + brightness * 0.55;
      return `hsla(${hue},${sat}%,${lit}%,${alpha})`;
    }

    let t = 0;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      const colGap = W / (COLS - 1);
      const mid    = H * 0.5;

      for (let row = 0; row < ROWS; row++) {
        const rowNorm = row / (ROWS - 1);  // 0 → 1
        // rows spread out from centre vertically
        const rowY = H * 0.2 + rowNorm * H * 0.6;

        for (let col = 0; col < COLS; col++) {
          const colNorm = col / (COLS - 1);

          // Three overlapping travelling waves
          const ph1 = col * 0.40 - t * 2.2 + row * 0.25;
          const ph2 = col * 0.25 + t * 1.5 - row * 0.18;
          const ph3 = col * 0.60 - t * 0.8 + row * 0.55;

          const amp1 = H * 0.11 * (0.6 + rowNorm * 0.4);
          const amp2 = H * 0.055;
          const amp3 = H * 0.03;

          const dy =
            Math.sin(ph1) * amp1 +
            Math.sin(ph2) * amp2 +
            Math.cos(ph3) * amp3;

          const x = col * colGap;
          const y = rowY + dy;

          // brightness follows wave crest
          const brightness =
            (Math.sin(ph1) * 0.5 + 0.5) * 0.75 +
            (Math.sin(ph2) * 0.5 + 0.5) * 0.25;

          // colour phase: blend column position + wave phase for sweep
          const colorNorm = ((colNorm + (ph1 / (Math.PI * 2)) * 0.3) % 1 + 1) % 1;

          // radius pulses with brightness
          const r = BASE_RADIUS * (0.55 + brightness * 0.9);

          // fade at left/right edges
          const edgeFade = Math.min(colNorm * 7, (1 - colNorm) * 7, 1);
          // fade at top/bottom edges
          const topFade  = Math.min(rowNorm * 5, (1 - rowNorm) * 5, 1);
          const fade     = edgeFade * topFade;

          ctx.beginPath();
          ctx.arc(x, y, r * Math.max(fade, 0), 0, Math.PI * 2);
          ctx.fillStyle = particleColor(colorNorm, brightness * fade);
          ctx.fill();
        }
      }

      t += 0.015;
      rafRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'radial-gradient(ellipse at 50% 50%, #080d1c 0%, #020509 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      />
      {/* Edge vignette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse 75% 65% at 50% 50%, transparent 25%, #020509 100%)',
        }}
      />
    </div>
  );
}
