"use client";

import { FormFeedback, SECONDARY_BUTTON_CLASS } from "@/components/cadastros/form-feedback";
import { useState } from "react";

/** A URL contém o token secreto do webhook e só é exibida uma vez. */
export function WebhookUrlNotice({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <FormFeedback variant="success" className="mb-6 space-y-3">
      <p className="font-medium">Guarde esta URL — ela não será exibida novamente.</p>
      <code className="block break-all rounded bg-white/70 px-3 py-2 text-body-xs text-dark dark:bg-dark-2 dark:text-white">{url}</code>
      <p className="text-body-xs">
        Configure-a nos webhooks &quot;Ao receber&quot; e &quot;Status da mensagem&quot; da instância. A Z-API exige HTTPS.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          className={SECONDARY_BUTTON_CLASS}
          onClick={() => void navigator.clipboard.writeText(url).then(() => setCopied(true))}
        >
          {copied ? "Copiada" : "Copiar URL"}
        </button>
        <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={onClose}>
          Fechar
        </button>
      </div>
    </FormFeedback>
  );
}
