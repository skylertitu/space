'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Quality Control"
            subtitle="COO Quality"
            department="coo"
            accentColor="red"
            description="Quality assurance and continuous improvement processes."
            features={['Inspection checklists', 'Defect tracking', 'Process improvement']}
        />
    );
}
