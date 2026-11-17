'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="UX/UI Design System"
            subtitle="CPO Design"
            department="cpo"
            accentColor="pink"
            description="Component library, design tokens, and style guide."
            features={['Component library', 'Design tokens', 'Accessibility audit']}
        />
    );
}
