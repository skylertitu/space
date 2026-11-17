import {
    Lock, Flame, Users, Route, Sparkles, BookOpen, Building2, HeartHandshake, Rocket,
    UsersRound, Cpu, Compass, Github, PieChart, LockKeyhole, FileCode2, Landmark, Telescope,
    Wallet, Handshake, Store, ShieldCheck, Award, FileBadge, ArrowRightLeft, Activity, Search,
    Info, Layers, Brain, HeartHandshake as Impact, Rocket as Launch, type LucideIcon,
} from 'lucide-react';
import { MENU_TEXT, type MenuLang } from './navMenuText';

// Menús de la barra superior, copiados del sitio de la empresa (land-luxor-intelligence).
// Las rutas internas de ese sitio se apuntan a su dominio.
const LUXOR_SITE = 'https://www.luxorintelligence.com';

export interface MegaMenuItem {
    icon: LucideIcon;
    title: string;
    desc: string;
    image?: string;
    href: string;
    external?: boolean;
    /** Enlace dentro de esta misma página (no abre pestaña nueva). */
    local?: boolean;
}

export const MENU_IDS = ['project', 'product', 'infrastructure', 'build', 'ecosystem', 'utility', 'security', 'onchain'] as const;
export type MenuId = (typeof MENU_IDS)[number];

const site = (path: string) => `${LUXOR_SITE}${path}`;

const OWN_IDS = ['product', 'infrastructure', 'build'] as const;
export const isOwnMenu = (id: MenuId) => (OWN_IDS as readonly string[]).includes(id);

// Textos de los menús propios de Roosevelt (Producto, Infraestructura, Desarrollo).
export const OWN_MENU_TEXT = {
    en: {
        product: { label: 'Product', title: 'Product', intro: 'The principles and impact behind Roosevelt Super Intelligence.' },
        infrastructure: { label: 'Infrastructure', title: 'Infrastructure', intro: 'The capabilities and the intelligence that power Roosevelt.' },
        build: { label: 'Build', title: 'Build', intro: 'Start your project with Roosevelt and learn how it works.' },
    },
    es: {
        product: { label: 'Producto', title: 'Producto', intro: 'Los principios y el impacto detrás de Roosevelt Super Intelligence.' },
        infrastructure: { label: 'Infraestructura', title: 'Infraestructura', intro: 'Las capacidades y la inteligencia que impulsan a Roosevelt.' },
        build: { label: 'Desarrollo', title: 'Desarrollo', intro: 'Comienza tu proyecto con Roosevelt y aprende cómo funciona.' },
    },
} as const;

