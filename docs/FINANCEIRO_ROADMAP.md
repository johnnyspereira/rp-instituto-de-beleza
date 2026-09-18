# 💰 Módulo Financeiro Completo - Plano de Implementação

**Status:** 🔴 P0 CRÍTICO - Maior Gap Competitivo  
**Impacto:** +10 pontos (0/10 → 10/10)  
**Timeline:** 4-6 semanas (1-2 dev full-time)  
**Investimento:** €20-30k  
**ROI:** Aumenta ARR em 3x (€100k → €300k+)

---

## 📊 O que Implementar

### 1. Dashboard Financeiro (Visão 360°)
```
┌─────────────────────────────────────────────┐
│         Dashboard Financeiro                 │
├─────────────────────────────────────────────┤
│                                             │
│  Receita Total     │ Despesas      │ Lucro │
│  €12.500 (mês)     │ €3.200        │ €9.300
│  ↑ 15% (vs mês ant)│ ↓ 8%          │ ↑ 18% │
│                                             │
├─────────────────────────────────────────────┤
│  Métodos de Pagamento (este mês):          │
│  💳 Cartão: €8.500 (68%)                   │
│  💵 Dinheiro: €2.800 (22%)                 │
│  🏦 MB Way: €1.200 (10%)                   │
├─────────────────────────────────────────────┤
│  Serviços Mais Rentáveis:                   │
│  1. Massagem Terapêutica: €5.200           │
│  2. Limpeza de Pele: €3.800                │
│  3. Depilação: €2.100                      │
│  4. Outros: €1.400                         │
├─────────────────────────────────────────────┤
│  Gráficos:                                  │
│  [Receita vs Despesa] [Fluxo por método]   │
│  [Sazonalidade] [Ticket médio por serviço] │
└─────────────────────────────────────────────┘
```

### 2. Gestão de Caixa
- ✅ Registro de transações (entrada/saída)
- ✅ Categorias customizáveis
- ✅ Métodos de pagamento (Dinheiro, Cartão, MB Way, Stripe)
- ✅ Reconciliação com Stripe/gateway
- ✅ Filtros avançados (data, categoria, profissional)
- ✅ Relatórios PDF

### 3. Faturação Automática
- ✅ Agendamento → Fatura automática
- ✅ Envio por email (PDF)
- ✅ Resibos (cópia cliente + loja)
- ✅ Histórico de faturas
- ✅ Status (rascunho, enviada, paga)

### 4. Comissões (Para Franquias/Multiatendimento)
- ✅ % do agendamento por profissional
- ✅ Bônus por meta atingida
- ✅ Descontos por atrasos/cancelamentos
- ✅ Cálculo automático mensal
- ✅ Aprovação de gerente
- ✅ Pagamento integrado (Stripe/Transfer)

### 5. Relatórios Financeiros
- ✅ DRE (Demonstração de Resultado)
- ✅ Fluxo de Caixa
- ✅ Análise por serviço/profissional
- ✅ Segmentação por cliente
- ✅ Comparativos mensais/anuais

---

## 🏗️ Arquitetura Técnica

### Banco de Dados (Supabase PostgreSQL)

