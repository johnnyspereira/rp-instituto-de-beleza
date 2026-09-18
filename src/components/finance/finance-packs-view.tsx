import { Plus, PackageCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BenefitLogList } from '@/components/finance/finance-benefit-log-list';
import { Empty, PackQuantity } from '@/components/finance/finance-ui';
import { money } from '@/components/finance/finance-utils';
import type { FinanceBenefitLog, FinanceClientPack, FinancePackCatalog } from '@/types';
export function PacksView({
  packs,
  clientPacks,
  logs,
  currency,
  canConfigure,
  onCreate,
}: {
  packs: FinancePackCatalog[];
  clientPacks: FinanceClientPack[];
  logs: FinanceBenefitLog[];
  currency: string;
  canConfigure: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canConfigure && (
          <Button onClick={onCreate}>
            <Plus /> Criar pack
          </Button>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Catálogo de packs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {packs.length ? (
              packs.map((pack) => (
                <div
                  key={pack.id}
                  className="border-border rounded-md border p-3"
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-medium">{pack.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {pack.items
                          ?.map(
                            (item) =>
                              `${item.sessions}× ${item.service?.name ?? 'Serviço'}`
                          )
                          .join(' · ')}
                      </p>
                    </div>
                    <strong>
                      {money(Number(pack.price), pack.currency || currency)}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                icon={PackageCheck}
                text="Crie packs de sessões para vender no POS."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Packs dos clientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {clientPacks.length ? (
              clientPacks.map((item) => {
                const purchased = (item.balances ?? []).reduce(
                  (sum, balance) => sum + Number(balance.total_sessions),
                  0
                );
                const available = (item.balances ?? []).reduce(
                  (sum, balance) => sum + Number(balance.remaining_sessions),
                  0
                );
                const used = purchased - available;
                return (
                  <div
                    key={item.id}
                    className="border-border rounded-md border p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {item.contact?.name || item.contact?.phone}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {item.pack?.name} · expira{' '}
                          {item.expires_at
                            ? new Date(item.expires_at).toLocaleDateString(
                                'pt-PT'
                              )
                            : 'sem validade'}
                        </p>
                        <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                          {item.code ?? 'Código pendente'} · PIN{' '}
                          {item.pin_code ?? 'pendente'}
                        </p>
                      </div>
                      <Badge variant="secondary">{item.status}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-md border text-center">
                      <PackQuantity label="Compradas" value={purchased} />
                      <PackQuantity label="Utilizadas" value={used} />
                      <PackQuantity label="Disponíveis" value={available} />
                    </div>
                    {(item.balances ?? []).length ? (
                      <div className="mt-2 space-y-1">
                        {item.balances?.map((balance) => (
                          <div
                            key={balance.id}
                            className="text-muted-foreground flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="truncate">
                              {balance.service?.name ?? 'Serviço'}
                            </span>
                            <span className="shrink-0 font-medium">
                              {balance.remaining_sessions}/
                              {balance.total_sessions} disponíveis
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <BenefitLogList
                      logs={logs.filter(
                        (log) => log.client_pack_id === item.id
                      )}
                      sourceHref={
                        item.sale_id
                          ? `/finance?tab=sales#sale-${item.sale_id}`
                          : undefined
                      }
                    />
                  </div>
                );
              })
            ) : (
              <p className="text-muted-foreground text-sm">
                Nenhum pack vendido.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
