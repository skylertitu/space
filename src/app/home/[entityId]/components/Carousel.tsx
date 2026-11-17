import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, PanInfo, useAnimationFrame, useMotionValue, useTransform } from 'framer-motion';
import { OrbNode } from './OrbNode';
import { SUITE_NODES } from '../constants';
import { CentralVideo } from './CentralVideo';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { PLAN_LABELS, minimumPlanForSuite } from '@/lib/subscriptions/plans';

const RADIUS_X = 1100;
const RADIUS_Z = 700;
const PERSPECTIVE = 1200;
const CENTER_Z_INDEX = 700;

const AUTO_ROTATION_SPEED = -0.05;
const DRAG_SENSITIVITY = 0.15;
const MOMENTUM_FRICTION = 0.95;

export const Carousel = () => {
    const router = useRouter();
    const { activeEntity, activeEntityRoute } = useAuth();
    const { entitlements } = useEntitlements(activeEntity);

    // Entidad sin plan vigente (sin suscripción, prueba vencida o sin código): TODAS las suites con candado.
    // Entidad con plan: candado solo en lo que su plan no incluye. Los candados desaparecen al canjear un código o pagar.
    const noPlan = !!entitlements && entitlements.enforced && !entitlements.free && !entitlements.active;
    const isLocked = (id: string) => {
        if (!entitlements || entitlements.free) return false;
        if (noPlan) return true;
        if (!entitlements.active) return false; // modo 'log' (emergencia): no se bloquea
        if (id === 'organigrama') return !entitlements.orgChart;
        return !(entitlements.suites as string[]).includes(id);
    };
    const handleLockedClick = (id: string, title: string) => {
        if (noPlan) {
            toast.info('Este entorno está bloqueado', { description: 'Canjea un código de acceso o activa una suscripción para desbloquearlo.' });
            router.push(`/subscriptions?entityId=${encodeURIComponent(activeEntity || '')}&redirect=${encodeURIComponent(`/home/${activeEntityRoute || activeEntity || ''}`)}`);
            return;
        }
        const need = id === 'organigrama' ? 'enterprise' : minimumPlanForSuite(id);
        toast.info(`${title} no está incluido en tu plan`, {
            description: need ? `Requiere el plan ${PLAN_LABELS[need as keyof typeof PLAN_LABELS]} o superior.` : undefined,
        });
        router.push(`/subscriptions/upgrade?entityId=${encodeURIComponent(activeEntity || '')}`);
    };

    const rotation = useMotionValue(0);
    const [mounted, setMounted] = useState(false);
    const [radius, setRadius] = useState({ x: RADIUS_X, z: RADIUS_Z });

    useEffect(() => {
        setMounted(true);
        const handleResize = () => {
            const width = window.innerWidth;
            const newRadiusX = Math.min(1100, width * 0.45);
            const newRadiusZ = Math.min(700, width * 0.3);
            setRadius({ x: newRadiusX, z: newRadiusZ });
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const velocityRef = useRef(0);
    const isDragging = useRef(false);

    useAnimationFrame(() => {
        if (isDragging.current) return;

        if (Math.abs(velocityRef.current) > 0.01) {
            rotation.set(rotation.get() + velocityRef.current);
            velocityRef.current *= MOMENTUM_FRICTION;
        } else {
            rotation.set(rotation.get() + AUTO_ROTATION_SPEED);
        }
    });

    const handlePan = useCallback((_: any, info: PanInfo) => {
        const delta = info.delta.x * DRAG_SENSITIVITY;
        rotation.set(rotation.get() + delta);
        velocityRef.current = delta;
    }, [rotation]);

    const handlePanStart = () => {
        isDragging.current = true;
        velocityRef.current = 0;
    };

    const handlePanEnd = (_: any, info: PanInfo) => {
        isDragging.current = false;
        velocityRef.current = info.velocity.x * 0.01;
    };

    if (!mounted) return null;

    return (
        <div className="relative w-full h-full flex items-center justify-center perspective-[1200px]">
            <motion.div
                className="fixed inset-0 z-0 cursor-grab active:cursor-grabbing bg-transparent select-none"
                style={{ touchAction: 'none' }}
                onPan={handlePan}
                onPanStart={handlePanStart}
                onPanEnd={handlePanEnd}
            />

            <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[68%] pointer-events-none select-none"
                style={{ zIndex: CENTER_Z_INDEX }}
            >
                <CentralVideo />
            </div>

            {SUITE_NODES.map((node, index) => {
                return (
                    <CarouselItem 
                        key={node.title}
                        node={node}
                        index={index}
                        total={SUITE_NODES.length}
                        rotation={rotation}
                        radius={radius}
                        locked={isLocked(node.id)}
                        onLockedClick={() => handleLockedClick(node.id, node.title)}
                    />
                );
            })}
        </div>
    );
};

function CarouselItem({ node, index, total, rotation, radius, locked, onLockedClick }: {
    locked?: boolean,
    onLockedClick?: () => void,
    node: any,
    index: number,
    total: number,
    rotation: any,
    radius: { x: number, z: number }
}) {
    const angleOffset = (360 / total) * index;
    
    const x = useTransform(rotation, (r: number) => {
        const rad = ((r + angleOffset) * Math.PI) / 180;
        return Math.sin(rad) * radius.x;
    });
    
    const z = useTransform(rotation, (r: number) => {
        const rad = ((r + angleOffset) * Math.PI) / 180;
        return Math.cos(rad) * radius.z;
    });

    const scale = useTransform(z, (zv: number) => (zv + PERSPECTIVE) / PERSPECTIVE);
    const opacity = useTransform(z, (zv: number) => Math.min(1, Math.max(0.4, (zv + radius.z) / (2 * radius.z) + 0.3)));
    const y = useTransform(z, (zv: number) => 60 + (zv * 0.2));
    const zIndex = useTransform(z, (zv: number) => Math.round(zv + CENTER_Z_INDEX));

    return (
        <motion.div
            className="absolute top-1/2 left-1/2 pointer-events-none"
            style={{ x, y, scale, opacity, zIndex }}
        >
            <div className="pointer-events-auto relative z-[1000] -translate-x-1/2 -translate-y-1/2">
                <OrbNode
                    href={node.href}
                    icon={node.icon}
                    title={node.title}
                    subtitle={node.subtitle}
                    color={node.color}
                    locked={locked}
                    onLockedClick={onLockedClick}
                />
            </div>
        </motion.div>
    );
}


