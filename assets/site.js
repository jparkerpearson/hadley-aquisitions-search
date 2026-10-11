
document.documentElement.classList.add("js-ready");

// Refresh the homepage at the hero, without breaking section links or Back.
const navigation = performance.getEntriesByType("navigation")[0];
if (document.body.classList.contains("home-page") && !location.hash && navigation?.type !== "back_forward") {
  const previousRestoration = history.scrollRestoration;
  history.scrollRestoration = "manual";
  const startAtTop = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  startAtTop();
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) return;
    window.requestAnimationFrame(() => {
      if (!location.hash) startAtTop();
      history.scrollRestoration = previousRestoration;
    });
  }, { once: true });
}

const revealItems = document.querySelectorAll(
  ".identity-section, .contact-cta, .role-row, .role, .contact-section"
);
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver((entries, instance) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("reveal", "is-visible");
        instance.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
  revealItems.forEach((item, index) => {
    item.style.setProperty("--delay", `${Math.min(index % 4, 3) * 75}ms`);
    item.classList.add("reveal");
    observer.observe(item);
  });
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const homeNav = document.querySelector("body.home-page > nav.home-nav");
if (homeNav) {
  const hero = document.querySelector("#main > .hero");
  const logoImage = homeNav.querySelector(".logo img");
  const whiteLogo = logoImage?.dataset.whiteSrc;
  const blueLogo = logoImage?.dataset.blueSrc;
  let currentState = null;
  let updateQueued = false;

  const updateHomeNav = () => {
    const scrolled = hero
      ? window.scrollY >= Math.max(0, hero.offsetHeight - homeNav.offsetHeight)
      : window.scrollY > 0;
    if (scrolled === currentState) return;
    currentState = scrolled;
    homeNav.classList.toggle("is-scrolled", scrolled);
    const nextLogo = scrolled ? blueLogo : whiteLogo;
    if (logoImage && nextLogo && logoImage.getAttribute("src") !== nextLogo) {
      logoImage.setAttribute("src", nextLogo);
    }
  };

  const queueHomeNavUpdate = () => {
    if (updateQueued) return;
    updateQueued = true;
    window.requestAnimationFrame(() => {
      updateQueued = false;
      updateHomeNav();
    });
  };

  updateHomeNav();
  window.addEventListener("scroll", queueHomeNavUpdate, { passive: true });
  window.addEventListener("resize", queueHomeNavUpdate);
}

const backgroundVideo = document.querySelector(".hero-video");
if (backgroundVideo) {
  const hero = backgroundVideo.closest(".hero");
  const toggle = document.querySelector("[data-video-toggle]");
  const videoStatus = document.querySelector("[data-video-status]");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  let heroVisible = false;
  let sourceAttached = false;
  let playable = false;
  let failed = false;
  let manuallyPaused = false;
  let usingWebm = false;

  const motionAllowed = () => !motionPreference.matches && !connection?.saveData;

  const setVideoStatus = (message = "") => {
    if (!videoStatus) return;
    videoStatus.textContent = message;
    videoStatus.hidden = !message;
  };

  const updateToggle = () => {
    if (!toggle) return;
    const available = playable && motionAllowed() && !failed;
    toggle.hidden = !available;
    if (available) {
      const label = backgroundVideo.paused ? "Play background video" : "Pause background video";
      toggle.dataset.state = backgroundVideo.paused ? "paused" : "playing";
      toggle.setAttribute("aria-label", label);
    }
  };

  const pauseVideo = () => {
    if (!backgroundVideo.paused) backgroundVideo.pause();
    updateToggle();
  };

  const unloadVideo = () => {
    pauseVideo();
    if (sourceAttached) {
      backgroundVideo.removeAttribute("src");
      backgroundVideo.load();
      sourceAttached = false;
    }
    playable = false;
    updateToggle();
  };

  const attachSource = () => {
    if (sourceAttached || !motionAllowed()) return;
    const source = backgroundVideo.dataset.videoSrc;
    if (!source) return;
    usingWebm = !backgroundVideo.canPlayType('video/mp4; codecs="avc1.640028"') && !!backgroundVideo.dataset.webmSrc;
    backgroundVideo.src = usingWebm ? backgroundVideo.dataset.webmSrc : source;
    backgroundVideo.load();
    sourceAttached = true;
  };

  const syncPlayback = () => {
    if (!motionAllowed()) {
      unloadVideo();
      setVideoStatus("");
      return;
    }
    if (!heroVisible || document.hidden || manuallyPaused || failed) {
      pauseVideo();
      return;
    }

    attachSource();
    const request = backgroundVideo.play();
    if (request && typeof request.catch === "function") {
      request.catch((error) => {
        updateToggle();
        if (error.name === "NotAllowedError") {
          setVideoStatus("Background video paused. Select Play to start.");
        } else if (error.name !== "AbortError") {
          setVideoStatus("Background video unavailable. The headline remains visible.");
        }
      });
    }
  };

  backgroundVideo.addEventListener("canplay", () => {
    playable = true;
    setVideoStatus("");
    updateToggle();
    syncPlayback();
  });
  backgroundVideo.addEventListener("playing", () => {
    hero.classList.remove("video-unavailable");
    setVideoStatus("");
    updateToggle();
  });
  backgroundVideo.addEventListener("pause", updateToggle);
  backgroundVideo.addEventListener("error", () => {
    if (!usingWebm && backgroundVideo.dataset.webmSrc && motionAllowed()) {
      usingWebm = true;
      playable = false;
      backgroundVideo.src = backgroundVideo.dataset.webmSrc;
      backgroundVideo.load();
      syncPlayback();
      return;
    }
    failed = true;
    playable = false;
    pauseVideo();
    updateToggle();
    hero.classList.add("video-unavailable");
    setVideoStatus("Background video unavailable. Showing a still mountain image.");
    console.warn("Mountain video playback is unavailable; displaying the poster.");
  });

  if (toggle) {
    toggle.addEventListener("click", () => {
      if (!motionAllowed() || failed) return;
      manuallyPaused = !backgroundVideo.paused;
      if (manuallyPaused) {
        pauseVideo();
        setVideoStatus("");
      } else {
        setVideoStatus("");
        syncPlayback();
      }
    });
  }

  const handleMotionChange = () => {
    if (!motionAllowed()) {
      unloadVideo();
      setVideoStatus("");
    } else {
      syncPlayback();
    }
  };
  if (typeof motionPreference.addEventListener === "function") {
    motionPreference.addEventListener("change", handleMotionChange);
  } else {
    motionPreference.addListener(handleMotionChange);
  }
  connection?.addEventListener?.("change", handleMotionChange);
  document.addEventListener("visibilitychange", syncPlayback);

  if ("IntersectionObserver" in window) {
    const heroObserver = new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.01 });
    heroObserver.observe(hero);
  } else {
    heroVisible = true;
    syncPlayback();
  }
}
