'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Carousel } from './components/Carousel';
import ProtectedRoute from '@/components/ProtectedRoute';
import { IdentitySwitcher } from '@/components/IdentitySwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useLanguage } from '@/contexts/LanguageContext';

const LetterByLetterText = ({ text, delayOffset = 0 }: { text: string, delayOffset?: number }) => {
    const characters = Array.from(text);
    
    const container = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.03, delayChildren: delayOffset },
        },
    };

    const child = {
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                type: "spring" as const,
                damping: 15,
                stiffness: 120,
            },
        },
        hidden: {
            opacity: 0,
            y: 15,
            transition: {
                type: "spring" as const,
                damping: 15,
                stiffness: 120,
            },
        },
    };

    return (
        <motion.span
            style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center' }}
            variants={container}
            initial="hidden"
            animate="visible"
        >
            {characters.map((char, index) => (
                <motion.span
                    variants={child}
                    key={index}
                    style={{ display: 'inline-block', minWidth: char === ' ' ? '0.25em' : 'auto' }}
                >
                    {char}
                </motion.span>
            ))}
        </motion.span>
    );
};

export default function SuiteDashboard() {
    const { activeEntity, currentUser } = useAuth();
    const { t, setLanguage } = useLanguage();
    const [loadingEntity, setLoadingEntity] = useState(true);

    useEffect(() => {
        setLanguage('en');
    }, [setLanguage]);

    useEffect(() => {
        async function fetchEntityType() {
            if (!currentUser || !activeEntity) return;
            if (currentUser.uid.startsWith('demo') || activeEntity === 'mensajeria' || activeEntity === 'personal' || activeEntity === 'life') {
                setLoadingEntity(false);
                return;
            }
            try {
                const docRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}`);
                await getDoc(docRef);
            } catch (error) {
                console.warn("Could not fetch entity type from Firestore (fallback applied):", error);
            } finally {
                setLoadingEntity(false);
            }
        }
        fetchEntityType();
    }, [activeEntity, currentUser]);

    if (loadingEntity) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white/50 tracking-widest text-xs uppercase">Connecting...</div>;
    }

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-black text-white overflow-y-auto relative selection:bg-blue-500/30 select-none">
                {/* Pure Black Background */}
                <div className="absolute inset-0 bg-black" />

                {/* Information Orbit Menu removed */}

                {/* Main layout - Fixed height, no scrolling */}
                <div className="relative z-10 w-full h-screen flex flex-col items-center justify-between pt-10 pb-6 overflow-y-auto">

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2, duration: 1 }}
                        className="mt-20 mb-4 text-center relative z-[2000] px-6"
                    >
                        <span className="text-3xl md:text-4xl font-light text-white/50 tracking-tight block mb-3">
                            <LetterByLetterText text={t('suite.welcome')} delayOffset={0.2} />
                        </span>
                        <h2 className="text-3xl md:text-5xl font-extralight tracking-tighter text-white leading-tight">
                            <LetterByLetterText text={t('suite.question')} delayOffset={0.6} />
                        </h2>
                    </motion.div>

                    {/* 2. Carousel Area - Flexible space */}
                    <div className="relative w-full flex-1 flex items-center justify-center min-h-0">
                        <Carousel />
                    </div>


                    {/* 4. Global Identity Switcher Glass Pill */}
                    <IdentitySwitcher />


                </div>
            </div>
        </ProtectedRoute>
    );
}