export function getMegaMenus(lang: MenuLang): Record<MenuId, MegaMenuItem[]> {
    const t = MENU_TEXT[lang];
    const m = t.mega;
    const es = lang === 'es';
    return {
        product: [
            { icon: ShieldCheck, title: es ? 'Responsabilidad' : 'Responsibility', desc: es ? 'Cómo diseñamos Roosevelt con seguridad y confianza.' : 'How we design Roosevelt with security and trust.', href: '#responsibility', local: true },
            { icon: Impact, title: es ? 'Impacto Social' : 'Social Impact', desc: es ? 'El efecto de Roosevelt en las personas y los negocios.' : 'Roosevelt’s effect on people and businesses.', href: '#impact', local: true },
        ],
        infrastructure: [
            { icon: Layers, title: es ? 'Funciones' : 'Features', desc: es ? 'Todo lo que Roosevelt puede hacer por ti.' : 'Everything Roosevelt can do for you.', href: '#features', local: true },
            { icon: Brain, title: es ? 'Cerebro' : 'Brain', desc: es ? 'La Super Inteligencia que coordina tus operaciones.' : 'The Super Intelligence that coordinates your operations.', href: '#brain', local: true },
        ],
        build: [
            { icon: Launch, title: es ? 'Comenzar Proyecto' : 'Start Project', desc: es ? 'Crea tu cuenta y tu primer perfil.' : 'Create your account and your first profile.', href: '/login?register=true', local: true },
            { icon: BookOpen, title: es ? 'Documentación' : 'Documentation', desc: es ? 'Guías para sacarle el máximo a Roosevelt.' : 'Guides to get the most out of Roosevelt.', href: '#docs', local: true },
        ],
        project: [
            { icon: Info, title: lang === 'es' ? 'Nosotros' : 'About', desc: lang === 'es' ? 'Conoce Roosevelt Super Intelligence.' : 'Get to know Roosevelt Super Intelligence.', href: '#about', local: true },
            { icon: Sparkles, title: t.team, desc: m.team_desc, href: site('/team') },
            { icon: Route, title: t.roadmap, desc: m.eco_desc_3, href: site('/roadmap') },
            { icon: BookOpen, title: t.docs, desc: m.eco_desc_2, href: site('/coming-soon') },
            { icon: Building2, title: m.eco_title_4, desc: m.eco_desc_4, href: site('/coming-soon') },
            { icon: HeartHandshake, title: 'Donate', desc: 'Support the Luxor ecosystem.', href: site('/donate') },
            { icon: Lock, title: 'Private Sale', desc: 'Access the private sale details.', href: site('/private-sale') },
            { icon: Rocket, title: 'Presale', desc: 'Join the official presale.', href: site('/presale') },
            {
                icon: Users,
                image: 'https://firebasestorage.googleapis.com/v0/b/landluxor.firebasestorage.app/o/Ecosystem%2Froosevelt-logo.jpeg?alt=media&token=df9c2c0d-2063-4fa2-a7dc-35a1561f3f81',
                title: 'Founder',
                desc: 'Founder of Luxor Intelligence.',
                href: site('/team'),
            },
            { icon: Wallet, title: t.business, desc: m.eco_desc_2, href: site('/coming-soon') },
            { icon: Handshake, title: m.eco_title_1, desc: 'Partner with Luxor.', href: site('/coming-soon') },
            { icon: Store, title: m.eco_title_3, desc: 'Merchant directory.', href: site('/coming-soon') },
        ],
        ecosystem: [
            { icon: UsersRound, title: m.eco_title_1, desc: m.eco_desc_1, href: site('/coming-soon') },
            { icon: Cpu, title: m.eco_title_2, desc: m.eco_desc_2, href: site('/coming-soon') },
            { icon: Compass, title: m.eco_title_3, desc: m.eco_desc_3, href: site('/coming-soon') },
            { icon: Github, title: t.github, desc: t.github_desc, href: 'https://github.com', external: true },
        ],
        utility: [
            { icon: Flame, title: m.util_title_1, desc: m.util_desc_1, href: site('/coming-soon') },
            { icon: Landmark, title: m.util_title_2, desc: m.util_desc_2, href: site('/coming-soon') },
            { icon: Telescope, title: m.util_title_3, desc: t.solscan_desc, href: 'https://solscan.io', external: true },
            { icon: PieChart, title: m.tok_title_1, desc: m.tok_desc_1, href: site('/coming-soon') },
            { icon: UsersRound, title: t.holders, desc: t.holders_desc, href: 'https://orbmarkets.io/token/7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth/token-holders', external: true },
            { icon: LockKeyhole, title: m.tok_title_3, desc: m.tok_desc_3, href: site('/coming-soon') },
            { icon: FileCode2, title: m.tok_title_4, desc: t.contract_desc, href: 'https://solscan.io/token/7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth', external: true },
        ],
        security: [
            { icon: ShieldCheck, title: m.tok_title_2, desc: m.tok_desc_2, href: site('/coming-soon') },
            { icon: Award, title: t.certificates, desc: t.certificates_desc, href: site('/coming-soon') },
            { icon: FileBadge, title: t.contract_verified, desc: t.contract_verified_desc, href: site('/coming-soon') },
        ],
        onchain: [
            { icon: Wallet, title: 'Phantom', desc: t.phantom_desc, href: 'https://phantom.app/', external: true },
            { icon: ArrowRightLeft, title: 'Raydium (Swap)', desc: t.jupiter_desc, href: 'https://raydium.io/swap/?inputMint=sol&outputMint=7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth', external: true },
            { icon: Activity, title: 'DexScreener', desc: t.dex_desc, href: 'https://dexscreener.com/solana/7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth', external: true },
            { icon: Landmark, title: 'Orb Markets', desc: t.orb_desc, href: 'https://orbmarkets.io/token/7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth', external: true },
            { icon: Search, title: 'Solscan', desc: t.solscan_desc, href: 'https://solscan.io/token/7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth', external: true },
        ],
    };
}

