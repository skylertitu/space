'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Legal Contracts"
            subtitle="CLO Legal"
            department="clo"
            accentColor="indigo"
            description="Contract lifecycle management and template library."
            features={['Contract templates', 'Approval workflows', 'Expiry alerts']}
        />
    );
}
