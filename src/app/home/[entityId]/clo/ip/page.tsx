'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="IP & Patents"
            subtitle="CLO IP"
            department="clo"
            accentColor="purple"
            description="Intellectual property portfolio and patent management."
            features={['Patent filings', 'Trademark registry', 'IP valuation']}
        />
    );
}
