import { useEffect, useRef, useState, type CSSProperties } from 'react';
import './_group.css';
import './Asymmetric.css';

const offerings = [
  'Buyside advisory',
  'Market mapping',
  'Expert sourcing',
  'Agentic sales',
  'Sourcing software',
];

export function Asymmetric() {
  const sectionRef = useRef<HTMLElement>(null);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const items = Array.from(section.querySelectorAll<HTMLElement>('.hadley-asymmetric__item'));
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      section.classList.remove('hadley-asymmetric--observing');
      items.forEach((item) => item.setAttribute('data-revealed', 'true'));
      return;
    }

    items.forEach((item) => item.setAttribute('data-revealed', 'false'));
    section.classList.add('hadley-asymmetric--observing');

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute('data-revealed', 'true');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -5% 0px' });

    items.forEach((item) => observer.observe(item));
    return () => {
      observer.disconnect();
      section.classList.remove('hadley-asymmetric--observing');
    };
  }, [replayKey]);

  return (
    <section
      ref={sectionRef}
      className="hadley-asymmetric"
      aria-labelledby="hadley-asymmetric-title"
    >
      <div className="hadley-asymmetric__inner">
        <header className="hadley-asymmetric__header">
          <h2 id="hadley-asymmetric-title">Product offerings</h2>
          <button
            className="hadley-asymmetric__replay"
            type="button"
            onClick={() => setReplayKey((key) => key + 1)}
          >
            Replay animation
          </button>
        </header>

        <ul className="hadley-asymmetric__grid">
          {offerings.map((offering, index) => (
            <li
              className={`hadley-asymmetric__item${index === 0 ? ' hadley-asymmetric__item--lead' : ''}`}
              data-revealed="true"
              style={{ '--reveal-index': index } as CSSProperties}
              key={offering}
            >
              <h3>{offering}</h3>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
