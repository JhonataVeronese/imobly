import { BrandMark } from "@/components/brand-mark";
import { ThemeToggleSwitch } from "@/components/Layouts/header/theme-toggle";
import { Logo } from "@/components/logo";
import { BrandPillars, HouseIcon, MegaphoneIcon, PeopleIcon } from "@/components/marketing/brand-icons";
import { WhatsAppPreview } from "@/components/marketing/whatsapp-preview";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Manual do WhatsApp",
  description: "Passo a passo para divulgar imóveis usando só o WhatsApp, com todos os comandos e regras de envio.",
};

/*
 * Manual de uso para quem opera só pelo WhatsApp. Público (sem login).
 * Os números do envio em fila são os padrões do worker (SEND_* no .env da API):
 * se o administrador mudar a configuração, atualize a seção "Envio em fila" também.
 */

const SECTIONS = [
  { id: "antes", title: "Antes de começar" },
  { id: "passo-a-passo", title: "Passo a passo" },
  { id: "comandos", title: "Comandos" },
  { id: "anuncio", title: "Como escrever o anúncio" },
  { id: "arquivos", title: "Fotos e PDF" },
  { id: "fila", title: "Envio em fila" },
  { id: "acompanhar", title: "Acompanhar resultados" },
  { id: "clientes", title: "O que o cliente recebe" },
  { id: "pausas", title: "Pausas automáticas" },
  { id: "problemas", title: "Resolvendo problemas" },
  { id: "boas-praticas", title: "Boas práticas" },
];

const COMMANDS: { cmd: string; alt?: string; when: string; does: string }[] = [
  {
    cmd: "CONFIRMAR",
    alt: "CONFIRMO",
    when: "Depois de receber o resumo do imóvel",
    does: "Coloca a campanha na fila de envio. O público é congelado neste momento e você recebe a previsão de término.",
  },
  {
    cmd: "CANCELAR",
    when: "Com um rascunho aberto (antes de confirmar)",
    does: "Descarta o rascunho. Nenhuma mensagem é enviada.",
  },
  {
    cmd: "STATUS",
    when: "A qualquer momento",
    does: "Mostra o andamento da sua última campanha: na fila, aceitas, entregues, lidas, falhas, descadastros e previsão.",
  },
  {
    cmd: "PAUSAR",
    when: "Com uma campanha em envio",
    does: "Interrompe o envio. Quem ainda não recebeu continua na fila, esperando.",
  },
  {
    cmd: "RETOMAR",
    alt: "CONTINUAR",
    when: "Com uma campanha pausada",
    does: "Continua de onde parou, sem reenviar para quem já recebeu.",
  },
  {
    cmd: "AJUDA",
    alt: "MENU · COMANDOS",
    when: "A qualquer momento",
    does: "Lista os comandos direto no WhatsApp.",
  },
];

