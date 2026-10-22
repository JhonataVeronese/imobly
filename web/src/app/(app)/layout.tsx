import { AuthSessionProvider } from "@/contexts/auth-session-context";
import { Header } from "@/components/Layouts/header";
import { Sidebar } from "@/components/Layouts/sidebar";
import type { PropsWithChildren } from "react";

export default function AppShellLayout({ children }: PropsWithChildren) {
  return (
    <AuthSessionProvider>
      <div className="flex min-h-screen">
        <Sidebar />

        <div className="min-w-0 flex-1 bg-gray-2 dark:bg-ink">
          <Header />

          <main className="mx-auto min-w-0 w-full max-w-screen-2xl overflow-hidden p-4 md:p-6 2xl:p-10">
            {children}
          </main>
        </div>
      </div>
    </AuthSessionProvider>
  );
}
