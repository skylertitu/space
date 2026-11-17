'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Public Relations"
            subtitle="CEO Communications"
            department="ceo"
            accentColor="cyan"
            description="Media management, press releases, and public perception."
            features={['Press releases', 'Media monitoring', 'Crisis comms']}
        />
    );
}
