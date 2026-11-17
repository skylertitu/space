'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Investor Relations"
            subtitle="CEO Finance"
            department="ceo"
            accentColor="emerald"
            description="Investor communication, reporting, and stakeholder management."
            features={['Investor deck', 'Quarterly reports', 'Cap table']}
        />
    );
}
