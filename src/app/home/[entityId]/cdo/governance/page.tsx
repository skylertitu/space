'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Data Governance"
            subtitle="CDO Governance"
            department="cdo"
            accentColor="emerald"
            description="Data quality, lineage, and governance framework."
            features={['Data catalog', 'Quality rules', 'Lineage tracking']}
        />
    );
}
