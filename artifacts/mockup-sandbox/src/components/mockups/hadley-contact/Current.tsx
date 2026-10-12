import { useState } from "react";
import "./_group.css";
import "./Current.css";

// Markup extracted from index.html#get-in-touch. Only the network boundary
// is replaced: this isolated preview never stores a lead or sends an email.
export function Current() {
  const [status, setStatus] = useState("");
  return (
    <div className="hadley-contact-prototype">
      <section className="home-contact" id="get-in-touch" aria-labelledby="contact-title">
        <h2 className="contact-title" id="contact-title">Get in touch</h2>
        <form className="contact-form" id="contact-form" onSubmit={(event) => {
          event.preventDefault();
          setStatus("Preview only — no message was sent.");
        }}>
          <div className="contact-fields">
            <div className="contact-field">
              <label htmlFor="contact-name">Name</label>
              <input id="contact-name" name="name" type="text" autoComplete="name" maxLength={160} required aria-describedby="error-name" />
              <span className="contact-field-error" id="error-name" />
            </div>
            <div className="contact-field">
              <label htmlFor="contact-email">Work Email</label>
              <input id="contact-email" name="email" type="email" autoComplete="email" maxLength={254} required aria-describedby="error-email" />
              <span className="contact-field-error" id="error-email" />
            </div>
            <div className="contact-field contact-field--interest">
              <label htmlFor="contact-interest">Area of Interest</label>
              <input id="contact-interest" name="interest" type="text" maxLength={500} aria-describedby="error-interest" />
              <span className="contact-field-error" id="error-interest" />
            </div>
          </div>
          <div className="contact-form-footer">
            <p className="contact-status" id="contact-status" role="status">{status}</p>
            <button className="contact-submit" id="contact-submit" type="submit">Send</button>
          </div>
        </form>
        <p className="contact-success" id="contact-success" role="status" tabIndex={-1} hidden>Thanks. Your message has been received.</p>
      </section>
    </div>
  );
}
