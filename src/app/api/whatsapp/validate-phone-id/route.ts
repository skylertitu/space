import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { registerWhatsAppTenantMapping } from '@/lib/whatsappTenant';
import { guardApi } from '@/lib/apiAuth';

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { phoneNumberId, userId, entityId } = await req.json();

        if (!phoneNumberId) {
            return NextResponse.json({ valid: false, message: 'Falta el Phone ID.' });
        }

        const currentEntityPath = `users/${userId}/entities/${entityId}`;
        const collectionsToCheck = ['integrations', 'whatsapp_internal', 'whatsapp-integrations'];
        const fieldsToCheck = ['phoneNumberId', 'phone_number_id', 'id', 'wabaId'];
        
        const numericId = Number(phoneNumberId);
        const stringId = String(phoneNumberId);

        for (const collName of collectionsToCheck) {
            for (const fieldName of fieldsToCheck) {
                try {
                    // Diagnostic scan
                    const snap = await db.collectionGroup(collName).where(fieldName, '==', stringId).get();
                    
                    if (!snap.empty) {
                        for (const doc of snap.docs) {
                            const existingPath = doc.ref.path;
                            // Block only if it's NOT in our current entity path
                            if (!existingPath.includes(currentEntityPath)) {
                                console.log(`[Validation] 🛡️ CONFLICT: Found ${stringId} in ${existingPath}. Blocking connection for ${currentEntityPath}`);
                                return NextResponse.json({ 
                                    valid: false, 
                                    message: `ERROR: Este número ya está en uso por otra empresa en el sistema (Detectado en: ${collName}).` 
                                }, { status: 200 });
                            }
                        }
                    }
                } catch (idxError: any) {
                    // Silence index errors to allow user to connect their own data while indices build
                    console.error(`[Validation] ⚠️ Skipping global check for ${collName}/${fieldName} due to missing index.`);
                }
            }
        }

        if (userId && entityId) {
            await registerWhatsAppTenantMapping(String(phoneNumberId), userId, entityId);
        }

        console.log(`[Validation] ✅ Phone ID ${phoneNumberId} is valid for ${currentEntityPath}`);
        return NextResponse.json({ valid: true }, { status: 200 });

    } catch (error: any) {
        console.error(`[Validation CRASH] ${error.stack || error.message}`);
        return NextResponse.json({ 
            valid: false, 
            message: `Error de servidor: ${error.message}` 
        }, { status: 200 });
    }
}
