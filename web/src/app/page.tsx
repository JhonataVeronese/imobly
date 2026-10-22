import Signin from "@/components/Auth/Signin";
import { Logo } from "@/components/logo";
import { BookIcon, BrandPillars } from "@/components/marketing/brand-icons";
import { WhatsAppPreview } from "@/components/marketing/whatsapp-preview";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-2 dark:bg-ink">
      <div className="mx-auto flex min-h-screen max-w-screen-xl items-center justify-center p-4 md:p-6">
        <div className="w-full overflow-hidden rounded-2xl bg-white shadow-1 dark:border dark:border-white/10 dark:bg-ink-3 dark:shadow-card">
          <div className="flex flex-wrap items-stretch">
            <div className="w-full xl:w-[42%]">
              <div className="w-full p-4 sm:p-12.5 xl:p-15">
                <div className="mb-10">
                  <Logo />
                </div>
                <span className="rotulo text-dark-5 dark:text-neon">Acesse sua conta</span>
                <h1 className="mb-8 mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-dark dark:text-white">
                  Bem-vindo de volta
                </h1>
                <Signin />

                <Link
                  href="/manual"
                  className="mt-8 flex items-center gap-3 rounded-xl border border-stroke p-4 transition hover:border-neon dark:border-stroke-dark"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-neon text-ink">
                    <BookIcon className="size-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-dark dark:text-white">Usa só pelo WhatsApp?</span>
                    <span className="block text-sm text-dark-5 dark:text-dark-6">Veja o manual com o passo a passo e todos os comandos.</span>
                  </span>
                </Link>
              </div>
            </div>

            {/* Peça principal da marca: preto com faixa amarela, chamada e conversa no celular. */}
            <div className="imobly-hero-bg relative hidden w-full items-center gap-6 overflow-hidden p-10 xl:flex xl:w-[58%]">
              <div className="relative z-1 min-w-0 flex-1">
                <p className="font-display text-[34px] font-extrabold leading-[1.08] tracking-tight text-white">
                  Seu próximo imóvel.
                  <span className="block text-neon">Na conversa certa.</span>
                </p>
                <p className="mt-5 text-white/75">
                  Automatize a divulgação de imóveis e conecte suas oportunidades aos clientes certos.
                </p>
                <BrandPillars compact className="mt-8" />
              </div>
              <WhatsAppPreview className="relative z-1 max-w-[270px] shrink-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
