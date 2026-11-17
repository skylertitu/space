'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Product Roadmap"
            subtitle="CPO Planning"
            department="cpo"
            accentColor="blue"
            description="Strategic product roadmap and feature timeline."
            features={['Feature backlog', 'Release planning', 'Dependency mapping']}
        />
    );
}
