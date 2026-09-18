/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  Eye,
  GraduationCap,
  MapPin,
  Menu,
  Phone,
  Quote,
  Sparkles,
  Star,
  UsersRound,
  WandSparkles,
  Zap,
} from 'lucide-react';
import { PublicLeadForm } from '@/components/website/public-lead-form';
import { serviceSlug } from '@/lib/public-site/service-slug';
import type { getPublicBusinessSite } from '@/lib/public-site/server';
import styles from './rp-public-site.module.css';
import { RpPriceList } from './rp-price-list';

type Site = NonNullable<Awaited<ReturnType<typeof getPublicBusinessSite>>>;

const fallbackHero = '/rp/hero-beauty-studio-v1.webp';
const instagramUrl = 'https://www.instagram.com/rpinstitutodebeleza/';
const mapsUrl = 'https://www.google.com/maps/place/RP+Instituto+de+beleza/@38.5533876,-9.0543043,18z';

const rpServices = [
  ['Limpeza de pele', 'Cuidado facial personalizado, com avaliação da pele e atenção às suas necessidades.'],
  ['Depilação a laser díodo', 'Depilação por zonas, com avaliação prévia e orientação sobre os cuidados antes e depois da sessão.'],
  ['Gessoterapia', 'Cuidado estético corporal adaptado às zonas e aos objetivos definidos na avaliação.'],
  ['JetBronze', 'Bronzeamento a jato para valorizar o tom da pele, com orientação para preparar e manter o resultado.'],
  ['Unhas de gel', 'Construção e manutenção de unhas, com escolha de formato, cor e acabamento ao seu gosto.'],
  ['Unhas de acrílico', 'Modelagem de unhas em acrílico, com atenção ao formato e à expressão do seu estilo.'],
  ['Gelinho', 'Cor e acabamento em verniz gel para uma manicure cuidada e personalizada.'],
  ['Lifting de pestanas com botox', 'Realce da curvatura das pestanas naturais com cuidado cosmético. Consulte os produtos utilizados na avaliação.'],
  ['Extensão de pestanas 3D', 'Valorização do olhar com extensões e escolha de efeito, seguida de orientação sobre manutenção.'],
  ['Threading', 'Depilação com linha para um acabamento preciso, com avaliação da zona e sensibilidade da pele.'],
  ['Formações/workshops', 'Aprendizagem prática em técnicas de beleza. Consulte temas, datas e oportunidades de participação como modelo.'],
] as const;

const beautyUniverses = [
  { icon: WandSparkles, number: '01', title: 'Unhas com identidade', description: 'Gel, acrílico, gelinho e nail art pensados ao detalhe para um resultado elegante e duradouro.', tags: ['Gel & acrílico', 'Gelinho', 'Nail art'] },
  { icon: Eye, number: '02', title: 'Olhar em destaque', description: 'Design de sobrancelhas, threading, lifting e extensão de pestanas para realçar a sua expressão.', tags: ['Threading', 'Lifting', 'Extensões'] },
  { icon: Zap, number: '03', title: 'Tecnologia estética', description: 'Soluções de estética e laser díodo com avaliação personalizada e acompanhamento próximo.', tags: ['Laser díodo', 'Gessoterapia', 'JetBronze'] },
  { icon: GraduationCap, number: '04', title: 'Formação profissional', description: 'Modelos práticos e formação para quem quer aperfeiçoar técnica, confiança e resultados.', tags: ['Formações', 'Modelos', 'Prática'] },
] as const;

