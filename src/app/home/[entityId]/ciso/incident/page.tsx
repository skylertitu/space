'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Incident Response"
            subtitle="CISO Incidents"
            department="ciso"
            accentColor="orange"
            description="Security incident detection, response, and post-mortem."
            features={['Incident timeline', 'Response playbooks', 'Post-mortems']}
        />
    );
}
