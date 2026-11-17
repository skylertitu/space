'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Loyalty Programs"
            subtitle="CMO Loyalty"
            department="cmo"
            accentColor="rose"
            description="Customer loyalty program design and reward management."
            features={['Points system', 'Tier management', 'Reward catalog']}
        />
    );
}
