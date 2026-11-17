'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="HRIS System"
            subtitle="CHRO Data"
            department="chro"
            accentColor="cyan"
            description="Human resources information system and employee records."
            features={['Employee directory', 'Document management', 'Leave tracking']}
        />
    );
}
