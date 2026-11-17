'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="ESG Reporting"
            subtitle="CEO Impact"
            department="ceo"
            accentColor="teal"
            description="Environmental, social, and governance impact tracking."
            features={['Carbon footprint', 'Social impact', 'Governance score']}
        />
    );
}
