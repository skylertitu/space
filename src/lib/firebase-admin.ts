import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';
import { config as loadEnv } from 'dotenv';

// Ensure .env.local is loaded before credential resolution (dev webpack can init early).
loadEnv({ path: path.join(process.cwd(), '.env.local') });
loadEnv({ path: path.join(process.cwd(), '.env') });

function normalizePrivateKey(raw: string): string {
    let privateKey = raw.trim().replace(/^['"]|['"]$/g, '');
    while (privateKey.includes('\\n')) {
        privateKey = privateKey.replace(/\\n/g, '\n');
    }
    if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
        privateKey = privateKey
            .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
            .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    }
    return privateKey;
}
if (!admin.apps.length) {
    try {
        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
        let serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
        let serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
        const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
        
        const possiblePaths = [
            path.join(process.cwd(), 'serviceAccountKey.json'),
            path.join(__dirname, '..', '..', '..', 'serviceAccountKey.json'),
        ];
        let serviceAccountPath = possiblePaths.find(p => fs.existsSync(p));
        let initialized = false;

        // Bypasses all Vercel UI formatting issues completely
        if (serviceAccountBase64) {
            try {
                const decodedToken = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
                const parsedServiceAccount = JSON.parse(decodedToken);
                
                // Ensure project_id exactly as other methods
                if (!parsedServiceAccount.project_id) {
                    parsedServiceAccount.project_id = projectId || process.env.FIREBASE_PROJECT_ID;
                }

                admin.initializeApp({
                    credential: admin.credential.cert(parsedServiceAccount),
                    projectId
                });
                console.log(`[Firebase Admin] 🏆 SUCCESS: Initialized from BASE64 ENV (Ultra-Safe Mode).`);
                initialized = true;
            } catch (b64Err: any) {
                console.error('[Firebase Admin] ❌ Error initializing from BASE64 ENV:', b64Err.message);
            }
        }

        if (!initialized && firebaseClientEmail && firebasePrivateKey) {
            try {
                const privateKey = normalizePrivateKey(firebasePrivateKey);

                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: projectId || process.env.FIREBASE_PROJECT_ID || 'roosevelt-491004',
                        clientEmail: firebaseClientEmail.trim(),
                        privateKey,
                    }),
                    projectId: projectId || process.env.FIREBASE_PROJECT_ID,
                });
                console.log('[Firebase Admin] ✅ SUCCESS: Initialized from FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
                initialized = true;
            } catch (splitKeyErr: any) {
                console.error('[Firebase Admin] ❌ Error initializing from split ENV keys:', splitKeyErr.message);
            }
        }

        if (!initialized && serviceAccountEnv) {
            try {
                // Remove possible wrapping quotes (handles some OS/env issues)
                let cleanedEnv = serviceAccountEnv.trim();
                while ((cleanedEnv.startsWith("'") && cleanedEnv.endsWith("'")) || 
                       (cleanedEnv.startsWith('"') && cleanedEnv.endsWith('"'))) {
                    cleanedEnv = cleanedEnv.slice(1, -1);
                }
                
                let parsedServiceAccount;
                try {
                    // Strategy 1: Standard JSON parsing
                    parsedServiceAccount = JSON.parse(cleanedEnv);
                    
                    // Strategy 2: SUPER PEM CLEANER (AFTER PARSING)
                    // Vercel/CI environment variables are notorious for escape issues (\n, \\n, or literal breaks)
                    if (parsedServiceAccount.private_key && typeof parsedServiceAccount.private_key === 'string') {
                        let key = parsedServiceAccount.private_key;
                        
                        // Rule A: Remove any wrapping quotes that survived JSON.parse (rare but happens in some shells)
                        key = key.trim().replace(/^['"]|['"]$/g, '');
                        
                        // Rule B: Unescape any literal \n sequences. Use a loop to handle multiple escapes like \\n
                        while (key.includes('\\n')) {
                            key = key.replace(/\\n/g, '\n');
                        }
                        
                        // Rule C: Ensure standard PEM format (headers/footers must be on their own lines)
                        // If it's a single line, we must wrap it correctly
                        if (!key.includes('\n') && key.includes('-----BEGIN PRIVATE KEY-----')) {
                             key = key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
                                      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
                        }
                        
                        parsedServiceAccount.private_key = key;
                    }
                } catch (firstErr: any) {
                    // Fallback Strategy: If Vercel has somehow mangled the whole string (rare)
                    console.warn('[Firebase Admin] 🟡 ENV is not valid JSON, trying emergency unescape.');
                    const fixedRaw = cleanedEnv.replace(/\\n/g, '\n');
                    parsedServiceAccount = JSON.parse(fixedRaw);
                }

                // Ensure project_id is present because cert() absolutely requires it
                if (!parsedServiceAccount.project_id) {
                    parsedServiceAccount.project_id = projectId;
                }

                // Ensure project_id is present because cert() absolutely requires it
                if (!parsedServiceAccount.project_id) {
                    parsedServiceAccount.project_id = projectId || process.env.FIREBASE_PROJECT_ID;
                }

                if (!parsedServiceAccount.project_id) {
                    console.warn('[Firebase Admin] ⚠️ WARNING: No project_id found in service account object or environment. This may cause cert() to fail.');
                }

                admin.initializeApp({
                    credential: admin.credential.cert(parsedServiceAccount),
                    projectId
                });
                
                console.log(`[Firebase Admin] ✅ SUCCESS: Initialized from ENV.`);
                initialized = true;
            } catch (jsonError: any) {
                console.error('[Firebase Admin] ❌ Error initializing from ENV (Is the object malformed?):', jsonError.message);
                // Do not throw here, fallback to next strategy
            }
        }
        
        if (!initialized && serviceAccountPath) {
            try {
                const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    projectId
                });
                console.log(`[Firebase Admin] ✅ SUCCESS: Initialized from file (${serviceAccountPath}).`);
                initialized = true;
            } catch (fileErr: any) {
                console.error('[Firebase Admin] ❌ Error loading from serviceAccountKey.json:', fileErr.message);
            }
        } 
        
        if (!initialized) {
            const resolvedProject = projectId || process.env.FIREBASE_PROJECT_ID || 'roosevelt-491004';
            console.error(
                '[Firebase Admin] ❌ No service account credentials found. ' +
                    'Set FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.local ' +
                    'or FIREBASE_SERVICE_ACCOUNT_BASE64. Firestore API routes will fail.'
            );
            admin.initializeApp({ projectId: resolvedProject });
        }
    } catch (error: any) {
        console.error('[Firebase Admin] ❌ CRITICAL ERROR:', error.message);
    }
}

// Exportar instancias directas
export const db = admin.firestore();
export const auth = admin.auth();
export { admin };

