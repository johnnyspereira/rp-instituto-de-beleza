'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Slide = {
  image: string;
  label: string;
};

export function PublicHeroSlider({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6500
    );
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const select = (index: number) =>
    setActive((index + slides.length) % slides.length);

  return (
    <div className="site-slider absolute inset-0" aria-hidden="true">
      {slides.map((slide, index) => (
        // These images may be either project presets or customer-hosted URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${slide.image}-${index}`}
          src={slide.image}
          alt=""
          className={`site-slide absolute inset-0 size-full object-cover transition-[opacity,transform] duration-1000 ${
            active === index
              ? 'scale-100 opacity-100'
              : 'pointer-events-none scale-[1.035] opacity-0'
          }`}
        />
      ))}
      <div className="site-slider-shade absolute inset-0" />
      {slides.length > 1 && (
        <div className="site-slider-controls absolute right-4 bottom-5 left-4 z-10 mx-auto flex max-w-7xl items-end justify-between px-0 sm:right-6 sm:left-6">
          <div className="flex items-center gap-2">
            {slides.map((slide, index) => (
              <button
                type="button"
                key={slide.image}
                onClick={() => select(index)}
                className={`group flex h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold text-white backdrop-blur transition ${
                  active === index
                    ? 'bg-white/24'
                    : 'bg-black/20 hover:bg-white/15'
                }`}
                aria-label={`Mostrar ${slide.label}`}
              >
                <span
                  className={`h-1 rounded-full bg-white transition-all ${active === index ? 'w-8' : 'w-2 opacity-55'}`}
                />
                <span className="hidden sm:inline">{slide.label}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => select(active - 1)}
              className="flex size-10 items-center justify-center rounded-full border border-white/25 bg-black/20 text-white backdrop-blur hover:bg-white/15"
              aria-label="Imagem anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => select(active + 1)}
              className="flex size-10 items-center justify-center rounded-full border border-white/25 bg-black/20 text-white backdrop-blur hover:bg-white/15"
              aria-label="Próxima imagem"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
