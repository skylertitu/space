'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Procurement"
            subtitle="COO Procurement"
            department="coo"
            accentColor="purple"
            description="Purchase order management and vendor negotiations."
            features={['Purchase orders', 'Vendor scoring', 'Contract terms']}
        />
    );
}
