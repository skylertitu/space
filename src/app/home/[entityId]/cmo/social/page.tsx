'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Social Media Manager"
            subtitle="CMO Social"
            department="cmo"
            accentColor="blue"
            description="Multi-platform social media management and scheduling."
            features={['Post scheduling', 'Engagement tracking', 'Audience insights']}
        />
    );
}