```sql
-- 1. Tabela Principal de Transações
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  -- Dados da transação
  amount DECIMAL(10, 2) NOT NULL,
  type ENUM('income', 'expense') NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Referência
  reference_type ENUM('appointment', 'invoice', 'commission', 'other'),
  reference_id UUID,
  
  -- Método de pagamento
  payment_method ENUM('cash', 'card', 'mb_way', 'multibanco', 'stripe', 'transfer') NOT NULL,
  payment_id VARCHAR(255), -- ID externo (Stripe charge_id, etc)
  
  -- Rastreamento
  status ENUM('pending', 'completed', 'failed', 'cancelled') DEFAULT 'completed',
  metadata JSONB, -- Dados adicionais
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES auth.users(id),
  FOREIGN KEY (reference_id) REFERENCES appointments(id) ON DELETE SET NULL
);

-- 2. Tabela de Faturas
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  client_id UUID,
  
  -- Dados da fatura
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  
  -- Datas
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  
  -- Status
  status ENUM('draft', 'sent', 'viewed', 'paid', 'overdue') DEFAULT 'draft',
  
  -- Integração Stripe
  stripe_invoice_id VARCHAR(255),
  
  -- Conteúdo
  items JSONB NOT NULL, -- [{service, qty, unit_price, total}]
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE SET NULL
);

-- 3. Tabela de Comissões
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  professional_id UUID NOT NULL,
  
  -- Período
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Cálculo
  base_amount DECIMAL(10, 2) NOT NULL, -- Soma dos agendamentos
  percentage DECIMAL(5, 2) NOT NULL, -- % de comissão
  commission_amount DECIMAL(10, 2) NOT NULL,
  bonus DECIMAL(10, 2) DEFAULT 0,
  deductions DECIMAL(10, 2) DEFAULT 0,
  final_amount DECIMAL(10, 2) NOT NULL,
  
  -- Status
  status ENUM('calculated', 'approved', 'paid', 'disputed') DEFAULT 'calculated',
  
  -- Pagamento
  payment_date DATE,
  payment_method VARCHAR(50),
  
  -- Auditoria
  created_by UUID,
  approved_by UUID,
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (professional_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES auth.users(id),
  FOREIGN KEY (approved_by) REFERENCES auth.users(id)
);

-- 4. Tabela de Categorias (Customizável)
CREATE TABLE transaction_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  name VARCHAR(100) NOT NULL,
  type ENUM('income', 'expense'),
  icon VARCHAR(50),
  color VARCHAR(7),
  is_default BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE(tenant_id, name)
);

-- Índices para performance
CREATE INDEX idx_transactions_tenant_date ON transactions(tenant_id, created_at DESC);
CREATE INDEX idx_transactions_category ON transactions(tenant_id, category);
CREATE INDEX idx_invoices_tenant_status ON invoices(tenant_id, status);
CREATE INDEX idx_commissions_professional_period ON commissions(professional_id, period_start);
```

---

## 🎨 Componentes React

### Estrutura de Pastas
```
src/components/
├── financeiro/
│   ├── dashboard/
│   │   ├── FinanceiroDashboard.tsx (Container principal)
│   │   ├── ResumoCards.tsx (Receita/Despesa/Lucro)
│   │   ├── GraficoReceita.tsx (Chart.js)
│   │   ├── GraficoMetodos.tsx (Pie chart)
│   │   └── GraficoServiços.tsx (Bar chart)
│   │
│   ├── caixa/
│   │   ├── CaixaPage.tsx (Container)
│   │   ├── ListaTransacoes.tsx (Tabela com filtros)
│   │   ├── FormTransacao.tsx (Adicionar/editar)
│   │   ├── ImportacaoBancaria.tsx (Upload CSV/Stripe)
│   │   └── ReconciliationModal.tsx (Reconciliação)
│   │
│   ├── faturas/
│   │   ├── FaturasPage.tsx
│   │   ├── ListaFaturas.tsx
│   │   ├── EditorFatura.tsx (Drag-drop items)
│   │   ├── VisualizadorFatura.tsx (Preview PDF)
│   │   └── EnvioEmail.tsx
│   │
│   ├── comissoes/
│   │   ├── ComissoesPage.tsx
│   │   ├── CalendarioComissoes.tsx (Timeline)
│   │   ├── CalculadoraComissoes.tsx
│   │   ├── AprovacaoComissoes.tsx
│   │   └── TabelaComissoes.tsx
│   │
│   └── relatorios/
│       ├── RelatoriosPage.tsx
│       ├── DRE.tsx
│       ├── FluxoCaixa.tsx
│       ├── AnalisePorServico.tsx
│       └── GerarPDF.tsx (jsPDF)
```

