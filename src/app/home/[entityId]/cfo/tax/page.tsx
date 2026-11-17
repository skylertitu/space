'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Tax Vault"
            subtitle="CFO Tax"
            department="cfo"
            accentColor="red"
            description="Tax compliance, filing management, and document storage."
            features={['Tax calendar', 'Filing tracker', 'Document vault']}
        />
    );
}