export function RpPublicSite({ site }: { site: Site }) {
  const { account, settings, services, team, portal } = site;
  const bookingHref =
    settings.show_booking && portal?.booking_enabled ? '/portal?book=1' : '#contacto';
  const visibleServices = rpServices.map(([name, description]) => {
    const configured = services.find((service) =>
      !service.coming_soon && serviceSlug(service.name) === serviceSlug(name)
    );
    return {
      id: configured?.id || serviceSlug(name),
      name,
      description: configured?.public_presentation || configured?.description || description,
      duration_minutes: configured?.duration_minutes,
      price: configured?.price,
      configured: Boolean(configured),
    };
  });
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
            <span>RP</span>
          )}
          <b>{account.name}</b>
        </Link>
        <nav className={styles.nav} aria-label="Navegação principal">
          <a href="#especialidades">Especialidades</a>
          <a href="#servicos">Serviços</a>
          <a href="#academia">Formação</a>
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
            <p className={styles.kicker}><Sparkles /> {settings.hero_badge || 'A sua beleza, com técnica e intenção'}</p>
            <h1>{settings.hero_title || 'Realçamos aquilo que já é seu.'}</h1>
            <p className={styles.heroText}>
              {settings.hero_subtitle || 'Unhas, pestanas, sobrancelhas e estética avançada num espaço onde cada detalhe é pensado para si.'}
            </p>
            <div className={styles.heroButtons}>
              <Link href={bookingHref} className={styles.primaryButton}>Quero marcar <ArrowUpRight /></Link>
              <a href="#especialidades" className={styles.textButton}>Explorar tratamentos <ArrowDownRight /></a>
            </div>
            <dl className={styles.heroFacts}>
              <div><dt>Atendimento</dt><dd>personalizado</dd></div>
              <div><dt>Técnica</dt><dd>em evolução</dd></div>
              <div><dt>Localização</dt><dd>Quinta do Conde</dd></div>
            </dl>
          </div>
        </section>

        <section className={styles.statement}>
          <span>RP Instituto de Beleza</span>
          <p>Beleza é sentir-se confiante, cuidada e fiel à sua própria expressão.</p>
          <a href="#especialidades" aria-label="Conhecer as especialidades"><ArrowDownRight /></a>
        </section>

        <section id="especialidades" className={styles.universes}>
          <div className={styles.universeHeading}>
            <div><p className={styles.eyebrow}>Tudo começa consigo</p><h2>Escolha como quer sentir-se.</h2></div>
            <p>Tratamentos especializados, ideias atuais e um acompanhamento próximo para criar um resultado que combina consigo.</p>
          </div>
          <div className={styles.universeGrid}>
            {beautyUniverses.map((item) => { const Icon = item.icon; return <article key={item.number} className={styles.universeCard}><div className={styles.universeTop}><span>{item.number}</span><Icon /></div><h3>{item.title}</h3><p>{item.description}</p><div className={styles.tags}>{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></article>; })}
          </div>
        </section>

        {settings.show_services && visibleServices.length > 0 && (
          <section id="servicos" className={styles.rituals}>
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>Menu de beleza</p>
              <h2>Serviços feitos à sua medida.</h2>
              <p>Conheça os cuidados disponíveis no Instituto RP. Atendimento por marcação; valores e duração sob consulta.</p>
            </div>
            <div className={styles.serviceList}>
              {visibleServices.map((service, index) => (
                <article key={service.id} className={styles.serviceItem}>
                  <span className={styles.serviceIndex}>{String(index + 1).padStart(2, '0')}</span>
                  <div className={styles.serviceMain}>
                    <h3>{service.name}</h3>
                    <p>{service.description}</p>
                  </div>
                  <div className={styles.serviceMeta}>
                    {service.duration_minutes && <span><Clock3 /> {service.duration_minutes} min</span>}
                    <b>{Number(service.price) > 0 ? formatPrice.format(Number(service.price)) : 'Sob consulta'}</b>
                  </div>
                  <Link href={service.configured ? `/servicos/${serviceSlug(service.name)}` : '#contacto'} className={styles.serviceLink} aria-label={`Consultar ${service.name}`}><ChevronRight /></Link>
                </article>
              ))}
            </div>
          </section>
        )}

        <RpPriceList />

        <section id="casa" className={styles.about}>
          <div className={styles.aboutImage}>
            <img src={settings.hero_image_url || fallbackHero} alt="Detalhe do espaço RP Instituto de Beleza" />
          </div>
          <div className={styles.aboutCopy}>
            <p className={styles.eyebrow}>O Instituto RP</p>
            <h2>{settings.about_title || 'Técnica, criatividade e cuidado.'}</h2>
            <p>{settings.about_text || 'Na Quinta do Conde, criámos um espaço próximo e profissional para cuidar da sua imagem com tempo, escuta e atenção ao detalhe.'}</p>
            {settings.history_text && <p className={styles.history}>{settings.history_text}</p>}
            <Link href={bookingHref} className={styles.underlinedLink}>Encontrar o seu momento <ArrowUpRight /></Link>
          </div>
        </section>

        <section id="academia" className={styles.academy}>
          <div className={styles.academyIcon}><GraduationCap /></div>
          <div className={styles.academyCopy}><p className={styles.eyebrow}>RP Academy</p><h2>Aprender com prática. Crescer com confiança.</h2><p>Formações e oportunidades para modelos em técnicas de beleza. Uma abordagem próxima, atual e orientada para resultados reais.</p></div>
          <div className={styles.academyActions}><a href="#contacto" className={styles.primaryButton}>Quero saber mais <ArrowUpRight /></a><span><Star /> Formação · modelos · aperfeiçoamento</span></div>
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
              <a href={mapsUrl} target="_blank" rel="noreferrer"><MapPin /> Ver no Google Maps</a>
              <a href={settings.instagram_url || instagramUrl} target="_blank" rel="noreferrer"><Camera /> Seguir no Instagram</a>
            </div>
          </div>
          <PublicLeadForm slug={settings.slug} primaryColor={settings.primary_color} />
        </section>
      </main>

      <footer className={styles.footer}>
        <b>{account.name}</b>
        <span>© {new Date().getFullYear()} — beleza, técnica e confiança.</span>
        <Link href="/portal">Portal do cliente</Link>
      </footer>
    </div>
  );
}
