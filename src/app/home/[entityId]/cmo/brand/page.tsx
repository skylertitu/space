'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Brand Identity"
            subtitle="CMO Brand"
            department="cmo"
            accentColor="pink"
            description="Brand guidelines, asset management, and consistency enforcement."
            features={['Brand guidelines', 'Logo library', 'Color system']}
        />
    );
}
