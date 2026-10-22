"use client";

import { useAuthSession } from "@/contexts/auth-session-context";
import { Logo } from "@/components/logo";
import Link from "next/link";
import { useSidebarContext } from "../sidebar/sidebar-context";
import { MenuIcon } from "./icons";
import { ThemeToggleSwitch } from "./theme-toggle";
import { UserInfo } from "./user-info";

export function Header() {
  const { toggleSidebar, isMobile } = useSidebarContext();
  const { me } = useAuthSession();
  const homeHref = "/painel";

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stroke bg-white px-4 py-5 shadow-1 dark:border-stroke-dark dark:bg-gray-dark md:px-5 2xl:px-10">
      <button
        onClick={toggleSidebar}
        className="rounded-lg border px-1.5 py-1 dark:border-stroke-dark dark:bg-ink hover:dark:bg-[#FFFFFF1A] lg:hidden"
      >
        <MenuIcon />
        <span className="sr-only">Toggle Sidebar</span>
      </button>

      {isMobile && (
        <Link
          href={homeHref}
          className="ml-2 max-h-8 max-[430px]:hidden min-[375px]:ml-4"
        >
          <Logo compact />
        </Link>
      )}

      {/* <div className="max-xl:hidden">
        <h1 className="mb-0.5 text-heading-5 font-bold text-dark dark:text-white">
          Saas Solution
        </h1>
        <p className="font-medium">Sistema de controle financeiro</p>
      </div> */}

      <div className="flex flex-1 items-center justify-end gap-2 min-[375px]:gap-4"> 
        <ThemeToggleSwitch />


        <div className="shrink-0">
          <UserInfo />
        </div>
      </div>
    </header>
  );
}
