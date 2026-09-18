import { randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { transaction } from '@/lib/mysql/db';

type VoucherSaleItem = RowDataPacket & {
  id: string;
  quantity: number;
  unit_price: number;
  metadata: string | Record<string, unknown> | null;
};

type ExistingVoucher = RowDataPacket & {
  service_id: string | null;
  voucher_type: string;
};

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = (await request.json()) as { saleId?: string };
    const saleId = body.saleId?.trim();
    if (!saleId) {
      return NextResponse.json({ error: 'Venda inv\u00e1lida.' }, { status: 400 });
    }

    const result = await transaction(async (connection) => {
      const [sales] = await connection.execute<
        (RowDataPacket & {
          contact_id: string | null;
          status: string;
          currency: string;
        })[]
      >(
        'SELECT contact_id,status,currency FROM finance_sales WHERE id=? AND account_id=? FOR UPDATE',
        [saleId, ctx.accountId]
      );
      const sale = sales[0];
      if (!sale) throw new Error('Venda n\u00e3o encontrada.');
      if (['voided', 'refunded'].includes(sale.status)) {
        throw new Error(
          'N\u00e3o \u00e9 poss\u00edvel corrigir uma venda anulada ou reembolsada.'
        );
      }

      const [items] = await connection.execute<VoucherSaleItem[]>(
        "SELECT id,quantity,unit_price,metadata FROM finance_sale_items WHERE sale_id=? AND account_id=? AND item_type='voucher' FOR UPDATE",
        [saleId, ctx.accountId]
      );
      if (!items.length) throw new Error('Esta venda n\u00e3o possui vouchers.');

      const [existing] = await connection.execute<ExistingVoucher[]>(
        "SELECT service_id,voucher_type FROM finance_vouchers WHERE issued_sale_id=? AND account_id=? AND status<>'cancelled' FOR UPDATE",
        [saleId, ctx.accountId]
      );
      const existingBefore = existing.length;
      let created = 0;
      const expectedByVoucherKind = new Map<string, number>();

      for (const item of items) {
        const metadata = parseVoucherMetadata(item.metadata);

        const voucherType = String(metadata.voucher_type ?? 'gift_card');
        const serviceId =
          typeof metadata.service_id === 'string' ? metadata.service_id : null;
        const voucherKind = `${voucherType}:${serviceId ?? ''}`;
        const expectedForThisKind =
          (expectedByVoucherKind.get(voucherKind) ?? 0) +
          Math.ceil(Number(item.quantity));
        expectedByVoucherKind.set(voucherKind, expectedForThisKind);
        const issuedForThisItem = existing.filter(
          (voucher) =>
            voucher.voucher_type === voucherType &&
            (voucher.service_id ?? null) === serviceId
        ).length;
        const missing = Math.max(
          0,
          expectedForThisKind - issuedForThisItem
        );

        for (let index = 0; index < missing; index += 1) {
          const validity =
            metadata.validity_days == null
              ? null
              : Number(metadata.validity_days);
          const faceValue = Number(metadata.face_value ?? item.unit_price);
          const remainingUses =
            metadata.remaining_uses == null
              ? voucherType === 'service'
                ? 1
                : null
              : Number(metadata.remaining_uses);
          const voucherId = randomUUID();

          await connection.execute(
            `INSERT INTO finance_vouchers(id,account_id,issued_sale_id,owner_contact_id,service_id,code,pin_code,voucher_type,remaining_uses,initial_balance,current_balance,currency,status,recipient_name,message,expires_at)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,IF(? IS NULL,NULL,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? DAY)))`,
            [
              voucherId,
              ctx.accountId,
              saleId,
              sale.contact_id,
              serviceId,
              randomBytes(5).toString('hex').toUpperCase(),
              String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'),
              voucherType,
              remainingUses,
              faceValue,
              faceValue,
              sale.currency,
              sale.status === 'paid' ? 'active' : 'pending',
              typeof metadata.recipient_name === 'string'
                ? metadata.recipient_name
                : null,
              typeof metadata.message === 'string' ? metadata.message : null,
              validity,
              validity,
            ]
          );
          await connection.execute(
            `INSERT INTO finance_benefit_logs(id,account_id,voucher_id,action,performed_by_user_id,notes,metadata)
             VALUES(?,?,?,?,?,?,?)`,
            [
              randomUUID(),
              ctx.accountId,
              voucherId,
              'adjusted',
              ctx.userId,
              'Voucher criado pela corre\u00e7\u00e3o de quantidade da venda.',
              JSON.stringify({
                sale_id: saleId,
                sale_item_id: item.id,
                correction: 'missing_voucher_quantity',
              }),
            ]
          );
          existing.push({
            service_id: serviceId,
            voucher_type: voucherType,
          } as ExistingVoucher);
          created += 1;
        }
      }

      return {
        created,
        expected: items.reduce(
          (sum, item) => sum + Math.ceil(Number(item.quantity)),
          0
        ),
        existing: existingBefore,
      };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof VoucherReconciliationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error);
  }
}

class VoucherReconciliationError extends Error {}

function parseVoucherMetadata(
  value: VoucherSaleItem['metadata']
): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') {
    throw new VoucherReconciliationError(
      'Os dados do voucher nesta venda est\u00e3o inv\u00e1lidos. Abra a venda e confirme o item antes de tentar novamente.'
    );
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The controlled error below is safe to show to the finance operator.
  }
  throw new VoucherReconciliationError(
    'Os dados do voucher nesta venda est\u00e3o inv\u00e1lidos. Abra a venda e confirme o item antes de tentar novamente.'
  );
}