### Exemplo 1: Dashboard Financeiro
```typescript
// src/components/financeiro/dashboard/FinanceiroDashboard.tsx
import { Card, Metric, AreaChart, BarChart } from '@tremor/react';
import { useFinanceiroStats } from '@/hooks/use-financeiro-stats';

export function FinanceiroDashboard() {
  const { stats, isLoading } = useFinanceiroStats({
    period: 'month',
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Cards resumo */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-tremor-default text-tremor-content">Receita</p>
          <Metric className="text-green-600">
            €{stats.receita.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}
          </Metric>
          <p className="text-tremor-default text-tremor-content-emphasis mt-2">
            ↑ {stats.crescimento_receita}% vs mês ant.
          </p>
        </Card>

        <Card>
          <p className="text-tremor-default text-tremor-content">Despesas</p>
          <Metric className="text-red-600">
            €{stats.despesa.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}
          </Metric>
          <p className="text-tremor-default text-tremor-content-emphasis mt-2">
            ↓ {stats.crescimento_despesa}% vs mês ant.
          </p>
        </Card>

        <Card>
          <p className="text-tremor-default text-tremor-content">Lucro Líquido</p>
          <Metric className="text-blue-600">
            €{stats.lucro.toLocaleString('pt-PT', { maximumFractionDigits: 2 })}
          </Metric>
          <p className="text-tremor-default text-tremor-content-emphasis mt-2">
            Margem: {((stats.lucro / stats.receita) * 100).toFixed(1)}%
          </p>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="text-tremor-default font-semibold">Receita vs Despesa</h3>
          <AreaChart
            className="h-64 mt-4"
            data={stats.grafico_receita_despesa}
            index="data"
            categories={['Receita', 'Despesa']}
            colors={['green', 'red']}
          />
        </Card>

        <Card>
          <h3 className="text-tremor-default font-semibold">Métodos de Pagamento</h3>
          <BarChart
            className="h-64 mt-4"
            data={stats.metodos_pagamento}
            index="metodo"
            categories={['valor']}
            colors={['blue']}
          />
        </Card>
      </div>

      {/* Serviços mais rentáveis */}
      <Card>
        <h3 className="text-tremor-default font-semibold">Serviços Mais Rentáveis</h3>
        <table className="mt-4 w-full text-tremor-default">
          <thead>
            <tr className="border-b border-tremor-border">
              <th className="text-left">Serviço</th>
              <th className="text-right">Receita</th>
              <th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {stats.servicos_rentaveis.map((s) => (
              <tr key={s.id} className="border-b border-tremor-border">
                <td>{s.nome}</td>
                <td className="text-right">€{s.receita.toFixed(2)}</td>
                <td className="text-right text-tremor-content-emphasis">
                  {((s.receita / stats.receita) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

### Exemplo 2: Gestão de Caixa
```typescript
// src/components/financeiro/caixa/ListaTransacoes.tsx
import { useState } from 'react';
import { useFinanceiroTransacoes } from '@/hooks/use-financeiro-transacoes';

