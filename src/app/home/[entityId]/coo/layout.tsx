'use client';

export default function COOLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-black min-h-screen font-sans relative">
            <main className="w-full">
                {children}
            </main>
        </div>
    );
}
