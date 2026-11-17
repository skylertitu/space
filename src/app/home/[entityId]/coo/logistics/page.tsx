'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Logistics Hub"
            subtitle="COO Logistics"
            department="coo"
            accentColor="orange"
            description="Shipping, delivery, and logistics optimization."
            features={['Route optimization', 'Shipment tracking', 'Carrier management']}
        />
    );
}
