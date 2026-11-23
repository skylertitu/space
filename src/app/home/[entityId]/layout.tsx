'use client';

import React, { useEffect } from 'react';
import { useParams, usePathname } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { EntityRouteResolver } from '@/components/EntityRouteResolver';
import { SuiteGate } from '@/components/SuiteGate';
import { useLanguage } from '@/contexts/LanguageContext';
import { AskRooseveltBar } from '@/components/floating-bars/AskRooseveltBar';
import { EntityLeftFloatingBar } from '@/components/floating-bars/EntityLeftFloatingBar';
import { EntityRightFloatingBar } from '@/components/floating-bars/EntityRightFloatingBar';

export default function SuiteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const pathname = usePathname();
    const segment = typeof params?.entityId === 'string' ? params.entityId : '';
    const { setLanguage } = useLanguage();

    const isWorkspace = pathname?.includes('/workspace');

    useEffect(() => {
        setLanguage('en');
    }, [setLanguage]);

    return (
        <div className="min-h-screen w-full max-w-full bg-[#0a0a0a] text-white font-sans selection:bg-white/20 relative overflow-x-hidden">
            <ProtectedRoute>
                <EntityRouteResolver segment={segment}>
                    {!isWorkspace && (
                        <>
                            <EntityLeftFloatingBar />
                            <EntityRightFloatingBar />
                        </>
                    )}
                    <SuiteGate entitySegment={segment}>{children}</SuiteGate>
                    <AskRooseveltBar />
                </EntityRouteResolver>
            </ProtectedRoute>
        </div>
    );
}
