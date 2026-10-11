import { useCallback, useEffect, useRef, useState } from 'react';
import './_group.css';
import './AsymmetricScroll.css';

const offerings = [
  'Buyside advisory',
  'Market mapping',
  'Expert sourcing',
  'Agentic sales',
  'Sourcing software',
];

function prefersLessMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function AsymmetricScroll() {
  const railRef = useRef<HTMLUListElement>(null);
  const wheelLockRef = useRef(false);
  const wheelTimerRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let frame = 0;

    const readActiveSlide = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const railBounds = rail.getBoundingClientRect();
        const center = railBounds.left + railBounds.width / 2;
        const slides = Array.from(rail.querySelectorAll<HTMLElement>('.hadley-asymmetric-scroll__item'));
        let closest = 0;
        let distance = Infinity;
        slides.forEach((slide, index) => {
          const bounds = slide.getBoundingClientRect();
          const nextDistance = Math.abs(bounds.left + bounds.width / 2 - center);
          if (nextDistance < distance) {
            distance = nextDistance;
            closest = index;
          }
        });
        setActiveIndex((current) => current === closest ? current : closest);
      });
    };

    rail.addEventListener('scroll', readActiveSlide, { passive: true });
    window.addEventListener('resize', readActiveSlide);
    readActiveSlide();

    return () => {
      rail.removeEventListener('scroll', readActiveSlide);
      window.removeEventListener('resize', readActiveSlide);
      cancelAnimationFrame(frame);
      if (wheelTimerRef.current !== null) window.clearTimeout(wheelTimerRef.current);
    };
  }, []);

  const moveTo = useCallback((index: number) => {
    const rail = railRef.current;
    const slide = rail?.querySelectorAll<HTMLElement>('.hadley-asymmetric-scroll__item')[index];
    if (!rail || !slide) return;
    const railBounds = rail.getBoundingClientRect();
    const slideBounds = slide.getBoundingClientRect();
    const offset = slideBounds.left + slideBounds.width / 2 - railBounds.left - railBounds.width / 2;
    rail.scrollTo({
      left: rail.scrollLeft + offset,
      behavior: prefersLessMotion() ? 'instant' : 'smooth',
    });
  }, []);

  const onWheel = useCallback((event: WheelEvent) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || wheelLockRef.current) return;
    const next = activeIndex + (event.deltaY > 0 ? 1 : -1);
    if (next < 0 || next >= offerings.length) return;
    event.preventDefault();
    wheelLockRef.current = true;
    moveTo(next);
    wheelTimerRef.current = window.setTimeout(() => {
      wheelLockRef.current = false;
      wheelTimerRef.current = null;
    }, 360);
  }, [activeIndex, moveTo]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener('wheel', onWheel, { passive: false });
    return () => rail.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  return (
    <section className="hadley-asymmetric-scroll" aria-labelledby="hadley-asymmetric-scroll-title">
      <div className="hadley-asymmetric-scroll__inner">
        <header className="hadley-asymmetric-scroll__header">
          <h2 id="hadley-asymmetric-scroll-title">Product offerings</h2>
        </header>

        <div className="hadley-asymmetric-scroll__book">
          <ul
            className="hadley-asymmetric-scroll__grid"
            ref={railRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Product offerings"
            onKeyDown={(event) => {
              if (event.target instanceof HTMLElement && event.target.closest('button')) return;
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveTo(Math.min(activeIndex + 1, offerings.length - 1));
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveTo(Math.max(activeIndex - 1, 0));
              }
            }}
            tabIndex={0}
          >
            {offerings.map((offering, index) => (
              <li
                className="hadley-asymmetric-scroll__item"
                data-active={index === activeIndex}
                data-distance={Math.abs(index - activeIndex)}
                aria-label={`${offering}, ${index + 1} of ${offerings.length}`}
                role="group"
                aria-roledescription="page"
                key={offering}
              >
                <h3>{offering}</h3>
              </li>
            ))}
          </ul>
          <button
            className="hadley-asymmetric-scroll__control hadley-asymmetric-scroll__control--previous"
            type="button"
            aria-label="Previous offering"
            onClick={() => moveTo(Math.max(activeIndex - 1, 0))}
            disabled={activeIndex === 0}
          ><span aria-hidden="true">‹</span></button>
          <button
            className="hadley-asymmetric-scroll__control hadley-asymmetric-scroll__control--next"
            type="button"
            aria-label="Next offering"
            onClick={() => moveTo(Math.min(activeIndex + 1, offerings.length - 1))}
            disabled={activeIndex === offerings.length - 1}
          ><span aria-hidden="true">›</span></button>
        </div>

        <nav className="hadley-asymmetric-scroll__pagination" aria-label="Choose an offering">
          {offerings.map((offering, index) => (
            <button
              className="hadley-asymmetric-scroll__page"
              key={offering}
              type="button"
              aria-label={`Show ${offering}`}
              aria-current={index === activeIndex ? 'step' : undefined}
              onClick={() => moveTo(index)}
            />
          ))}
        </nav>
      </div>
    </section>
  );
}
