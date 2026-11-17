import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { userId, referralCode } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        // Generate a unique referral code for the user if they don't have one
        if (!referralCode) {
            const code = `RVT-${userId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

            // Store the referral code in Firestore
            await db.collection('referrals').doc(userId).set({
                code,
                userId,
                referralsCompleted: 0,
                tokensEarned: 0,
                createdAt: new Date().toISOString(),
            }, { merge: true });

            return NextResponse.json({ code, message: 'Referral code generated successfully' });
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error: any) {
        console.error('Referral Generate Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
        }

        const docSnap = await db.collection('referrals').doc(userId).get();

        if (!docSnap.exists) {
            return NextResponse.json({ code: null, referrals: [], stats: { total: 0, tokensEarned: 0 } });
        }

        const data = docSnap.data();

        // Get all referrals completed by people this user referred
        const referralsSnap = await db.collection('referral_completions')
            .where('referrerId', '==', userId)
            .orderBy('completedAt', 'desc')
            .limit(50)
            .get();

        const referrals = referralsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        return NextResponse.json({
            code: data?.code || null,
            stats: {
                total: data?.referralsCompleted || 0,
                tokensEarned: data?.tokensEarned || 0,
            },
            referrals,
        });
    } catch (error: any) {
        console.error('Referral Get Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
