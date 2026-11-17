import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';

// Called when a new user signs up with a referral code
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { newUserId, referralCode } = await req.json();

        if (!newUserId || !referralCode) {
            return NextResponse.json({ error: 'Missing newUserId or referralCode' }, { status: 400 });
        }

        // Find the referrer by code
        const referrerSnap = await db.collection('referrals')
            .where('code', '==', referralCode)
            .limit(1)
            .get();

        if (referrerSnap.empty) {
            return NextResponse.json({ error: 'Invalid referral code' }, { status: 404 });
        }

        const referrerDoc = referrerSnap.docs[0];
        const referrerId = referrerDoc.id;

        // Prevent self-referral
        if (referrerId === newUserId) {
            return NextResponse.json({ error: 'Cannot refer yourself' }, { status: 400 });
        }

        // Check if this user was already referred
        const existingRef = await db.collection('referral_completions')
            .where('newUserId', '==', newUserId)
            .limit(1)
            .get();

        if (!existingRef.empty) {
            return NextResponse.json({ error: 'User already referred' }, { status: 409 });
        }

        // Record the referral completion
        const tokensPerReferral = 150;

        await db.collection('referral_completions').add({
            referrerId,
            newUserId,
            referralCode,
            tokensAwarded: tokensPerReferral,
            completedAt: new Date().toISOString(),
        });

        // Update the referrer's stats
        const currentData = referrerDoc.data();
        await db.collection('referrals').doc(referrerId).update({
            referralsCompleted: (currentData.referralsCompleted || 0) + 1,
            tokensEarned: (currentData.tokensEarned || 0) + tokensPerReferral,
        });

        return NextResponse.json({
            success: true,
            message: `Referral completed! ${tokensPerReferral} tokens will be awarded to the referrer.`,
            tokensAwarded: tokensPerReferral,
        });
    } catch (error: any) {
        console.error('Referral Claim Error:', error);
        return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
    }
}
