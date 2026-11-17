'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="SEO & SEM"
            subtitle="CMO Search"
            department="cmo"
            accentColor="teal"
            description="Search engine optimization and paid search management."
            features={['Keyword tracking', 'SERP monitoring', 'Ad campaigns']}
        />
    );
}
