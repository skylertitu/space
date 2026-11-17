'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { provisionEntityMold, ensureEntityMoldUpToDate } from '@/lib/mold/entityMold';
import { claimEntitySlug, filterRealEntities, generateUniqueEntitySlug } from '@/lib/entitySlug';

import { usePathname } from 'next/navigation';
import { installApiAuthFetch } from '@/lib/installApiAuthFetch';

// Debe instalarse a nivel de módulo: los hijos hacen fetch en sus efectos antes que este provider.
installApiAuthFetch();

export const DEMO_USER = {
    uid: 'demo_user_mensajeria',
    email: 'admin@mensajeria.local',
    displayName: 'Admin Mensajería',
    photoURL: '/assets/rai-logo-circular.png',
    emailVerified: true,
    isAnonymous: false,
    providerData: [],
    getIdToken: async () => 'demo_token_bypass',
    getIdTokenResult: async () => ({ token: 'demo_token_bypass', claims: {}, authTime: '0', issuedAtTime: '0', expirationTime: '9999999999' }),
} as unknown as User;

interface AuthContextType {
    currentUser: User | null;
    loading: boolean;
    activeEntity: string | null;
    activeEntityRoute: string | null;
    setActiveEntity: (entityId: string, routeSegment?: string) => void;
    loginDemo: () => void;
    logoutDemo: () => void;
    isDemo: boolean;
}

