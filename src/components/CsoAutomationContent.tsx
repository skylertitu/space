
"use client";
import React from 'react';
import { Zap, Clock, Users, FileText, Settings, ArrowRight } from "lucide-react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { BOT_CHANNELS } from '@/lib/automation/channels';

const UTILITY_FEATURES = [
  {
    icon: <FileText className="w-8 h-8 text-sky-400" />,
    title: "Respuestas Rápidas",
    description: "Crea y gestiona plantillas de mensajes para responder más rápido a las preguntas comunes.",
    action: "Gestionar Plantillas",
    href: "#"
  },
  {
    icon: <Zap className="w-8 h-8 text-amber-400" />,
    title: "Sugerencias de SI",
    description: "Activa sugerencias de respuesta impulsadas por SI basadas en los mensajes del cliente.",
    action: "Configurar SI",
    href: "#"
  },
  {
    icon: <Users className="w-8 h-8 text-rose-400" />,
    title: "Asignación de Chats",
    description: "Establece reglas para asignar automáticamente nuevas conversaciones a miembros específicos del equipo.",
    action: "Definir Reglas",
    href: "#"
  },
  {
    icon: <Clock className="w-8 h-8 text-indigo-400" />,
    title: "Mensajes Programados",
    description: "Gestiona y visualiza todos los mensajes que están programados para ser enviados en el futuro.",
    action: "Ver Programación",
    href: "#"
  },
  {
    icon: <Settings className="w-8 h-8 text-slate-400" />,
    title: "Flujos de Trabajo",
    description: "Crea flujos de trabajo avanzados, como añadir una etiqueta si un mensaje contiene una palabra específica.",
    action: "Crear Flujos",
    href: "#"
  }
];

function FeatureCard({
  icon,
  title,
  description,
  action,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <div
      className="group relative flex flex-col bg-white/[0.02] border border-white/8 rounded-2xl hover:border-white/20 transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer backdrop-blur-sm"
      onClick={onClick}
    >
      <div className="p-4 flex-grow">
        <div className="mb-3 flex items-center justify-between">
          {icon}
          {badge && (
            <span className="text-[8px] uppercase font-normal tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {badge}
            </span>
          )}
        </div>
        <h2 className="text-base font-normal text-white tracking-tight">{title}</h2>
        <p className="text-neutral-400 mt-1.5 text-xs leading-relaxed font-normal">{description}</p>
      </div>
      <div className="p-4 pt-0 mt-auto">
        <div className="flex items-center text-blue-500 font-normal text-[10px] uppercase tracking-wider">
          <span>{action}</span>
          <ArrowRight className="w-3 h-3 ml-1.5 transform transition-transform duration-300 group-hover:translate-x-1" />
        </div>
      </div>
    </div>
  );
}

export function CsoAutomationContent() {
  const router = useRouter();
  const { activeEntity, activeEntityRoute } = useAuth();

  const handleNavigate = (href: string) => {
    if (href && href !== '#') router.push(href);
  };

  return (
    <main className="flex-1 p-6 bg-black text-white font-sans">
      <div className="mb-6">
        <h1 className="text-3xl font-normal tracking-tight">Centro de Automatización</h1>
        <p className="text-neutral-400 mt-1 text-sm font-normal">
          Configura herramientas para agilizar tu comunicación y ahorrar tiempo.
        </p>
      </div>

      <h2 className="text-[10px] font-normal uppercase tracking-[0.25em] text-neutral-500 mb-3">
        Bots por canal
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-10">
        {BOT_CHANNELS.map((channel) => {
          const Icon = channel.Icon;
          const href = activeEntity ? channel.listHref(activeEntityRoute || activeEntity) : '#';
          return (
            <FeatureCard
              key={channel.slug}
              icon={
                <div className={`p-2 rounded-lg ${channel.activeBg} border ${channel.activeBorder} w-fit`}>
                  <Icon className={`w-6 h-6 ${channel.iconColor}`} />
                </div>
              }
              title={channel.title}
              description={channel.description}
              action={channel.action}
              onClick={() => handleNavigate(href)}
              badge={!channel.webhookReady ? 'Próximamente' : undefined}
            />
          );
        })}
      </div>

      <h2 className="text-[10px] font-normal uppercase tracking-[0.25em] text-neutral-500 mb-3">
        Herramientas
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {UTILITY_FEATURES.map((feature, index) => (
          <FeatureCard
            key={index}
            icon={React.cloneElement(feature.icon as React.ReactElement, {
              className: 'w-6 h-6 ' + (feature.icon as React.ReactElement).props.className.split(' ').filter((c: string) => !c.startsWith('w-') && !c.startsWith('h-')).join(' '),
            })}
            title={feature.title}
            description={feature.description}
            action={feature.action}
            onClick={() => handleNavigate(feature.href)}
          />
        ))}
      </div>
    </main>
  );
}
