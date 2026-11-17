'use client';
import DepartmentPageShell from '@/components/DepartmentPageShell';
export default function Page() {
    return (
        <DepartmentPageShell
            title="Invoices & Billing"
            subtitle="CFO Billing"
            department="cfo"
            accentColor="emerald"
            description="Invoice generation, payment tracking, and billing automation."
            features={['Invoice templates', 'Payment tracking', 'Recurring billing']}
        />
    );
}
