'use client';

import { useEffect, useRef } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
    clearGmailBootstrap,
    isGoogleLoginUser,
    openGmailConnectPopup,
    readGmailBootstrap,
} from '@/lib/integrations/gmailAutoConnect';

export function GmailAutoConnect() {
    const { currentUser, loading } = useAuth();
    const startedRef = useRef(false);

    useEffect(() => {
        if (loading || !currentUser || startedRef.current) return;
        if (!isGoogleLoginUser(currentUser)) return;

        const bootstrap = readGmailBootstrap();
        if (!bootstrap || bootstrap.userId !== currentUser.uid) return;

        startedRef.current = true;

        (async () => {
            try {
                let entityIds = bootstrap.entityIds?.filter(Boolean) || [];
                if (entityIds.length === 0) {
                    const entitiesSnap = await getDocs(collection(db, `users/${currentUser.uid}/entities`));
                    entityIds = entitiesSnap.docs.map((docSnap) => docSnap.id).filter((id) => id !== '_init');
                }
                if (entityIds.length === 0) {
                    clearGmailBootstrap();
                    return;
                }

                const primaryEntityId = entityIds[0];
                const existingGmail = await getDoc(
                    doc(db, `users/${currentUser.uid}/entities/${primaryEntityId}/integrations/gmail`)
                );
                if (existingGmail.exists() && existingGmail.data()?.status === 'Connected') {
                    clearGmailBootstrap();
                    return;
                }

                const result = await openGmailConnectPopup({
                    userId: currentUser.uid,
                    entityId: primaryEntityId,
                    entityIds,
                    loginHint: bootstrap.email || currentUser.email,
                });

                clearGmailBootstrap();

                if (result === 'success') {
                    toast.success('Gmail conectado con tu cuenta de Google.');
                } else if (result === 'error') {
                    toast.error('No se pudo autorizar Gmail. Puedes intentarlo desde Integraciones.');
                }
            } catch (error: unknown) {
                clearGmailBootstrap();
                const message = error instanceof Error ? error.message : 'Error al conectar Gmail.';
                toast.error(message);
            }
        })();
    }, [currentUser, loading]);

    return null;
}
