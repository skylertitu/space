'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Affiliate Program"
            subtitle="CMO Affiliates"
            department="cmo"
            accentColor="emerald"
            description="Affiliate partner management and commission tracking."
            features={['Partner onboarding', 'Commission rules', 'Payout management']}
        />
    );
}
