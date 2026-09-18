import type { Metadata } from 'next';
import Link from 'next/link';
import type { RowDataPacket } from 'mysql2';

import { selectRows } from '@/lib/mysql/db';
import styles from './testemunhos.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Testemunhos | RP Instituto de Beleza',
  description: 'Opiniões de clientes da RP Instituto de Beleza publicadas com autorização.',
  robots: { index: true, follow: true },
};

type Row = RowDataPacket & {
  rating: number;
  comment: string | null;
  client_name: string | null;
  service_name: string | null;
};

export default async function Testimonials() {
  const rows = await selectRows<Row[]>(
    `SELECT r.rating,r.comment,LEFT(c.name,1) client_name,s.name service_name
       FROM clinic_appointment_reviews r
       JOIN contacts c ON c.id=r.contact_id
       JOIN clinic_appointments a ON a.id=r.appointment_id
       LEFT JOIN clinic_services s ON s.id=a.service_id
      WHERE r.published_at IS NOT NULL
        AND r.consent_to_publish=TRUE
      ORDER BY r.published_at DESC
      LIMIT 24`
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>← Voltar ao site</Link>
        <p>RP Instituto de Beleza · Testemunhos</p>
        <h1>Opiniões de quem já nos visitou.</h1>
        <span>Feedback publicado apenas com autorização dos clientes.</span>
      </header>
      {rows.length ? (
        <section className={styles.grid} aria-label="Testemunhos de clientes">
          {rows.map((review, index) => (
            <article key={`${review.client_name}-${index}`} className={styles.card}>
              <div className={styles.stars} aria-label={`${review.rating} de 5 estrelas`}>
                {'★'.repeat(Math.max(1, Math.min(5, Number(review.rating) || 5)))}
              </div>
              <blockquote>“{review.comment?.trim() || `Avaliação verificada de ${review.rating} estrelas.`}”</blockquote>
              <footer>
                <strong>{review.client_name || 'Cliente'}.</strong>
                <span>{review.service_name || 'Sessão de bem-estar'}</span>
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.empty}>
          <h2>As primeiras opiniões serão publicadas em breve.</h2>
          <p>Quando clientes autorizarem a publicação das suas avaliações, elas aparecerão aqui.</p>
          <Link href="/portal?book=1">Marcar uma sessão</Link>
        </section>
      )}
    </main>
  );
}
