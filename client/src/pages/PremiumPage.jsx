import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, ArrowLeft, Zap, GitPullRequest, Cpu, ShieldCheck, Lock, Sparkles, CheckCircle, Clock } from 'lucide-react';

const FEATURES = [
  {
    icon: Cpu,
    title: 'Autonomous Full-Repo Scan',
    description: 'Gemini autonomously sweeps your entire codebase — no stack trace needed — to find every bug, code smell, and architectural risk.',
    eta: 'Available in Beta',
    color: 'from-violet-500 to-purple-600',
    glow: 'rgba(139,92,246,0.3)',
  },
  {
    icon: ShieldCheck,
    title: 'Large Repository Support',
    description: 'Analyse monorepos and large codebases (up to 10 GB) that go well beyond the free-tier limit. Built to handle enterprise-scale projects.',
    eta: 'Coming Soon',
    color: 'from-sky-500 to-cyan-600',
    glow: 'rgba(14,165,233,0.3)',
  },
  {
    icon: GitPullRequest,
    title: 'Automated Fix & Push',
    description: 'Review Gemini\'s proposed patch right in the UI, then push a verified fix directly to GitHub as a clean pull request — in one click.',
    eta: 'Coming Soon',
    color: 'from-emerald-500 to-teal-600',
    glow: 'rgba(16,185,129,0.3)',
  },
  {
    icon: Zap,
    title: 'Continuous Monitoring',
    description: 'Connect your CI/CD pipeline. LatentTwin watches every commit and flags regressions before they hit production.',
    eta: 'Roadmap',
    color: 'from-amber-500 to-orange-600',
    glow: 'rgba(245,158,11,0.3)',
  },
];

const ETA_STYLE = {
  'Available in Beta': { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30' },
  'Coming Soon':       { bg: 'bg-sky-500/15',    text: 'text-sky-400',    border: 'border-sky-500/30' },
  'Roadmap':           { bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/30' },
};

function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139,92,246,${p.opacity})`;
        ctx.fill();
      }
      // Draw faint connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(139,92,246,${0.08 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}

export default function PremiumPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const feature = params.get('feature') ?? 'This feature';

  return (
    <div className="relative min-h-screen w-full bg-[#03070f] overflow-hidden flex flex-col font-sans">
      {/* Animated particle background */}
      <ParticleCanvas />

      {/* Ambient glow orbs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-violet-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-sky-600/10 blur-[120px] pointer-events-none" />

      {/* Navbar */}
      <header className="relative z-10 flex items-center justify-between px-8 py-5 border-b border-white/5">
        <div 
          onClick={() => navigate('/')} 
          className="flex items-center gap-3.5 cursor-pointer group"
          title="Return to Home"
        >
          <img src="/logo.png" alt="LatentTwin Logo" className="w-11 h-11 object-contain rounded-xl shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform" />
          <span className="text-base font-bold text-white tracking-tight group-hover:text-gray-200 transition-colors">LatentTwin</span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 rounded-lg transition-all"
        >
          <ArrowLeft size={13} /> Back to App
        </button>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-20 text-center">
        {/* Lock badge */}
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/25 px-4 py-1.5 rounded-full text-xs font-bold text-violet-400 tracking-widest uppercase mb-8">
          <Lock size={11} />
          Premium Feature
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-5 max-w-3xl">
          <span className="bg-gradient-to-r from-violet-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
            {feature}
          </span>
          <br />
          is a Premium Feature
        </h1>

        <p className="text-gray-400 text-base sm:text-lg max-w-xl mb-10 leading-relaxed">
          We're actively building the premium tier of LatentTwin. These capabilities require
          advanced LLM pipelines and GitHub integrations that incur real compute costs — and 
          we want to get them absolutely right before launch.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 mb-20">
          <button className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-violet-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]">
            <Sparkles size={15} />
            Join the Early Access List
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold text-sm px-6 py-3 rounded-xl transition-all"
          >
            <ArrowLeft size={14} />
            Continue with Free Features
          </button>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl text-left">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            const etaStyle = ETA_STYLE[f.eta];
            return (
              <div
                key={f.title}
                className="relative overflow-hidden bg-white/[0.03] border border-white/8 rounded-2xl p-5 group hover:border-white/15 transition-all"
                style={{ boxShadow: `0 0 0 0 ${f.glow}` }}
              >
                {/* Glow on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 20% 50%, ${f.glow} 0%, transparent 70%)` }}
                />
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center shadow-lg`}>
                      <Icon size={16} className="text-white" />
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border ${etaStyle.bg} ${etaStyle.text} ${etaStyle.border}`}>
                      {f.eta === 'Roadmap' ? <><Clock size={8} className="inline mr-1" />{f.eta}</> : <><CheckCircle size={8} className="inline mr-1" />{f.eta}</>}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1.5">{f.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{f.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-gray-600 border-t border-white/5">
        LatentTwin Premium — currently in development. All premium features are free during the beta period for early access members.
      </footer>
    </div>
  );
}
