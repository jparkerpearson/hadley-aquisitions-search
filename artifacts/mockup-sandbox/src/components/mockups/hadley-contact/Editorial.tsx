import { useState, type FormEvent, type InvalidEvent } from "react";
import "./_group.css";
import "./Editorial.css";

type FieldName = "name" | "email" | "interest";
type FieldErrors = Partial<Record<FieldName, string>>;

export function Editorial() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState("");

  function handleInvalid(event: InvalidEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const field = input.name as FieldName;
    const message = input.validity.valueMissing
      ? `${field === "email" ? "Work Email" : "Name"} is required.`
      : field === "email"
        ? "Enter a valid email address."
        : "Please check this field.";
    setErrors((current) => ({ ...current, [field]: message }));
    setStatus("");
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (input.validity.valid) {
      setErrors((current) => {
        const next = { ...current };
        delete next[input.name as FieldName];
        return next;
      });
    }
    setStatus("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setStatus("Preview only — no message was sent.");
  }

  return (
    <div className="hadley-contact-prototype editorial-contact">
      <section className="editorial-contact__section" aria-labelledby="editorial-contact-title">
        <div className="editorial-contact__layout">
          <header className="editorial-contact__heading">
            <h2 id="editorial-contact-title">Get in touch</h2>
          </header>

          <form className="editorial-contact__form" onSubmit={handleSubmit} noValidate={false}>
            <div className="editorial-contact__fields">
              <div className="editorial-contact__field">
                <label htmlFor="editorial-name">Name</label>
                <input
                  id="editorial-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={160}
                  required
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby="editorial-name-error"
                  onInvalid={handleInvalid}
                  onInput={handleInput}
                />
                <span className="editorial-contact__error" id="editorial-name-error" aria-live="polite">
                  {errors.name}
                </span>
              </div>

              <div className="editorial-contact__field">
                <label htmlFor="editorial-email">Work Email</label>
                <input
                  id="editorial-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby="editorial-email-error"
                  onInvalid={handleInvalid}
                  onInput={handleInput}
                />
                <span className="editorial-contact__error" id="editorial-email-error" aria-live="polite">
                  {errors.email}
                </span>
              </div>

              <div className="editorial-contact__field">
                <label htmlFor="editorial-interest">Area of Interest</label>
                <input
                  id="editorial-interest"
                  name="interest"
                  type="text"
                  maxLength={500}
                  aria-invalid={Boolean(errors.interest)}
                  aria-describedby="editorial-interest-error"
                  onInvalid={handleInvalid}
                  onInput={handleInput}
                />
                <span className="editorial-contact__error" id="editorial-interest-error" aria-live="polite">
                  {errors.interest}
                </span>
              </div>
            </div>

            <div className="editorial-contact__actions">
              <p className="editorial-contact__status" role="status" aria-live="polite">{status}</p>
              <button className="editorial-contact__submit" type="submit">Send</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
