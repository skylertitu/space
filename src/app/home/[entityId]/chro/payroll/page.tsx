'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Payroll & Benefits"
            subtitle="CHRO Finance"
            department="chro"
            accentColor="amber"
            description="Employee compensation, benefits, and tax management."
            features={['Salary management', 'Benefits enrollment', 'Tax reporting']}
        />
    );
}
