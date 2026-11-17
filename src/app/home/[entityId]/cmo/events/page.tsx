'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Events & PR"
            subtitle="CMO Events"
            department="cmo"
            accentColor="amber"
            description="Event planning, PR campaigns, and media relations."
            features={['Event calendar', 'Speaker management', 'PR outreach']}
        />
    );
}
