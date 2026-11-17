'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Supply Chain"
            subtitle="COO Supply"
            department="coo"
            accentColor="emerald"
            description="Supply chain visibility and vendor management."
            features={['Vendor registry', 'Order tracking', 'Inventory levels']}
        />
    );
}
