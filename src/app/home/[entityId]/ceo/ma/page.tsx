'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Mergers & Acquisitions"
            subtitle="CEO M&A"
            department="ceo"
            accentColor="purple"
            description="Due diligence, deal flow, and acquisition pipeline management."
            features={['Deal pipeline', 'Due diligence', 'Valuation models']}
        />
    );
}
