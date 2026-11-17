'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronDown, Zap, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';


import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { HeroAskRooseveltBar } from '@/components/landing/HeroAskRooseveltBar';
import { useLanguage } from '@/contexts/LanguageContext';

import { InnovationSection } from '@/components/home/InnovationSection';
import { PhilosophySection } from '@/components/home/PhilosophySection';
import { ArchitectureSection } from '@/components/home/ArchitectureSection';
import BracketsSectionClient from '@/components/home/BracketsSectionClient';
import { JoinSection } from '@/components/home/JoinSection';
import { ShowcaseSection } from '@/components/home/ShowcaseSection';
import { PillarsSection } from '@/components/home/PillarsSection';
import { GiantsSection } from '@/components/home/GiantsSection';
import { CTASection } from '@/components/home/CTASection';
import { ReviewsSection } from '@/components/home/ReviewsSection';
import Footer from '@/components/home/Footer';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
}

const BlueParticles = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationFrame = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const particleCount = 450;
    particles.current = Array.from({ length: particleCount }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 1.5 + 0.5,
      seed: Math.random()
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.current.forEach((p) => {
        p.x += p.vx + Math.sin(Date.now() * 0.001 + p.seed * 10) * 0.2;
        p.y += p.vy + Math.cos(Date.now() * 0.001 + p.seed * 10) * 0.2;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        const opacity = 0.1 + p.seed * 0.3;
        ctx.fillStyle = `rgba(59, 130, 246, ${opacity})`;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrame.current = requestAnimationFrame(animate);
    };

    const animation = animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-[5] pointer-events-none" />;
};

// Título con aparición letra por letra, en ola de inicio a fin.
const TITLE_LINES: string[][] = [
  ['Plataforma', 'de', 'Mensajería'],
  ['y', 'Automatización', 'Inteligente'],
];
const GRADIENT = ['#60a5fa', '#93c5fd', '#3b82f6']; // blue-400 → blue-300 → blue-500

const lerpColor = (t: number) => {
  const seg = t < 0.5 ? 0 : 1;
  const k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = parse(GRADIENT[seg]);
  const b = parse(GRADIENT[seg + 1]);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
};

// Movimiento ligero: sin desenfoque en pantallas pequeñas (cientos de letras animadas pesan en móviles) y sin animación si el usuario lo pide.
const useLightMotion = () => {
  const reduce = !!useReducedMotion();
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setSmall(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return { reduce, blur: !small && !reduce };
};

const WaveTitle = ({ replay = false }: { replay?: boolean }) => {
  // En la repetición (tras colapsar el párrafo) la ola es más lenta y espera a que termine el pliegue.
  const step = replay ? 0.11 : TITLE_STEP;
  const base = replay ? 0.8 : 0.15;
  const duration = replay ? 1.1 : 0.7;
  const { reduce, blur } = useLightMotion();
  let index = 0;
  return (
    <h1
      aria-label="Welcome to the new era of autonomy with elizmey"
      className="text-[1.75rem] leading-[1.15] sm:text-4xl md:text-5xl xl:text-6xl font-light tracking-tight text-white mb-4 leading-[1.15]"
    >
      {TITLE_LINES.map((words, li) => (
        <React.Fragment key={li}>
          {li > 0 && <br className="hidden md:block" />}
          {words.map((word, wi) => {
            const isBrand = word === 'elizmey' || word === 'Roosevelt';
            return (
              <React.Fragment key={wi}>
                <span aria-hidden="true" className="inline-block whitespace-nowrap">
                  {word.split('').map((ch, ci) => {
                    const i = index++;
                    return (
                      <motion.span
                        key={ci}
                        className="inline-block"
                        style={isBrand ? { color: lerpColor(ci / (word.length - 1)) } : undefined}
                        initial={{ opacity: 0, y: 28, ...(blur ? { filter: 'blur(6px)' } : {}) }}
                        animate={{ opacity: 1, y: [28, -8, 0], filter: 'blur(0px)' }}
                        transition={{
                          delay: reduce ? 0 : base + i * step,
                          duration: reduce ? 0.01 : duration,
                          ease: 'easeOut',
                          times: [0, 0.6, 1],
                        }}
                      >
                        {ch}
                      </motion.span>
                    );
                  })}
                </span>{' '}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}
    </h1>
  );
};

// Párrafo con la misma ola, continuando desde el título. Se queda 4 s completo y se colapsa a una flecha.
const PARAGRAPH =
  'Automatiza tus comunicaciones masivas, chatbots de WhatsApp y bandejas omnicanal. Diseña flujos de respuesta en tiempo real, programa difusiones para tus clientes y optimiza tus procesos operativos de mensajería desde un centro de mando unificado.';
const TITLE_CHARS = TITLE_LINES.flat().join('').length;
const TITLE_STEP = 0.045;
const PARAGRAPH_STEP = 0.007;
const PARAGRAPH_START = 0.15 + TITLE_CHARS * TITLE_STEP + 0.3;
const PARAGRAPH_END = PARAGRAPH_START + PARAGRAPH.replace(/ /g, '').length * PARAGRAPH_STEP + 0.7;
const PARAGRAPH_HOLD = 4;

const WaveParagraph = ({ onCollapse }: { onCollapse?: () => void }) => {
  const { reduce, blur } = useLightMotion();
  const [open, setOpen] = useState(true);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const collapse = setTimeout(() => {
      setOpen(false);
      setDone(true);
      onCollapse?.();
    }, (PARAGRAPH_END + PARAGRAPH_HOLD) * 1000);
    return () => clearTimeout(collapse);
  }, []);

  let index = 0;
  return (
    <div className="flex flex-col items-center max-w-2xl">
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        className="overflow-hidden"
      >
        <p
          aria-label={PARAGRAPH}
          className="text-[13px] leading-[1.6] sm:text-sm md:text-base md:leading-relaxed text-zinc-300 font-light text-left md:text-justify"
        >
          {PARAGRAPH.split(' ').map((word, wi) => (
            <React.Fragment key={wi}>
              <span aria-hidden="true" className="inline-block whitespace-nowrap">
                {word.split('').map((ch, ci) => {
                  const i = index++;
                  return (
                    <motion.span
                      key={ci}
                      className="inline-block"
                      initial={{ opacity: 0, y: 14, ...(blur ? { filter: 'blur(4px)' } : {}) }}
                      animate={{ opacity: 1, y: [14, -4, 0], filter: 'blur(0px)' }}
                      transition={{
                        delay: reduce ? 0 : PARAGRAPH_START + i * PARAGRAPH_STEP,
                        duration: reduce ? 0.01 : 0.7,
                        ease: 'easeOut',
                        times: [0, 0.6, 1],
                      }}
                    >
                      {ch}
                    </motion.span>
                  );
                })}
              </span>{' '}
            </React.Fragment>
          ))}
        </p>
      </motion.div>

      {/* El espacio de la flecha se reserva desde el inicio para que nada se mueva al aparecer */}
      <motion.button
        type="button"
        initial={false}
        animate={{ opacity: done ? 1 : 0 }}
        transition={{ delay: done ? 0.5 : 0, duration: 0.4 }}
        onClick={() => setOpen((v) => !v)}
        disabled={!done}
        tabIndex={done ? 0 : -1}
        aria-hidden={!done}
        aria-label={open ? 'Hide description' : 'Show description'}
        aria-expanded={open}
        className={`mt-2 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors ${done ? 'cursor-pointer' : 'pointer-events-none'}`}
      >
        <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </motion.button>
    </div>
  );
};

export default function LandingPage() {
  const [titleRun, setTitleRun] = useState(0);
  const { loginDemo } = useAuth();
  const router = useRouter();

  const handleEnterDemo = () => {
    loginDemo();
    router.push('/home/mensajeria/coo/omnichannel');
  };

  // Tras el colapso, el título repite la ola sin parar: al terminar cada pasada espera 3 s y reinicia.
  useEffect(() => {
    if (titleRun === 0) return;
    const cycleMs = (0.8 + (TITLE_CHARS - 1) * 0.11 + 1.1 + 3) * 1000;
    const t = setTimeout(() => setTitleRun((n) => n + 1), cycleMs);
    return () => clearTimeout(t);
  }, [titleRun]);
  const { language, t } = useLanguage();

  return (
    <div className="min-h-[100svh] bg-black text-white relative flex flex-col selection:bg-white/10 overflow-x-hidden">
      <LandingNavbar />

      {/* Central Roosevelt AI GIF - Low Z-index */}
      <div className="absolute top-0 left-0 w-full h-[100svh] pointer-events-none z-0 opacity-100 overflow-hidden">
        <img
          src="https://firebasestorage.googleapis.com/v0/b/roosevelt-491004.firebasestorage.app/o/square.gif?alt=media&token=fffc42d4-05c9-4b9f-8c9d-4d17fc4809c9"
          alt="elizmey"
          className="absolute top-1/2 xl:top-[47%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(max(120vw,80svh),125svh)] max-w-none xl:w-[110vw] xl:max-w-[1080px] h-auto object-contain"
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* Blue Particles - Middle Z-index (Over the GIF) */}
      <BlueParticles />

      {/* Main Content Container */}
      <div className="relative z-[10] w-full px-5 sm:px-8 md:px-12 xl:px-[76px] flex flex-col items-center justify-end min-h-[100svh] pt-24 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-5 xl:pb-6 gap-5 md:gap-8 xl:gap-10">

        {/* Hero Text (centrado) */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-4xl flex flex-col items-center text-center justify-center relative top-0"
        >
          {/* Eyebrow / Overline */}
          <span className="text-blue-400 text-xs md:text-sm tracking-[0.2em] uppercase font-medium mb-3 block">
            Plataforma de Mensajería Automática
          </span>

          {/* Main Title (H1) */}
          <WaveTitle key={titleRun} replay={titleRun > 0} />

          {/* Unified Description */}
          <WaveParagraph onCollapse={() => setTitleRun(1)} />
        </motion.div>

        {/* Barra Ask Roosevelt, justo debajo del texto */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="w-full flex justify-center shrink-0 relative -top-[19px]"
        >
          <HeroAskRooseveltBar />
        </motion.div>

        {/* Acceso Directo a la Plataforma de Mensajería */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-4 z-20 pb-4"
        >
          <button
            onClick={handleEnterDemo}
            className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full font-semibold text-sm transition-all shadow-xl shadow-blue-500/30 flex items-center gap-2 border border-blue-400/30 cursor-pointer"
          >
            <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
            <span>Acceder al Panel de Mensajería (Sin Firebase)</span>
          </button>
        </motion.div>

      </div>

      <main className="w-full">
        <InnovationSection />
        <PhilosophySection />
        <ArchitectureSection />
        <BracketsSectionClient />
        <JoinSection />
        {/* ShowcaseSection and PillarsSection with Roosevelt AI Background */}
        <div className="relative overflow-hidden w-full">
          <div className="absolute inset-0 pointer-events-none z-0 opacity-80 overflow-hidden flex items-center justify-center">
            <img
              src="/assets/Roosevelt Ai.gif"
              alt="elizmey Background"
              className="w-full max-w-[110vw] md:max-w-[90vw] xl:max-w-6xl h-auto scale-[1.55] md:scale-[1.35] xl:scale-[1.35] object-cover opacity-80"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="relative z-10">
            <ShowcaseSection />
            <PillarsSection />
          </div>
        </div>
        <GiantsSection />
        <CTASection />
        <ReviewsSection />
      </main>

      <Footer />
    </div>
  );
}
