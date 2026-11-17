'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="API Gateway"
            subtitle="CTO APIs"
            department="cto"
            accentColor="teal"
            description="API management, rate limiting, and developer portal."
            features={['Endpoint registry', 'Rate limiting', 'API analytics']}
        />
    );
}
