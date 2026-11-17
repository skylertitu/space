import {
    Briefcase,
    Cpu,
    Globe,
    LineChart,
    Scale,
    Users,
    Landmark,
    Lightbulb,
    Heart,
    Zap,
    ShieldCheck,
    Database,
    Network,
    Package
} from 'lucide-react';

export const SUITE_NODES = [
    { id: "board", href: "/home/{entity}/workspace?role=board", icon: Landmark, title: "Board", subtitle: "Directors", color: "slate" },
    { id: "ceo", href: "/home/{entity}/workspace?role=ceo", icon: Briefcase, title: "CEO", subtitle: "Executive", color: "blue" },
    { id: "coo", href: "/home/{entity}/workspace?role=coo", icon: Globe, title: "COO", subtitle: "Operations", color: "emerald" },
    { id: "cfo", href: "/home/{entity}/workspace?role=cfo", icon: LineChart, title: "CFO", subtitle: "Finance", color: "amber" },
    { id: "cto", href: "/home/{entity}/workspace?role=cto", icon: Cpu, title: "CTO", subtitle: "Technology", color: "purple" },
    { id: "cmo", href: "/home/{entity}/workspace?role=cmo", icon: Users, title: "CMO", subtitle: "Marketing", color: "orange" },
    { id: "chro", href: "/home/{entity}/workspace?role=chro", icon: Heart, title: "CHRO", subtitle: "Resources", color: "rose" },
    { id: "cso", href: "/home/{entity}/workspace?role=cso", icon: Zap, title: "CSO", subtitle: "Strategy", color: "red" },
    { id: "cdo", href: "/home/{entity}/workspace?role=cdo", icon: Database, title: "CDO", subtitle: "Data", color: "orange" },
    { id: "ciso", href: "/home/{entity}/workspace?role=ciso", icon: ShieldCheck, title: "CISO", subtitle: "InfoSec", color: "blue" },
    { id: "cpo", href: "/home/{entity}/workspace?role=cpo", icon: Package, title: "CPO", subtitle: "Product", color: "indigo" },
    { id: "clo", href: "/home/{entity}/workspace?role=clo", icon: Scale, title: "CLO", subtitle: "Legal", color: "slate" },
    // Exclusivo del plan Enterprise: personas y agentes SI de la entidad
    { id: "organigrama", href: "/home/{entity}/organigrama", icon: Network, title: "Org Chart", subtitle: "People & SI", color: "indigo" },
];
