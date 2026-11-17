'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'es' | 'en';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    'nav.infrastructure': 'Infrastructure',
    'nav.product': 'Product',
    'nav.build': 'Build',
    'nav.features': 'Features',
    'nav.brain': 'Brain',
    'nav.responsibility': 'Responsibility',
    'nav.socialImpact': 'Social Impact',
    'nav.about': 'About',
    'nav.signIn': 'Sign In',
    'nav.signUp': 'Sign Up',
    'nav.nucleo': 'Home',
    'hero.tag': 'Autonomous Infrastructure',
    'hero.titleLine1': 'Welcome to the',
    'hero.titleLine2': 'new era of autonomy',
    'hero.titleLine3': 'with',
    'hero.description': 'Stop configuring processes and start delegating results. elizmey is the intelligent platform that manages your messaging and automation infrastructure.',
    'nucleo.titleQuestion': 'Which digital asset would you like to work on?',
    'nucleo.titleManagement': 'Digital Asset Management',
    'suite.welcome': 'Welcome Back',
    'suite.question': 'Where should we start?',
  },
  es: {
    'nav.infrastructure': 'Infraestructura',
    'nav.product': 'Producto',
    'nav.build': 'Desarrollo',
    'nav.features': 'Funciones',
    'nav.brain': 'Cerebro',
    'nav.responsibility': 'Responsabilidad',
    'nav.socialImpact': 'Impacto Social',
    'nav.about': 'Nosotros',
    'nav.signIn': 'Sign In', // Iniciar Sesión - user wants them transparent but requested specifically to keep the sign in / sign up wording or translated. Let's provide Sign In/Sign Up or Iniciar Sesión/Registrarse depending on language, but let's keep them as "Sign In" and "Sign Up" if requested, or translate:
    'nav.signUp': 'Sign Up',
    'nav.nucleo': 'Inicio',
    'hero.tag': 'Infraestructura Autónoma',
    'hero.titleLine1': 'Bienvenido a la',
    'hero.titleLine2': 'nueva era de la autonomía',
    'hero.titleLine3': 'con',
    'hero.description': 'Deja de configurar procesos y comienza a delegar resultados. elizmey es la plataforma inteligente que gestiona tu infraestructura de mensajería y automatizaciones.',
    'nucleo.titleQuestion': '¿En qué activo digital te gustaría trabajar?',
    'nucleo.titleManagement': 'Gestión de Activos Digitales',
    'suite.welcome': 'Bienvenido de nuevo',
    'suite.question': '¿Por dónde empezamos?',
  }
};

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem('elizmey_lang') || localStorage.getItem('roosevelt_lang')) as Language;
    if (stored && (stored === 'es' || stored === 'en')) {
      setLanguageState(stored);
    } else {
      setLanguageState('en');
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('elizmey_lang', lang);
  };

  const t = (key: string): string => {
    return translations[language]?.[key] || translations['en']?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      <div style={!mounted ? { display: 'contents', visibility: 'hidden' } : { display: 'contents' }}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