export default function ManualPage() {
  return (
    <div className="min-h-screen bg-gray-2 text-dark-5 dark:bg-ink dark:text-dark-6">
      <header className="sticky top-0 z-30 border-b border-stroke bg-white/90 backdrop-blur dark:border-stroke-dark dark:bg-ink/90">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/" className="w-auto shrink-0">
            <Logo compact />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block">
              <ThemeToggleSwitch />
            </span>
            <Link
              href="/painel"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90"
            >
              Abrir o painel
            </Link>
          </div>
        </div>
      </header>

      {/* Abertura no estilo da peça principal da marca. */}
      <section className="imobly-hero-bg">
        <div className="mx-auto grid max-w-screen-xl grid-cols-1 items-center gap-10 px-4 py-14 md:px-6 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0 max-w-[620px]">
            <span className="rotulo text-neon">Manual de uso · WhatsApp</span>
            <h1 className="mt-4 font-display text-[32px] font-extrabold sm:text-4xl leading-[1.08] tracking-tight text-white md:text-5xl">
              Tudo pelo WhatsApp.
              <span className="block text-neon">Sem abrir o painel.</span>
            </h1>
            <p className="mt-5 text-lg text-white/75">
              Você manda o imóvel numa conversa, confere o resumo e responde <Cmd>CONFIRMAR</Cmd>. O imobly envia para os
              clientes certos, em fila e no ritmo seguro para o seu número.
            </p>
            <BrandPillars className="mt-8" />
          </div>
          <WhatsAppPreview
            className="mx-auto"
            messages={[
              { from: "me", text: "Apartamento à venda no Centro\n3 quartos, 1 suíte, 2 vagas\nR$ 450.000", time: "10:02" },
              { from: "me", text: "📷 Foto  ·  📄 Ficha.pdf", time: "10:02" },
              {
                from: "bot",
                text: "✅ Imóvel recebido!\nApartamento à venda no Centro — R$ 450.000\n👥 Público estimado: 91 contatos\n⏱ Envio em fila, previsão de 1h5min.\n\nResponda CONFIRMAR para iniciar.",
                time: "10:02",
              },
              { from: "me", text: "CONFIRMAR", time: "10:03" },
              { from: "bot", text: "🚀 Campanha na fila para 91 contatos.\nResponda STATUS para acompanhar.", time: "10:03" },
            ]}
          />
        </div>
      </section>

      <div className="mx-auto grid max-w-screen-xl grid-cols-1 gap-10 px-4 py-12 md:px-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Seções do manual" className="hidden lg:block">
          <ol className="sticky top-24 space-y-1 border-l border-stroke dark:border-stroke-dark">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm font-medium hover:border-neon hover:text-dark dark:hover:text-white"
                >
                  <span className="mr-2 text-dark-6">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0 space-y-14">
          <Section id="antes" n={1} title="Antes de começar">
            <p>
              O administrador da imobiliária faz isso <strong>uma vez</strong> no painel. Depois, o seu dia a dia é só no
              WhatsApp.
            </p>
            <Checklist
              items={[
                ["Número de envio conectado", "o WhatsApp da imobiliária conectado em Configurações → Integrações WhatsApp."],
                [
                  "Canal de entrada definido",
                  "um grupo privado (só você, o número da imobiliária e outros corretores) ou a conversa direta com o número.",
                ],
                [
                  "Seu celular cadastrado",
                  "em Configurações → Usuários, com o seu telefone. Mensagens de números não cadastrados são ignoradas.",
                ],
                [
                  "Clientes com consentimento",
                  "só recebe quem autorizou receber ofertas e não pediu para sair. Contatos sem consentimento ficam de fora automaticamente.",
                ],
              ]}
            />
            <Callout>
              Não sabe qual é o canal? Pergunte ao administrador se você deve mandar os imóveis <strong>no grupo</strong> ou{" "}
              <strong>direto na conversa</strong> com o número da imobiliária.
            </Callout>
          </Section>

          <Section id="passo-a-passo" n={2} title="Passo a passo: divulgar um imóvel">
            <ol className="space-y-4">
              <Step n={1} title="Envie o texto do anúncio">
                No grupo (ou na conversa direta), cole o texto do imóvel com tipo, valor, bairro e características. Veja{" "}
                <a href="#anuncio" className="font-semibold text-dark underline decoration-neon decoration-2 underline-offset-2 dark:text-white">
                  como escrever o anúncio
                </a>
                .
              </Step>
              <Step n={2} title="Envie as fotos e o PDF">
                Pode mandar antes ou depois do texto, em qualquer ordem. Tudo que chegar em sequência entra no mesmo imóvel.
              </Step>
              <Step n={3} title="Opcional: escolha quem recebe">
                Compartilhe os contatos dos clientes (no WhatsApp: <strong>clipe → Contato</strong>, um ou vários). Eles são
                cadastrados na hora e a campanha vai <strong>só para eles</strong>. Sem compartilhar contatos, o imobly escolhe na
                carteira quem combina com o imóvel. Ao compartilhar, você confirma que esses clientes autorizaram receber ofertas;
                quem já pediu para sair nunca recebe.
              </Step>
              <Step n={4} title="Espere o resumo (alguns segundos)">
                Quando você para de mandar mensagens, chega <strong>um único resumo</strong> com o que foi entendido: título,
                valor, características, quantidade de fotos e PDFs, o que ficou faltando, o <strong>público estimado</strong> e a{" "}
                <strong>previsão de envio</strong>.
              </Step>
              <Step n={5} title="Corrija, se precisar">
                Algo errado? Envie o texto de novo, corrigido. O rascunho é atualizado e um novo resumo chega. Para desistir,
                responda <Cmd>CANCELAR</Cmd>.
              </Step>
              <Step n={6} title="Responda CONFIRMAR">
                A campanha entra na fila de envio. A lista de clientes é fechada nesse momento: quem entrar na carteira depois
                não recebe esta campanha.
              </Step>
              <Step n={7} title="Acompanhe">
                Responda <Cmd>STATUS</Cmd> quando quiser. Precisa interromper? <Cmd>PAUSAR</Cmd> e, depois,{" "}
                <Cmd>RETOMAR</Cmd>.
              </Step>
            </ol>
            <Callout>
              O rascunho fica aberto por <strong>2 horas</strong> desde a última mensagem. Depois disso, um texto novo começa
              um imóvel novo.
            </Callout>
            <Callout>
              Quer treinar antes? No painel, abra <strong>Simulador WhatsApp</strong>: você conversa com o bot numa tela que
              imita o WhatsApp e vê, ao lado, o celular de clientes de teste recebendo a campanha. Nada é enviado de verdade.
            </Callout>
          </Section>

          <Section id="comandos" n={3} title="Todos os comandos">
            <p>
              Mande o comando <strong>sozinho</strong> na mensagem, sem outras palavras. Maiúsculas, minúsculas e acentos não
              importam (<Cmd>confirmar</Cmd> também vale). Frases como &quot;vou confirmar amanhã&quot; não disparam nada, de
              propósito.
            </p>
            <div className="overflow-x-auto rounded-xl border border-stroke bg-white dark:border-stroke-dark dark:bg-ink-3">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-stroke text-xs uppercase tracking-wider text-dark-6 dark:border-stroke-dark">
                  <tr>
                    <th className="px-4 py-3 font-bold">Comando</th>
                    <th className="px-4 py-3 font-bold">Quando usar</th>
                    <th className="px-4 py-3 font-bold">O que faz</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-stroke-dark">
                  {COMMANDS.map((c) => (
                    <tr key={c.cmd} className="align-top">
                      <td className="px-4 py-3">
                        <Cmd>{c.cmd}</Cmd>
                        {c.alt ? <span className="mt-1 block text-xs text-dark-6">ou {c.alt}</span> : null}
                      </td>
                      <td className="px-4 py-3">{c.when}</td>
                      <td className="px-4 py-3 text-dark dark:text-white/85">{c.does}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm">
              Os comandos valem para <strong>as suas</strong> campanhas: <Cmd>PAUSAR</Cmd> pausa a sua última campanha em
              envio, não a de outro corretor.
            </p>
          </Section>

          <Section id="anuncio" n={4} title="Como escrever o anúncio">
            <p>
              O imobly lê o texto e separa os dados do imóvel. Ele <strong>não inventa nada</strong>: o que não estiver
              escrito fica em branco e aparece no resumo como &quot;Não informado&quot;.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <pre className="whitespace-pre-wrap rounded-xl bg-ink p-5 font-sans text-sm leading-relaxed text-white/90">
                {`Apartamento à venda no Centro, São Paulo
3 quartos, 1 suíte, 2 vagas
85 m²
Valor: R$ 450.000
Aceita financiamento.`}
              </pre>
              <ul className="space-y-2 text-sm">
                {[
                  ["Tipo", "apartamento, casa, terreno, sala…"],
                  ["Negócio", "venda ou locação"],
                  ["Valor", "R$ 450.000 ou 450 mil"],
                  ["Localização", "bairro e cidade"],
                  ["Características", "quartos, suítes, banheiros, vagas, área em m²"],
                  ["Várias unidades", "uma linha por planta (ex.: 2 dorm · 65 m² · R$ 385.000) — o resumo mostra o “a partir de”"],
                ].map(([k, v]) => (
                  <li key={k} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-neon" />
                    <span>
                      <strong className="text-dark dark:text-white">{k}:</strong> {v}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Callout>
              Quanto mais completo o texto, mais certeiro o público: o imobly cruza tipo, bairro, valor e quartos com o
              perfil de cada cliente para decidir quem recebe.
            </Callout>
          </Section>

          <Section id="arquivos" n={5} title="Fotos e PDF">
            <div className="grid gap-4 sm:grid-cols-3">
              <Fact label="Fotos" value="JPG ou PNG" hint="até 5 MB cada" />
              <Fact label="Ficha do imóvel" value="PDF" hint="até 15 MB" />
              <Fact label="Ordem" value="Qualquer uma" hint="texto, fotos e PDF podem chegar misturados" />
            </div>
            <p>
              O cliente recebe a <strong>primeira foto com o texto como legenda</strong> e, logo depois, o{" "}
              <strong>PDF</strong>. As demais fotos ficam guardadas no cadastro do imóvel no painel.
            </p>
            <p>
              Arquivo em outro formato, corrompido ou grande demais é recusado com um aviso (&quot;⚠️ Arquivo(s)
              rejeitado(s)&quot;) e o resto do imóvel continua valendo. Mandou só fotos? O imobly avisa: &quot;Envie também o
              texto do imóvel&quot;.
            </p>
          </Section>

          <Section id="fila" n={6} title="Envio em fila: como o seu número fica protegido">
            <p>
              Disparar muitas mensagens de uma vez é o principal motivo de o WhatsApp restringir um número. Por isso{" "}
              <strong>toda campanha sai em fila</strong>, uma mensagem por vez, no ritmo de cada número:
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="Entre um cliente e outro" value="20 a 40 s" hint="intervalo com variação natural" />
              <Fact label="A cada 40 clientes" value="pausa de 10 min" hint="o número “descansa”" />
              <Fact label="Horário de envio" value="8h às 20h" hint="horário de Brasília; fora disso, espera o dia seguinte" />
              <Fact label="Por dia, por número" value="até 300" hint="o restante continua no dia seguinte" />
            </div>
            <QueueTimeline />
            <ul className="space-y-2">
              <li>
                <strong className="text-dark dark:text-white">Uma fila por número.</strong> Duas campanhas no mesmo número não
                disparam juntas: a segunda espera a vez. Números diferentes andam em paralelo.
              </li>
              <li>
                <strong className="text-dark dark:text-white">Previsão realista.</strong> O resumo e a confirmação já mostram
                quanto tempo o envio deve levar. Ex.: 100 clientes ≈ 1h10; 300 clientes ≈ 3h40.
              </li>
              <li>
                <strong className="text-dark dark:text-white">Sem envio duplicado.</strong> Se algo cair no meio do caminho, o
                envio retoma de onde parou, e quem já recebeu não recebe de novo.
              </li>
              <li>
                <strong className="text-dark dark:text-white">Respeito ao cliente.</strong> Antes de cada envio, o imobly
                confere de novo se o cliente continua autorizando. Quem pediu para sair no meio da campanha não recebe.
              </li>
            </ul>
            <Callout>
              Esses são os valores padrão. Número novo ou recém-conectado? Peça ao administrador para começar com um limite
              diário menor (50 a 100) e aumentar aos poucos.
            </Callout>
          </Section>

          <Section id="acompanhar" n={7} title="Acompanhar resultados (STATUS)">
            <p>
              Responda <Cmd>STATUS</Cmd> para ver a última campanha. O que cada número significa:
            </p>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {[
                ["Na fila", "ainda vão receber, na vez do seu número"],
                ["Aceitas", "o WhatsApp recebeu a mensagem para entregar"],
                ["Entregues", "chegou no celular do cliente"],
                ["Lidas", "o cliente abriu (só aparece se ele não desativou a confirmação de leitura)"],
                ["Falhas", "não deu para enviar, por exemplo número inexistente ou sem WhatsApp"],
                ["Desconhecidas", "o WhatsApp não confirmou a tempo. Por segurança, não reenviamos para não duplicar"],
                ["Descadastros", "clientes que responderam SAIR a esta campanha"],
                ["Previsão", "quanto falta para a fila terminar, já contando pausas e horário"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-stroke bg-white p-4 dark:border-stroke-dark dark:bg-ink-3">
                  <dt className="font-bold text-dark dark:text-white">{k}</dt>
                  <dd className="mt-1 text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="clientes" n={8} title="O que o cliente recebe">
            <p>
              Uma mensagem personalizada com o primeiro nome, a foto com a descrição do imóvel e o PDF. No fim vai sempre a
              opção de sair:
            </p>
            <pre className="whitespace-pre-wrap rounded-xl bg-ink p-5 font-sans text-sm leading-relaxed text-white/90">
              {`Olá, Maria! 🏠

Apartamento à venda no Centro
3 quartos, 1 suíte, 2 vagas. Valor: R$ 450.000.

Para não receber mais ofertas, responda SAIR.`}
            </pre>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-stroke bg-white p-5 dark:border-stroke-dark dark:bg-ink-3">
                <p className="font-bold text-dark dark:text-white">Para sair</p>
                <p className="mt-1 text-sm">
                  O cliente responde <Cmd>SAIR</Cmd>, <Cmd>PARAR</Cmd>, <Cmd>PARE</Cmd>, <Cmd>STOP</Cmd>,{" "}
                  <Cmd>DESCADASTRAR</Cmd>, <Cmd>REMOVER</Cmd> ou <Cmd>NÃO QUERO</Cmd>. Ele sai na hora, os envios pendentes para
                  ele são cancelados e ele não volta nem se for importado de novo.
                </p>
              </div>
              <div className="rounded-xl border border-stroke bg-white p-5 dark:border-stroke-dark dark:bg-ink-3">
                <p className="font-bold text-dark dark:text-white">Para voltar</p>
                <p className="mt-1 text-sm">
                  Só o próprio cliente pode pedir: ele responde <Cmd>VOLTAR</Cmd> ou <Cmd>QUERO RECEBER</Cmd>. A mensagem fica
                  guardada como prova do pedido.
                </p>
              </div>
            </div>
            <p className="text-sm">
              Outras respostas do cliente (dúvidas, &quot;quero mais informações&quot;) chegam normalmente no WhatsApp da
              imobiliária. Atenda por lá.
            </p>
          </Section>

          <Section id="pausas" n={9} title="Pausas automáticas">
            <p>Para proteger o número e a sua base, o imobly pausa a campanha sozinho quando:</p>
            <ul className="space-y-3">
              <li className="rounded-xl border-l-4 border-neon bg-white p-4 dark:bg-ink-3">
                <strong className="text-dark dark:text-white">O número desconectou ou foi restringido.</strong> Peça ao
                administrador para reconectar o WhatsApp no painel e depois responda <Cmd>RETOMAR</Cmd>.
              </li>
              <li className="rounded-xl border-l-4 border-neon bg-white p-4 dark:bg-ink-3">
                <strong className="text-dark dark:text-white">Muitas falhas</strong> (10 ou mais, e acima de 30% dos envios já
                processados). Sinal de base desatualizada: revise os contatos antes de retomar.
              </li>
            </ul>
            <p>
              Em qualquer caso, <Cmd>STATUS</Cmd> mostra que a campanha está pausada e o motivo. Quem não recebeu continua na
              fila.
            </p>
          </Section>

          <Section id="problemas" n={10} title="Resolvendo problemas">
            <div className="space-y-3">
              {[
                [
                  "Mandei o imóvel e ninguém respondeu.",
                  "Confira se você está no grupo certo (ou na conversa certa) e se o seu telefone está cadastrado como corretor. Números não cadastrados são ignorados, por segurança.",
                ],
                [
                  "“Não identifiquei um imóvel nessa mensagem.”",
                  "Faltaram dados básicos. Inclua tipo, valor e características (quartos, vagas) e envie de novo.",
                ],
                ["“Não há campanha aguardando confirmação.”", "O rascunho já foi confirmado, cancelado ou expirou (2 horas sem mensagens). Mande o imóvel de novo."],
                ["Público estimado é 0.", "Nenhum cliente com consentimento combina com o imóvel. Revise o texto (tipo, bairro, valor) ou fale com o administrador sobre a carteira."],
                ["“Limite mensal do plano excedido.”", "A imobiliária atingiu o limite de mensagens do mês. Fale com o administrador."],
                ["“Nenhuma integração de envio configurada.”", "O número de envio não está conectado. Fale com o administrador."],
                [
                  "Confirmei às 19h50 e parou.",
                  "Normal: o envio só acontece das 8h às 20h. A campanha continua sozinha às 8h do dia seguinte.",
                ],
                ["Está demorando.", "É de propósito: o ritmo protege o número. Veja a previsão com STATUS."],
              ].map(([q, a]) => (
                <details key={q} className="group rounded-xl border border-stroke bg-white p-4 dark:border-stroke-dark dark:bg-ink-3">
                  <summary className="cursor-pointer list-none font-semibold text-dark marker:hidden dark:text-white">
                    <span className="mr-2 inline-block text-neon transition group-open:rotate-90">›</span>
                    {q}
                  </summary>
                  <p className="mt-2 pl-5 text-sm">{a}</p>
                </details>
              ))}
            </div>
          </Section>

          <Section id="boas-praticas" n={11} title="Boas práticas para não bloquear o número">
            <div className="grid gap-4 md:grid-cols-2">
              <Practice ok>Enviar só para quem autorizou receber ofertas.</Practice>
              <Practice ok>Manter o &quot;responda SAIR&quot; no fim da mensagem.</Practice>
              <Practice ok>Anúncios completos e relevantes para o perfil do cliente.</Practice>
              <Practice ok>Usar a mesma conta e número com regularidade, sem picos.</Practice>
              <Practice>Importar listas compradas ou contatos que não conhecem a imobiliária.</Practice>
              <Practice>Mandar o mesmo imóvel várias vezes para os mesmos clientes.</Practice>
              <Practice>Disparar por fora (pelo celular) enquanto a campanha roda no mesmo número.</Practice>
              <Practice>Insistir com quem pediu para sair.</Practice>
            </div>
          </Section>

          <footer className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-ink p-8 text-white sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-2xl bg-neon">
                <BrandMark className="size-9" variant="solid" color="#0B0B0B" dotsColor="#FFD600" />
              </span>
              <div>
                <p className="text-lg font-extrabold">Ficou alguma dúvida?</p>
                <p className="text-white/70">
                  Mande <span className="font-bold text-neon">AJUDA</span> no WhatsApp para ver os comandos a qualquer momento.
                </p>
              </div>
            </div>
            <div className="flex gap-3 text-neon">
              <MegaphoneIcon className="size-7" />
              <HouseIcon className="size-7" />
              <PeopleIcon className="size-7" />
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-5 leading-relaxed">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-sm font-extrabold text-dark-6">{String(n).padStart(2, "0")}</span>
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-dark dark:text-white md:text-[28px]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-xl border border-stroke bg-white p-5 dark:border-stroke-dark dark:bg-ink-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-neon font-extrabold text-ink">{n}</span>
      <div>
        <p className="font-bold text-dark dark:text-white">{title}</p>
        <p className="mt-1 text-sm">{children}</p>
      </div>
    </li>
  );
}

function Cmd({ children }: { children: ReactNode }) {
  return (
    <code className="whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 font-sans text-[0.85em] font-bold tracking-wide text-neon">
      {children}
    </code>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-neon/50 bg-neon/10 p-4 text-sm text-dark dark:text-white/85">
      <BrandMark className="mt-0.5 size-5 shrink-0" color="currentColor" />
      <p>{children}</p>
    </div>
  );
}

function Checklist({ items }: { items: [string, string][] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map(([title, text]) => (
        <li key={title} className="flex gap-3 rounded-xl border border-stroke bg-white p-4 dark:border-stroke-dark dark:bg-ink-3">
          <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-neon" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm">
            <strong className="text-dark dark:text-white">{title}:</strong> {text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl bg-ink p-5 text-white">
      <p className="text-xs font-bold uppercase tracking-wider text-white/60">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-neon">{value}</p>
      <p className="mt-1 text-sm text-white/70">{hint}</p>
    </div>
  );
}

function Practice({ ok = false, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <p className="flex gap-3 rounded-xl border border-stroke bg-white p-4 text-sm dark:border-stroke-dark dark:bg-ink-3">
      <span className={`font-extrabold ${ok ? "text-green" : "text-red"}`} aria-label={ok ? "Faça" : "Evite"}>
        {ok ? "✓" : "✕"}
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Linha do tempo de um número: envios espaçados, pausa de lote, fim da janela. */
function QueueTimeline() {
  const dots = Array.from({ length: 14 }, (_, i) => i);
  return (
    <figure className="rounded-xl border border-stroke bg-white p-5 dark:border-stroke-dark dark:bg-ink-3">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        <span className="mr-2 shrink-0 text-xs font-bold text-dark dark:text-white">8h</span>
        {dots.slice(0, 6).map((i) => (
          <span key={i} className="flex shrink-0 items-center gap-1.5">
            <span className="size-3 rounded-full bg-neon" />
            <span className="h-px w-4 bg-dark-6" />
          </span>
        ))}
        <span className="shrink-0 rounded-md border border-dashed border-dark-6 px-2 py-1 text-[11px] font-semibold">pausa 10 min</span>
        {dots.slice(6, 12).map((i) => (
          <span key={i} className="flex shrink-0 items-center gap-1.5">
            <span className="h-px w-4 bg-dark-6" />
            <span className="size-3 rounded-full bg-neon" />
          </span>
        ))}
        <span className="ml-2 shrink-0 rounded-md bg-ink px-2 py-1 text-[11px] font-semibold text-white">20h · continua amanhã</span>
      </div>
      <figcaption className="mt-2 text-xs text-dark-6">
        Cada ponto é um cliente. Entre eles, 20 a 40 segundos; a cada 40, uma pausa longa; às 20h a fila espera o dia
        seguinte.
      </figcaption>
    </figure>
  );
}