const AuthContext = createContext<AuthContextType>({
    currentUser: null,
    loading: true,
    activeEntity: null,
    activeEntityRoute: null,
    setActiveEntity: () => {},
    loginDemo: () => {},
    logoutDemo: () => {},
    isDemo: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeEntity, setActiveEntityState] = useState<string | null>(null);
    const [activeEntityRoute, setActiveEntityRoute] = useState<string | null>(null);
    const [isDemo, setIsDemo] = useState(false);
    const pathname = usePathname();

    const loginDemo = () => {
        try {
            localStorage.setItem('roosevelt_demo_mode', 'true');
            localStorage.setItem('roosevelt_active_entity', 'mensajeria');
            localStorage.setItem('roosevelt_active_entity_route', 'mensajeria');
        } catch {}
        setCurrentUser(DEMO_USER);
        setActiveEntityState('mensajeria');
        setActiveEntityRoute('mensajeria');
        setIsDemo(true);
        setLoading(false);
    };

    const logoutDemo = () => {
        try {
            localStorage.removeItem('roosevelt_demo_mode');
        } catch {}
        setCurrentUser(null);
        setIsDemo(false);
    };

    const setActiveEntity = (entityId: string, routeSegment?: string) => {
        setActiveEntityState(entityId);
        const route = routeSegment || entityId;
        setActiveEntityRoute(route);
        localStorage.setItem('roosevelt_active_entity', entityId);
        localStorage.setItem('roosevelt_active_entity_route', route);
    };

    useEffect(() => {
        const parts = pathname?.split('/') || [];
        // Entity routes are resolved in EntityRouteResolver (slug → doc id).
        if (parts.length >= 3 && parts[1] === 'home' && parts[2]) {
            return;
        }

        const saved = localStorage.getItem('roosevelt_active_entity');
        const savedRoute = localStorage.getItem('roosevelt_active_entity_route');
        if (saved) {
            setActiveEntityState(saved);
            setActiveEntityRoute(savedRoute || saved);
        } else {
            setActiveEntityState('life');
            setActiveEntityRoute('life');
        }
    }, [pathname]);

    useEffect(() => {
        try {
            if (typeof window !== 'undefined' && localStorage.getItem('roosevelt_demo_mode') === 'true') {
                setCurrentUser(DEMO_USER);
                setActiveEntityState(localStorage.getItem('roosevelt_active_entity') || 'mensajeria');
                setActiveEntityRoute(localStorage.getItem('roosevelt_active_entity_route') || 'mensajeria');
                setIsDemo(true);
                setLoading(false);
                return;
            }
        } catch {}

        try {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                // Aislamiento en navegadores compartidos: la entidad activa guardada pertenece a un solo usuario.
                try {
                    const lastUid = localStorage.getItem('roosevelt_last_uid');
                    if (!user || (lastUid && lastUid !== user.uid)) {
                        localStorage.removeItem('roosevelt_active_entity');
                        localStorage.removeItem('roosevelt_active_entity_route');
                        if (user) {
                            setActiveEntityState('life');
                            setActiveEntityRoute('life');
                        }
                    }
                    if (user) localStorage.setItem('roosevelt_last_uid', user.uid);
                    else localStorage.removeItem('roosevelt_last_uid');
                } catch { /* localStorage no disponible */ }

                if (user) {
                    try {
                        const userDocRef = doc(db, 'users', user.uid);
                        const docSnap = await getDoc(userDocRef);
                        if (!docSnap.exists()) {
                            // 1. Root Document
                            await setDoc(userDocRef, {
                                name: user.displayName || 'Unnamed User',
                                email: user.email,
                                createdAt: new Date(),
                                lastLogin: new Date()
                            });
                            
                            const randomCompanyId = `company_${Math.random().toString(36).substring(2, 9)}`;

                            // 2. Seed Entities ('life', and one dynamic company)
                            const initialEntities = [
                                { id: 'life', name: 'Personal', desc: 'Personal OS', type: 'persona' },
                                { id: randomCompanyId, name: 'Mi Primera Empresa', desc: 'Business OS', type: 'empresa' }
                            ];
                            const signedInWithGoogle = user.providerData.some((provider) => provider.providerId === 'google.com');

                            // Seed entities and settings in parallel
                            await Promise.all(initialEntities.map(async (entity) => {
                                const slug = await generateUniqueEntitySlug(user.uid, entity.name, entity.id);
                                await Promise.all([
                                    setDoc(doc(db, `users/${user.uid}/entities/${entity.id}`), {
                                        initialized: true,
                                        name: entity.name,
                                        slug,
                                        type: entity.type,
                                        description: entity.desc,
                                        createdAt: new Date()
                                    }),
                                    setDoc(doc(db, `users/${user.uid}/entities/${entity.id}/settings/general`), {
                                        theme: 'dark'
                                    }),
                                    setDoc(doc(db, `users/${user.uid}/entities/${entity.id}/integrations/_init`), {
                                        encrypted: false,
                                        updatedAt: new Date()
                                    })
                                ]);
                                await claimEntitySlug(user.uid, entity.id, slug);
                                await provisionEntityMold(db, user.uid, entity.id);
                            }));

                            if (signedInWithGoogle && typeof window !== 'undefined') {
                                const { queueGmailBootstrap } = await import('@/lib/integrations/gmailAutoConnect');
                                queueGmailBootstrap({
                                    userId: user.uid,
                                    email: user.email,
                                    entityIds: initialEntities.map((entity) => entity.id),
                                });
                            }
                        } else {
                            // If user already exists, update last login...
                            await updateDoc(userDocRef, {
                                lastLogin: new Date()
                            });

                            // ...and migrate ALL their entities to the latest platform mold
                            // version, so every client gets the newest data structures
                            // (reception column, starter bot, etc.) without visiting a
                            // specific page. Cheap: skips entities already up to date.
                            try {
                                const entitiesSnap = await getDocs(collection(db, `users/${user.uid}/entities`));
                                const realEntities = filterRealEntities(
                                    entitiesSnap.docs.map((entityDoc) => ({
                                        id: entityDoc.id,
                                        name: entityDoc.data().name,
                                        slug: entityDoc.data().slug,
                                    }))
                                );
                                await Promise.all(
                                    realEntities.map((entity) =>
                                        ensureEntityMoldUpToDate(db, user.uid, entity.id).catch((err) =>
                                            console.error(`Mold migration failed for entity ${entity.id}:`, err)
                                        )
                                    )
                                );
                            } catch (err) {
                                console.error('Mold migration sweep failed:', err);
                            }
                        }
                    } catch (error) {
                        console.error("Error creating isolated user document:", error);
                    }
                }
                setCurrentUser(user);
                setLoading(false);
            });
            return unsubscribe;
        } catch (err) {
            console.error("AuthContext: Error in onAuthStateChanged setup:", err);
            setLoading(false);
        }
    }, []);

    return (
        <AuthContext.Provider value={{ currentUser, loading, activeEntity, activeEntityRoute, setActiveEntity, loginDemo, logoutDemo, isDemo }}>
            {children}
        </AuthContext.Provider>
    );
};

