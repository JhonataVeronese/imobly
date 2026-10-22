import { TABLE_HEADER_ROW_CLASS } from "@/components/cadastros/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { WebhookEvent } from "@/types/configuracao";

/** Diagnóstico da Fase 0: payloads brutos recebidos do provedor. */
export function WebhookEventsTable({ rows }: { rows: WebhookEvent[] }) {
  return (
    <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className={TABLE_HEADER_ROW_CLASS}>
            <TableHead className="xl:pl-7.5">Recebido</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead className="xl:pr-7.5">Payload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="py-10 text-center text-dark-6">
                Nenhum webhook recebido ainda.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((e) => (
              <TableRow key={e.id} className="border-[#eee] dark:border-dark-3">
                <TableCell className="whitespace-nowrap text-body-sm text-dark dark:text-white xl:pl-7.5">{formatDateTime(e.receivedAt)}</TableCell>
                <TableCell className="text-body-sm text-dark dark:text-white">{e.eventType}</TableCell>
                <TableCell>
                  <StatusBadge status={e.processingStatus} />
                  {e.processingNote && <p className="mt-1 text-body-xs text-dark-6">{e.processingNote}</p>}
                </TableCell>
                <TableCell className="xl:pr-7.5">
                  <details>
                    <summary className="cursor-pointer text-body-sm text-primary">ver</summary>
                    <pre className="mt-2 max-h-72 max-w-[520px] overflow-auto whitespace-pre-wrap break-all rounded bg-gray-2 p-3 text-body-xs dark:bg-dark-2">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  </details>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