export function ListaTransacoes() {
  const [filters, setFilters] = useState({
    tipo: 'all', // all, income, expense
    categoria: '',
    dataInicio: new Date(new Date().setDate(1)),
    dataFim: new Date(),
  });

  const { transacoes, isLoading, totalReceita, totalDespesa } = 
    useFinanceiroTransacoes(filters);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex gap-4">
        <select
          value={filters.tipo}
          onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}
          className="px-3 py-2 border rounded"
        >
          <option value="all">Todos</option>
          <option value="income">Receitas</option>
          <option value="expense">Despesas</option>
        </select>

        <input
          type="date"
          value={filters.dataInicio.toISOString().split('T')[0]}
          onChange={(e) =>
            setFilters({ ...filters, dataInicio: new Date(e.target.value) })
          }
          className="px-3 py-2 border rounded"
        />

        <input
          type="date"
          value={filters.dataFim.toISOString().split('T')[0]}
          onChange={(e) =>
            setFilters({ ...filters, dataFim: new Date(e.target.value) })
          }
          className="px-3 py-2 border rounded"
        />
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <p className="text-sm text-green-600">Receita</p>
          <p className="text-2xl font-bold text-green-700">
            €{totalReceita.toFixed(2)}
          </p>
        </div>
        <div className="p-4 bg-red-50 rounded-lg border border-red-200">
          <p className="text-sm text-red-600">Despesa</p>
          <p className="text-2xl font-bold text-red-700">
            €{totalDespesa.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left">Data</th>
              <th className="px-4 py-2 text-left">Descrição</th>
              <th className="px-4 py-2 text-left">Categoria</th>
              <th className="px-4 py-2 text-left">Método</th>
              <th className="px-4 py-2 text-right">Valor</th>
              <th className="px-4 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {transacoes.map((tx) => (
              <tr key={tx.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-2">
                  {new Date(tx.created_at).toLocaleDateString('pt-PT')}
                </td>
                <td className="px-4 py-2">{tx.description}</td>
                <td className="px-4 py-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                    {tx.category}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {getPaymentMethodIcon(tx.payment_method)} {tx.payment_method}
                </td>
                <td
                  className={`px-4 py-2 text-right font-semibold ${
                    tx.type === 'income'
                      ? 'text-green-600'
                      : 'text-red-600'
                  }`}
                >
                  {tx.type === 'income' ? '+' : '-'}€{tx.amount.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => editarTransacao(tx.id)}
                    className="text-blue-600 hover:underline"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## 🔌 Integração Stripe

```typescript
// src/lib/stripe/webhooks.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'charge.succeeded':
      await handleChargeSucceeded(event.data.object as Stripe.Charge);
      break;

    case 'charge.failed':
      await handleChargeFailed(event.data.object as Stripe.Charge);
      break;

    case 'invoice.payment_succeeded':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }
}

async function handleChargeSucceeded(charge: Stripe.Charge) {
  // 1. Criar transação no banco de dados
  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      tenant_id: charge.metadata?.tenant_id,
      user_id: charge.metadata?.user_id,
      amount: charge.amount / 100, // Stripe usa centavos
      type: 'income',
      category: charge.metadata?.category || 'Pagamento Stripe',
      payment_method: 'stripe',
      payment_id: charge.id,
      status: 'completed',
      reference_id: charge.metadata?.appointment_id,
      metadata: charge.metadata,
    });

  if (error) throw error;

  // 2. Atualizar status do agendamento se necessário
  if (charge.metadata?.appointment_id) {
    await supabase
      .from('appointments')
      .update({ status: 'paid' })
      .eq('id', charge.metadata.appointment_id);
  }

  // 3. Enviar recibo por email
  await sendReceiptEmail({
    email: charge.billing_details?.email,
    amount: charge.amount / 100,
    id: charge.id,
  });
}
```

---

## 📈 Integração com Agendamentos

```typescript
// src/lib/api/appointments.ts
export async function createAppointmentWithPayment(
  appointmentData: CreateAppointmentDTO,
  paymentMethod: 'cash' | 'card' | 'mb_way'
) {
  // 1. Criar agendamento
  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .insert({
      tenant_id: appointmentData.tenant_id,
      client_id: appointmentData.client_id,
      professional_id: appointmentData.professional_id,
      service_id: appointmentData.service_id,
      start_time: appointmentData.start_time,
      end_time: appointmentData.end_time,
      status: 'scheduled',
    })
    .select()
    .single();

  if (apptError) throw apptError;

  // 2. Calcular valor do serviço
  const { data: service } = await supabase
    .from('services')
    .select('price')
    .eq('id', appointmentData.service_id)
    .single();

  const amount = service?.price || 0;

  // 3. Se pagamento à vista, criar transação
  if (paymentMethod === 'cash' || paymentMethod === 'mb_way') {
    await supabase.from('transactions').insert({
      tenant_id: appointmentData.tenant_id,
      user_id: appointmentData.user_id,
      amount,
      type: 'income',
      category: 'Serviço',
      payment_method: paymentMethod,
      reference_id: appointment.id,
      status: 'completed',
      reference_type: 'appointment',
    });

    // Atualizar status para paid
    await supabase
      .from('appointments')
      .update({ status: 'paid' })
      .eq('id', appointment.id);
  }

  // 4. Se cartão, criar payment intent
  if (paymentMethod === 'card') {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      metadata: {
        appointment_id: appointment.id,
        tenant_id: appointmentData.tenant_id,
        user_id: appointmentData.user_id,
        category: 'Serviço',
      },
    });

    return {
      appointment,
      clientSecret: paymentIntent.client_secret,
    };
  }

  return { appointment };
}
```

---

## 🎯 Cálculo de Comissões (Automático)

```typescript
// src/lib/financeiro/commission-calculator.ts
export async function calcularComissoesMes(
  tenantId: string,
  mes: Date
) {
  const periodoInicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const periodoFim = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);

  // 1. Buscar todos os agendamentos pagos do período
  const { data: appointments } = await supabase
    .from('appointments')
    .select('id, professional_id, service_id, status')
    .eq('tenant_id', tenantId)
    .gte('start_time', periodoInicio.toISOString())
    .lte('start_time', periodoFim.toISOString())
    .eq('status', 'paid');

  // 2. Buscar config de comissão por profissional
  const { data: professionals } = await supabase
    .from('users')
    .select('id, commission_percentage, commission_bonus_target')
    .eq('tenant_id', tenantId)
    .eq('role', 'professional');

  // 3. Agrupar por profissional
  const agendamentosPorProfissional = appointments.reduce(
    (acc, appt) => {
      if (!acc[appt.professional_id]) {
        acc[appt.professional_id] = [];
      }
      acc[appt.professional_id].push(appt);
      return acc;
    },
    {} as Record<string, any[]>
  );

  // 4. Calcular comissão para cada um
  const comissoes = await Promise.all(
    professionals!.map(async (prof) => {
      const agendamentos = agendamentosPorProfissional[prof.id] || [];

      // Buscar valores dos serviços
      const { data: services } = await supabase
        .from('services')
        .select('id, price')
        .in(
          'id',
          agendamentos.map((a) => a.service_id)
        );

      const baseAmount = agendamentos.reduce((sum, appt) => {
        const service = services?.find((s) => s.id === appt.service_id);
        return sum + (service?.price || 0);
      }, 0);

      const commissionAmount =
        (baseAmount * prof.commission_percentage) / 100;

      // Bônus por meta atingida
      let bonus = 0;
      if (baseAmount >= prof.commission_bonus_target) {
        bonus = baseAmount * 0.05; // 5% extra
      }

      return {
        professional_id: prof.id,
        period_start: periodoInicio,
        period_end: periodoFim,
        base_amount: baseAmount,
        percentage: prof.commission_percentage,
        commission_amount: commissionAmount,
        bonus,
        final_amount: commissionAmount + bonus,
        status: 'calculated',
      };
    })
  );

  // 5. Inserir no banco
  const { data: inserted, error } = await supabase
    .from('commissions')
    .insert(comissoes.map((c) => ({ ...c, tenant_id: tenantId })));

  if (error) throw error;

  return inserted;
}
```

---

## 🚀 Rotas de API

```typescript
// src/app/api/financeiro/transactions/route.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return new Response('Unauthorized', { status: 401 });

  // Buscar transações com filtros
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('tenant_id', session.user.user_metadata.tenant_id);

  if (searchParams.get('tipo')) {
    query = query.eq('type', searchParams.get('tipo'));
  }

  if (searchParams.get('categoria')) {
    query = query.eq('category', searchParams.get('categoria'));
  }

  if (searchParams.get('dataInicio')) {
    query = query.gte(
      'created_at',
      new Date(searchParams.get('dataInicio')!).toISOString()
    );
  }

  const { data, error } = await query.order('created_at', {
    ascending: false,
  });

  if (error) return new Response(JSON.stringify(error), { status: 400 });

  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const body = await request.json();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ...body,
      tenant_id: session.user.user_metadata.tenant_id,
      user_id: session.user.id,
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify(error), { status: 400 });

  return Response.json(data, { status: 201 });
}
```

---

## 🗂️ Estrutura de Pastas Sugerida

```
src/
├── components/
│   └── financeiro/
│       ├── dashboard/
│       ├── caixa/
│       ├── faturas/
│       ├── comissoes/
│       └── relatorios/
├── hooks/
│   ├── use-financeiro-stats.ts
│   ├── use-financeiro-transacoes.ts
│   ├── use-financeiro-faturas.ts
│   └── use-financeiro-comissoes.ts
├── lib/
│   ├── financeiro/
│   │   ├── commission-calculator.ts
│   │   ├── invoice-generator.ts
│   │   ├── reconciliation.ts
│   │   └── pdf-export.ts
│   └── stripe/
│       ├── webhooks.ts
│       └── payment-intents.ts
├── app/
│   ├── (dashboard)/
│   │   └── financeiro/
│   │       ├── page.tsx (Dashboard)
│   │       ├── caixa/page.tsx
│   │       ├── faturas/page.tsx
│   │       └── comissoes/page.tsx
│   └── api/
│       └── financeiro/
│           ├── transactions/route.ts
│           ├── invoices/route.ts
│           ├── commissions/route.ts
│           └── stripe/webhook/route.ts
└── types/
    └── financeiro.d.ts
```

---

## 📋 Tipo TypeScript

```typescript
// src/types/financeiro.d.ts
export interface Transaction {
  id: string;
  tenant_id: string;
  user_id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description?: string;
  reference_type?: 'appointment' | 'invoice' | 'commission' | 'other';
  reference_id?: string;
  payment_method:
    | 'cash'
    | 'card'
    | 'mb_way'
    | 'multibanco'
    | 'stripe'
    | 'transfer';
  payment_id?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  metadata?: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  client_id?: string;
  invoice_number: string;
  amount: number;
  tax: number;
  total: number;
  issue_date: Date;
  due_date: Date;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue';
  stripe_invoice_id?: string;
  items: InvoiceItem[];
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface InvoiceItem {
  service: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface Commission {
  id: string;
  tenant_id: string;
  professional_id: string;
  period_start: Date;
  period_end: Date;
  base_amount: number;
  percentage: number;
  commission_amount: number;
  bonus: number;
  deductions: number;
  final_amount: number;
  status: 'calculated' | 'approved' | 'paid' | 'disputed';
  payment_date?: Date;
  payment_method?: string;
  created_by?: string;
  approved_by?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}
```

---

## 📅 Timeline de Implementação

### Semana 1-2: Backend + Database
- [ ] Criar tabelas PostgreSQL
- [ ] Criar migrations no Supabase
- [ ] Implementar RLS policies
- [ ] Criar API routes básicas
- [ ] Testes unitários

### Semana 2-3: Integração Stripe
- [ ] Setup Stripe webhooks
- [ ] Integração payment intents
- [ ] Sincronização de transações
- [ ] Testes com modo teste Stripe

### Semana 3-4: Frontend Dashboard
- [ ] Dashboard principal
- [ ] Cards resumo
- [ ] Gráficos (Tremor)
- [ ] Filtros avançados

### Semana 4-5: Gestão de Caixa + Faturas
- [ ] CRUD Transações
- [ ] Importação CSV
- [ ] Generator de faturas
- [ ] Email automático

### Semana 5-6: Comissões + Relatórios
- [ ] Calculator de comissões
- [ ] Aprovação de comissões
- [ ] DRE e Fluxo de Caixa
- [ ] PDF export

---

## 💡 Impacto Esperado

| Métrica | Antes | Depois | Growth |
|---|---|---|---|
| Score Financeiro | 0/10 | 10/10 | +10 |
| TAM (Clientes) | 2,000 | 5,000 (franquias) | +150% |
| Preço médio | €100/mês | €300/mês | +200% |
| ARR | €120k | €300k+ | +150% |
| Churn | 15% | 5% | -67% |
| Tempo Admin | 20h/semana | 5h/semana | -75% |

---

## 🎯 Próximos Passos

1. **Hoje**: Validar com usuário clínica (você!)
2. **Dia 1**: Criar migrations no Supabase
3. **Dia 2-3**: Setup Stripe webhook
4. **Dia 4-5**: Implementar Dashboard
5. **Dia 6+**: Integração com agendamentos

**Quer que eu comece a implementação agora?**
