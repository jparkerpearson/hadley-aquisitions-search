const CONTACT_ENDPOINT = "https://careers-intake-883516381966.us-west1.run.app/contact";
const contactForm = document.querySelector("#contact-form");

if (contactForm) {
  contactForm.hidden = false;
  const submitButton = document.querySelector("#contact-submit");
  const statusMessage = document.querySelector("#contact-status");
  const successMessage = document.querySelector("#contact-success");
  const fieldNames = ["name", "email", "interest"];
  let submitting = false;

  const fieldFor = (name) => contactForm.elements.namedItem(name);
  const clearFieldError = (name) => {
    const input = fieldFor(name);
    const error = document.querySelector(`#error-${name}`);
    if (!input || !error) return;
    error.textContent = "";
    input.removeAttribute("aria-invalid");
  };

  const showFieldErrors = (fields) => {
    fieldNames.forEach(clearFieldError);
    let firstInvalid = null;
    Object.entries(fields || {}).forEach(([name, message]) => {
      if (!fieldNames.includes(name) || typeof message !== "string") return;
      const input = fieldFor(name);
      const error = document.querySelector(`#error-${name}`);
      if (!input || !error) return;
      error.textContent = message;
      input.setAttribute("aria-invalid", "true");
      firstInvalid ||= input;
    });
    firstInvalid?.focus();
  };

  fieldNames.forEach((name) => {
    fieldFor(name)?.addEventListener("input", () => clearFieldError(name));
  });

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    statusMessage.textContent = "";
    successMessage.hidden = true;
    showFieldErrors({});

    const payload = Object.fromEntries(new FormData(contactForm));
    const validationErrors = {};
    if (!payload.name.trim()) validationErrors.name = "Please enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
      validationErrors.email = "Please enter a valid work email address.";
    }
    if (Object.keys(validationErrors).length) {
      showFieldErrors(validationErrors);
      return;
    }

    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Sending…";
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          name: payload.name,
          email: payload.email,
          interest: payload.interest,
          website: payload.website,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 201 && body.ok === true) {
        contactForm.hidden = true;
        successMessage.hidden = false;
        successMessage.focus();
        return;
      }

      if (response.status === 422 && body.fields) showFieldErrors(body.fields);
      statusMessage.textContent = body.error || "Unable to send your message. Please try again.";
    } catch (error) {
      statusMessage.textContent = error.name === "AbortError"
        ? "Request timed out. Please try again."
        : "Could not reach the server. Please try again.";
    } finally {
      window.clearTimeout(timeoutId);
      submitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "Send";
    }
  });
}
