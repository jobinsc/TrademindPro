import AppSidebar from '@/components/app/AppSidebar';
import RequireAuth from '@/components/auth/RequireAuth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex min-h-screen bg-sky-soft text-sky-ink">
        <AppSidebar />
        <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-[linear-gradient(180deg,#f4f9fd_0%,#ffffff_40%)]">
          {children}
        </main>
      </div>
    </RequireAuth>
  );
}
