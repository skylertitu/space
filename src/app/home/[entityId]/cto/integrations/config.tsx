import React from 'react';

export type Category = 'All' | 'Business Messaging' | 'Social Media' | 'Live Chat' | 'Payments' | 'SMS' | 'Email' | 'SI';

export interface Integration {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    category: Category;
    popular?: boolean;
    status?: 'Connected' | 'Not Connected';
    color: string;
}

export const WhatsAppIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={`${className} fill-[#25D366]`} xmlns="http://www.w3.org/2000/svg">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
);

export const FacebookMessengerIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={`${className} fill-[#0084FF]`} xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.373 0 0 4.973 0 11.644c0 3.5 1.442 6.643 3.738 8.761.19.176.324.428.324.685l.06 2.128c.02.68.74 1.118 1.36.852l2.39-1.042c.205-.09.43-.102.645-.045C9.624 23.11 10.785 23.288 12 23.288c6.627 0 12-4.973 12-11.644S18.627 0 12 0zm7.14 8.948l-3.52 5.588c-.56.89-1.76 1.111-2.6.48l-2.8-2.103c-.258-.193-.612-.193-.87.003l-3.79 2.873c-.5.382-1.16-.22-0.83-.758l3.52-5.588c.56-.89 1.76-1.111 2.6-.48l2.8 2.103c.258.194.612.194.87-.003l3.79-2.873c.5-.382 1.16.22.83.758z" />
    </svg>
);

export const InstagramIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={`${className} fill-[#E4405F]`} xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
);

export const TelegramIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={`${className} fill-[#26A5E4]`} xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.14-.26.26-.53.26l.195-2.82 5.144-4.642c.224-.199-.048-.31-.345-.113L6.5 13.91l-2.73-.853c-.594-.185-.605-.594.124-.879l10.672-4.113c.494-.185.926.113.728.916z" />
    </svg>
);

export const XIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={`${className} fill-white`} xmlns="http://www.w3.org/2000/svg">
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.292 19.497h2.039L6.486 3.24H4.298l13.311 17.41z" />
    </svg>
);

export const GmailIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={`${className}`} xmlns="http://www.w3.org/2000/svg">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L12 9.573l8.073-6.08c1.618-1.214 3.927-.059 3.927 1.964z" fill="#EA4335" />
    </svg>
);

export const GeminiIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="geminiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4285F4" />
                <stop offset="50%" stopColor="#9B72CB" />
                <stop offset="100%" stopColor="#D96570" />
            </linearGradient>
        </defs>
        <path
            fill="url(#geminiGrad)"
            d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2zm7 11l.8 3.2L23 17l-3.2.8L19 21l-.8-3.2L15 17l3.2-.8L19 13zM5 14l.6 2.4L8 17l-2.4.6L5 20l-.6-2.4L2 17l2.4-.6L5 14z"
        />
    </svg>
);

export const StripeIcon = ({ className = "w-10 h-10" }: { className?: string }) => (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
        <path
            fill="#635BFF"
            d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"
        />
    </svg>
);

export const INTEGRATIONS: Integration[] = [
    {
        id: 'whatsapp',
        name: 'WhatsApp Business (Cloud API)',
        description: 'Conexión oficial de Meta. Requiere correo verificado y Meta Developer Portal. Ideal para automatización masiva.',
        icon: <WhatsAppIcon />,
        category: 'Business Messaging',
        popular: true,
        color: '#25D366'
    },
    {
        id: 'telegram',
        name: 'Telegram',
        description: 'Conecta tu bot de Telegram para gestionar mensajes y automatizaciones directamente desde elizmey.',
        icon: <TelegramIcon />,
        category: 'Business Messaging',
        popular: true,
        color: '#26A5E4'
    },
    {
        id: 'x_twitter',
        name: 'X (Twitter)',
        description: 'Gestiona tus mensajes directos y monitorea menciones en X para una atención al cliente inmediata.',
        icon: <XIcon />,
        category: 'Social Media',
        popular: false,
        color: '#ffffff'
    },
    {
        id: 'messenger',
        name: 'Messenger',
        description: 'Integra Facebook Messenger para centralizar tus conversaciones de fans y clientes en un solo lugar.',
        icon: <FacebookMessengerIcon />,
        category: 'Social Media',
        popular: true,
        color: '#0084FF'
    },
    {
        id: 'instagram',
        name: 'Instagram',
        description: 'Conecta Instagram para responder DMs y comentarios, potenciando tu engagement en la red social.',
        icon: <InstagramIcon />,
        category: 'Social Media',
        popular: true,
        color: '#E4405F'
    },
    {
        id: 'gmail',
        name: 'Gmail',
        description: 'Conecta varias cuentas: Gmail personal y Google Workspace (@tudominio.com) para enviar correos con tu marca.',
        icon: <GmailIcon />,
        category: 'Email',
        popular: true,
        color: '#EA4335'
    },
    {
        id: 'stripe',
        name: 'Stripe',
        description: 'Vincula tu cuenta de Stripe para validar pagos, leer clientes por teléfono y automatizar el acceso tras el checkout.',
        icon: <StripeIcon />,
        category: 'Payments',
        popular: true,
        color: '#635BFF'
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        description: 'API key de Google AI Studio por entidad. Potencia Humanizar en flujos de chatbots y otras capacidades de SI del tenant.',
        icon: <GeminiIcon />,
        category: 'SI',
        popular: true,
        color: '#4285F4'
    }
];

export const CATEGORIES: Category[] = ['All', 'Business Messaging', 'Social Media', 'Email', 'Payments', 'SI'];
