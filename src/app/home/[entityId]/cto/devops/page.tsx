'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="DevOps & Infra"
            subtitle="CTO DevOps"
            department="cto"
            accentColor="orange"
            description="CI/CD pipelines, server management, and deployment automation."
            features={['Pipeline monitoring', 'Server health', 'Deploy history']}
        />
    );
}
