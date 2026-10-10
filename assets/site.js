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
