'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Zap, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const LandingNavbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { loginDemo } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleDirectAccess = () => {
    loginDemo();
    toast.success('Acceso directo activado (sin Firebase)');
    router.push('/home/mensajeria/coo/omnichannel');
  };

  return (
    <>
      <motion.nav
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`fixed top-0 left-0 w-full z-[100] transition-all duration-300 px-6 sm:px-10 py-4 ${
          isScrolled ? 'bg-black/80 backdrop-blur-md border-b border-white/10' : 'bg-transparent'
        }`}
      >
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Logo y Titular de la plataforma */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity shrink-0">
            <img 
              src="/assets/rai-logo.png" 
              alt="Logo" 
              className="h-10 w-10 sm:h-12 sm:w-12 object-contain" 
            />
            <div className="flex flex-col">
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-white leading-none">
                Roosevelt
              </span>
              <span className="text-[10px] sm:text-xs text-blue-400 font-medium tracking-wider uppercase mt-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                Mensajería Automática
              </span>
            </div>
          </Link>

          {/* Botones de acción directos (Sin menús ni enlaces innecesarios) */}
          <div className="hidden sm:flex items-center gap-3">
            {/* Acceso Directo sin Firebase */}
            <button
              onClick={handleDirectAccess}
              className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-full transition-all shadow-lg shadow-blue-500/25 flex items-center gap-2 border border-blue-400/30"
            >
              <Zap className="w-4 h-4 text-yellow-300 fill-yellow-300" />
              <span>Acceso Directo (Sin Firebase)</span>
            </button>

            {/* Iniciar sesión */}
            <Link href="/login">
              <button className="px-5 py-2 text-sm font-semibold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors">
                Iniciar Sesión
              </button>
            </Link>
          </div>

          {/* Botón menú móvil */}
          <button 
            className="sm:hidden p-2 text-white/80 hover:text-white transition-colors"
            aria-label="Abrir menú"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </motion.nav>

      {/* Menú Móvil */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl sm:hidden flex flex-col p-6"
          >
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <img src="/assets/rai-logo.png" alt="Logo" className="w-8 h-8 object-contain" />
                <span className="text-lg font-bold text-white">Roosevelt Mensajería</span>
              </div>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 text-white/70 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex flex-col gap-4 mt-6">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleDirectAccess();
                }}
                className="w-full py-4 text-base font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30"
              >
                <Zap className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                <span>Acceso Directo (Sin Firebase)</span>
              </button>

              <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                <button className="w-full py-4 text-base font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl transition-colors">
                  Iniciar Sesión
                </button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
