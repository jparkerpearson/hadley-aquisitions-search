/* Voicemail: add an approved audio file under assets/ and set this path, e.g. "assets/hadley-voicemail.mp3". Keep empty until a real clip is supplied. */
const HADLEY_VOICEMAIL_SOURCE = "";

document.documentElement.classList.add("js-ready");

const revealItems = document.querySelectorAll(
  ".offer-card, .audio-card, .careers-hero, .role-row, .role"
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
      toggle.textContent = backgroundVideo.paused ? "Play" : "Pause";
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

const audio = document.querySelector("[data-hadley-audio]");
const audioStatus = document.querySelector("[data-audio-status]");
if (audio && audioStatus) {
  if (HADLEY_VOICEMAIL_SOURCE.trim()) {
    audio.src = HADLEY_VOICEMAIL_SOURCE;
    audio.hidden = false;
    audioStatus.textContent = "A Hadley voicemail recording is available. Use the playback controls to listen.";
    audio.addEventListener("error", () => {
      audio.hidden = true;
      audioStatus.textContent = "The voicemail sample could not be loaded. Please check the configured audio file.";
      audioStatus.dataset.state = "error";
    });
  } else {
    audio.hidden = true;
    audioStatus.textContent = "Voicemail sample coming soon.";
  }
}
