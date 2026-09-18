/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  MapPin,
  Menu,
  Phone,
  Quote,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { PublicLeadForm } from '@/components/website/public-lead-form';
import { serviceSlug } from '@/lib/public-site/service-slug';
import type { getPublicBusinessSite } from '@/lib/public-site/server';
import styles from './rp-public-site.module.css';

type Site = NonNullable<Awaited<ReturnType<typeof getPublicBusinessSite>>>;

const fallbackHero = '/site-presets/wellness/hero-01.webp';

export function RpPublicSite({ site }: { site: Site }) {
  const { account, settings, services, team, portal } = site;
  const bookingHref =
    settings.show_booking && portal?.booking_enabled ? '/portal?book=1' : '#contacto';
  const visibleServices = services.filter((service) => !service.coming_soon);
  const formatPrice = new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: account.default_currency || 'EUR',
    maximumFractionDigits: 0,
  });

  return (
    <div
      className={styles.site}
      data-site-theme={settings.site_theme}
      style={{
        '--brand': settings.primary_color || '#9d7144',
        '--accent': settings.accent_color || '#1c241f',
      } as React.CSSProperties}
    >
      <header className={styles.header}>
        <Link href="/" className={styles.logo} aria-label={`${account.name}, página principal`}>
          {account.logo_url ? (
            <img src={account.logo_url} alt="" />
          ) : (
            <span>JP</span>
          )}
          <b>{account.name}</b>
        </Link>
        <nav className={styles.nav} aria-label="Navegação principal">
          <a href="#rituais">Rituais</a>
          <a href="#casa">A casa</a>
          <a href="#profissionais">Profissionais</a>
          <a href="#contacto">Contacto</a>
        </nav>
        <div className={styles.headerActions}>
          <Link href="/portal" className={styles.clientArea}>Área do cliente</Link>
          <Link href={bookingHref} className={styles.headerCta}>Marcar <ArrowUpRight /></Link>
          <Menu className={styles.menu} aria-hidden="true" />
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroImage}>
            <img src={settings.hero_image_url || fallbackHero} alt="Espaço de tratamento RP Instituto de Beleza" />
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}><Sparkles /> {settings.hero_badge || 'Tempo para si'}</p>
            <h1>{settings.hero_title || 'Volte a sentir-se bem no seu corpo.'}</h1>
            <p className={styles.heroText}>
              {settings.hero_subtitle || 'Tratamentos pensados para abrandar, respirar e recuperar o seu equilíbrio.'}
            </p>
            <div className={styles.heroButtons}>
              <Link href={bookingHref} className={styles.primaryButton}>Marcar a minha sessão <ArrowUpRight /></Link>
              <a href="#rituais" className={styles.textButton}>Descobrir rituais <ArrowDownRight /></a>
            </div>
            <dl className={styles.heroFacts}>
              <div><dt>Atendimento</dt><dd>com presença</dd></div>
              <div><dt>Rituais</dt><dd>personalizados</dd></div>
              <div><dt>Ambiente</dt><dd>sereno e privado</dd></div>
            </dl>
          </div>
        </section>

        <section className={styles.statement}>
          <span>RP Instituto de Beleza</span>
          <p>O cuidado não deve ser mais uma tarefa. Deve ser o lugar onde volta a si.</p>
          <a href="#casa" aria-label="Conhecer a nossa casa"><ArrowDownRight /></a>
        </section>

        {settings.show_services && visibleServices.length > 0 && (
          <section id="rituais" className={styles.rituals}>
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>Rituais</p>
              <h2>Escolha o que o seu momento pede.</h2>
              <p>Conheça cada experiência, o seu ritmo e o cuidado que recebe em cada sessão.</p>
            </div>
            <div className={styles.serviceList}>
              {visibleServices.slice(0, 8).map((service, index) => (
                <article key={service.id} className={styles.serviceItem}>
                  <span className={styles.serviceIndex}>{String(index + 1).padStart(2, '0')}</span>
                  <div className={styles.serviceMain}>
                    <h3>{service.name}</h3>
                    <p>{service.public_presentation || service.description || 'Uma experiência de bem-estar preparada para si.'}</p>
                  </div>
                  <div className={styles.serviceMeta}>
                    <span><Clock3 /> {service.duration_minutes} min</span>
                    <b>{Number(service.price) > 0 ? formatPrice.format(Number(service.price)) : 'Sob consulta'}</b>
                  </div>
                  <Link href={`/servicos/${serviceSlug(service.name)}`} className={styles.serviceLink} aria-label={`Ver ${service.name}`}><ChevronRight /></Link>
                </article>
              ))}
            </div>
          </section>
        )}

        <section id="casa" className={styles.about}>
          <div className={styles.aboutImage}>
            <img src={settings.hero_image_url || fallbackHero} alt="Detalhe do espaço RP Instituto de Beleza" />
          </div>
          <div className={styles.aboutCopy}>
            <p className={styles.eyebrow}>A nossa casa</p>
            <h2>{settings.about_title || 'Um espaço feito para abrandar.'}</h2>
            <p>{settings.about_text || 'Criámos um lugar calmo, profissional e acolhedor, onde cada sessão é adaptada ao seu conforto.'}</p>
            {settings.history_text && <p className={styles.history}>{settings.history_text}</p>}
            <Link href={bookingHref} className={styles.underlinedLink}>Encontrar o seu momento <ArrowUpRight /></Link>
          </div>
        </section>

        {settings.show_team && team.length > 0 && (
          <section id="profissionais" className={styles.team}>
            <div className={styles.teamHeading}>
              <p className={styles.eyebrow}>Em boas mãos</p>
              <h2>Pessoas que cuidam de pessoas.</h2>
            </div>
            <div className={styles.teamGrid}>
              {team.slice(0, 4).map((person) => (
                <Link key={person.id} href={`/profissionais/${encodeURIComponent(person.professional_public_slug || person.id)}`} className={styles.person}>
                  <div className={styles.personImage}>
                    {person.avatar_url ? <img src={person.avatar_url} alt="" /> : <UsersRound />}
                  </div>
                  <div><h3>{person.full_name}</h3><p>{person.professional_title || 'Profissional de bem-estar'}</p></div>
                  <ArrowUpRight />
                </Link>
              ))}
            </div>
          </section>
        )}

        {settings.show_testimonials && settings.testimonials.length > 0 && (
          <section className={styles.testimonials}>
            <Quote />
            <div>
              {settings.testimonials.slice(0, 3).map((item, index) => (
                <figure key={`${item.name}-${index}`} className={index === 0 ? styles.visibleQuote : styles.otherQuote}>
                  <blockquote>“{item.quote}”</blockquote>
                  <figcaption>{item.name}{item.role ? ` · ${item.role}` : ''}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <section id="contacto" className={styles.contact}>
          <div className={styles.contactTitle}>
            <p className={styles.eyebrow}>Vamos conversar</p>
            <h2>Um espaço na agenda para si.</h2>
            <Link href={bookingHref} className={styles.primaryButton}>Marcar agora <CalendarDays /></Link>
            <div className={styles.contactDetails}>
              {settings.contact_phone && <span><Phone /> {settings.contact_phone}</span>}
              {settings.address && <span><MapPin /> {settings.address}</span>}
            </div>
          </div>
          <PublicLeadForm slug={settings.slug} primaryColor={settings.primary_color} />
        </section>
      </main>

      <footer className={styles.footer}>
        <b>{account.name}</b>
        <span>© {new Date().getFullYear()} — cuidado, presença e bem-estar.</span>
        <Link href="/portal">Portal do cliente</Link>
      </footer>
    </div>
  );
}
