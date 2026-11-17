'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Protocol Governance"
            subtitle="Board Governance"
            department="board"
            accentColor="indigo"
            description="Decentralized governance protocols and decision-making frameworks."
            features={['Proposal management', 'Voting mechanisms', 'Protocol amendments']}
        />
    );
}
