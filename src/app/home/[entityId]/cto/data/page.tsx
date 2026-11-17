'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Data Warehouse"
            subtitle="CTO Data"
            department="cto"
            accentColor="purple"
            description="Centralized data storage and query optimization."
            features={['Schema management', 'Query builder', 'Data exports']}
        />
    );
}
