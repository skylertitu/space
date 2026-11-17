'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Cybersecurity (CISO)"
            subtitle="CTO Security"
            department="cto"
            accentColor="red"
            description="Infrastructure security monitoring and threat defense."
            features={['Vulnerability scans', 'Threat detection', 'Security patches']}
        />
    );
}