const ECO = 'https://firebasestorage.googleapis.com/v0/b/landluxor.firebasestorage.app/o/Ecosystem%2F';

export const ECOSYSTEM_ASSETS = [
    { image: `${ECO}lxr_logo.png?alt=media&token=6c98c336-e417-4b75-8d5c-729233c5097b`, title: 'LUXOR UTILITY ASSET | $LXR', href: 'https://luxorstandard.com/' },
    { image: `${ECO}WhatsApp%20Image%202026-07-27%20at%209.35.45%20AM.jpeg?alt=media&token=b09d84e7-061b-45e6-972b-f02d3cbb19dc`, title: 'EXCELSIOR REAL WORLD ASSET | $XLS', href: 'https://excelsiorstandard.com/' },
    { image: `${ECO}WhatsApp%20Image%202026-07-09%20at%209.44.56%20AM.jpeg?alt=media&token=531b81b9-652c-4aa0-8652-c2de6c531e6e`, title: 'STABLECOIN | $USDX', href: 'https://occidentstandard.com/' },
    { image: `${ECO}rai-logo.jpg?alt=media&token=a091e66f-596e-451b-bd46-b3672d352d9e`, title: 'ROOSEVELT SUPER INTELLIGENCE', href: 'https://www.itsroosevelt.com/' },
    { image: `${ECO}WhatsApp%20Image%202026-08-23%20at%207.04.34%20AM.jpeg?alt=media&token=e577ab9e-4bde-465f-9d0c-b3f7ae93961c`, title: 'ROYALTY | DIGITAL FINANCIAL INSTITUTION', href: 'https://itsroyalty.us/' },
    { image: `${ECO}WhatsApp%20Image%202026-07-09%20at%209.44.55%20AM%20(1).jpeg?alt=media&token=88e66557-972f-4081-8583-fd1f772d83b9`, title: 'STERLING | MULTISIG - TOKEN LAUNCHER - PAYMENT GATEWAY', href: 'https://itssterling.com/' },
    { image: `${ECO}cropped_circle_image%20(2).png?alt=media&token=ca8a774d-be5d-4e3c-911a-7301f04a661d`, title: 'THE NEW GRAN COLOMBIA', href: 'https://itspormi.com/' },
    { image: `${ECO}cropped_circle_image%20(5).png?alt=media&token=8552834b-7d13-4e8c-a2bc-74742055e2c1`, title: 'POR MI | ECUADOR', href: 'https://chat.whatsapp.com/IlBVqL8K5XW76JXS23pGgt' },
    { image: `${ECO}cropped_circle_image%20(6).png?alt=media&token=d045b215-0ab1-4772-8110-6ad5e697d769`, title: 'POR MI | COLOMBIA', href: 'https://chat.whatsapp.com/DBqxD9iAT0S2xPZAMixrmk' },
    { image: `${ECO}cropped_circle_image%20(7).png?alt=media&token=792a5408-6a1c-44d9-8cab-1cd15646a299`, title: 'POR MI | VENEZUELA', href: 'https://chat.whatsapp.com/DBqxD9iAT0S2xPZAMixrmk' },
    { image: `${ECO}cropped_circle_image%20(4).png?alt=media&token=1eb162ea-12e5-4e62-bc16-938a8f14738c`, title: 'POR MI | PANAMA', href: 'https://www.itspormi.com/' },
    { image: `${ECO}WhatsApp%20Image%202026-07-13%20at%2010.02.08%20AM.jpeg?alt=media&token=4dc67b27-5ba1-4293-acd7-2d2895c4538f`, title: 'UDREAMMS | YOUR DREAM IN AMERICA', href: 'https://udreamms.com/' },
    { image: `${ECO}por-mi-america.png?alt=media&token=9a28c490-8674-4434-8dc1-67c0a9ce60db`, title: 'POR MI | THE NEW TECHNOLOGICAL REPUBLIC', href: 'https://itspormi.com/' },
    { image: `${ECO}Gemini_Generated_Image_m0uwrzm0uwrzm0uw.jpg?alt=media&token=5174b9f6-335f-49dd-8995-d82e6169e599`, title: 'POR MI | UNITED STATES', href: 'https://itspormi.com/' },
];
