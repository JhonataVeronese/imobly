import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import type { Metadata } from "next";
import { SimuladorClient } from "./_components/simulador-client";

export const metadata: Metadata = { title: "Simulador WhatsApp" };

export default function SimuladorPage() {
  return (
    <>
      <Breadcrumb pageName="Simulador WhatsApp" />
      <SimuladorClient />
    </>
  );
}
