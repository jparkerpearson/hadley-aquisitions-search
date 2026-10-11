import { useEffect, useRef, useState } from 'react';
import './_group.css';
import './ConnectedScroll.css';

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

export function ConnectedScroll() {
  const gridRef = useRef<HTMLUListElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const timersRef = useRef<number[]>([]);
  const motionCapable = typeof window !== 'undefined'
    && 'IntersectionObserver' in window
    && !prefersLessMotion();
  const [visible, setVisible] = useState<boolean[]>([]);
  const [motionReady, setMotionReady] = useState(motionCapable);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !motionCapable) return;

    const items = Array.from(grid.querySelectorAll<HTMLElement>('[data-reveal]'));
    const show = (index: number) => {
      setVisible((current) => {
        if (current[index]) return current;
        const next = [...current];
        next[index] = true;
        return next;
      });
    };

    items.forEach((item) => item.dataset.revealed = 'false');
    try {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const item = entry.target as HTMLElement;
          const index = Number(item.dataset.reveal);
          timersRef.current.push(window.setTimeout(() => {
            item.dataset.revealed = 'true';
            show(index);
          }, index * 115));
          observer.unobserve(item);
        });
      }, { threshold: 0.3, rootMargin: '0px 0px -15% 0px' });
      observerRef.current = observer;
      items.forEach((item) => observer.observe(item));
    } catch {
      setMotionReady(false);
      setVisible(items.map(() => true));
    }

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      timersRef.current.forEach(window.clearTimeout);
      timersRef.current = [];
    };
  }, [motionCapable]);

  const replay = () => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    const grid = gridRef.current;
    if (!grid || !motionReady || prefersLessMotion()) {
      setVisible([true, true, true, true, true, true]);
      return;
    }
    const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-reveal]'));
    setVisible([]);
    cells.forEach((cell) => { cell.dataset.revealed = 'false'; });

    cells.forEach((cell, index) => {
      timersRef.current.push(window.setTimeout(() => {
        cell.dataset.revealed = 'true';
        setVisible((current) => {
          const next = [...current];
          next[index] = true;
          return next;
        });
      }, 120 + index * 135));
    });
  };

  return (
    <section className="hadley-connected-scroll" aria-labelledby="hadley-connected-scroll-title">
      <div className="hadley-connected-scroll__inner">
        <div className="hadley-connected-scroll__tools">
          <button className="hadley-connected-scroll__replay" type="button" onClick={replay}>
            Replay reveal
          </button>
        </div>
        <ul
          className={`hadley-connected-scroll__grid${motionReady ? ' is-motion-ready' : ''}`}
          ref={gridRef}
        >
          <li className="hadley-connected-scroll__cell hadley-connected-scroll__title" data-reveal="0" data-revealed={motionReady ? 'false' : 'true'}>
            <h2 id="hadley-connected-scroll-title">Product offerings</h2>
          </li>
          {offerings.map((name, index) => (
            <li
              className="hadley-connected-scroll__cell"
              data-reveal={index + 1}
              data-revealed={motionReady ? 'false' : 'true'}
              key={name}
            >
              <h3>{name}</h3>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
