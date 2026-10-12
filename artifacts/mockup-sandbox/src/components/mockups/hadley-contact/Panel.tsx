import { useState } from "react";
import "./_group.css";
import "./Panel.css";

// Isolated design preview only: the valid form never leaves this page.
export function Panel() {
  const [status, setStatus] = useState("");

  return (
    <div className="hadley-contact-prototype hadley-panel-preview">
      <section className="panel-contact" aria-labelledby="panel-contact-title">
        <div className="panel-contact-card">
          <h2 className="panel-contact-title" id="panel-contact-title">Get in touch</h2>
          <form
            className="panel-contact-form"
            onSubmit={(event) => {
              event.preventDefault();
              setStatus("Preview only — no message was sent.");
            }}
          >
            <div className="panel-contact-fields">
              <div className="panel-contact-field">
                <label htmlFor="panel-contact-name">Name</label>
                <input
                  id="panel-contact-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={160}
                  required
                />
              </div>
              <div className="panel-contact-field">
                <label htmlFor="panel-contact-email">Work Email</label>
                <input
                  id="panel-contact-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </div>
              <div className="panel-contact-field">
                <label htmlFor="panel-contact-interest">Area of Interest</label>
                <input
                  id="panel-contact-interest"
                  name="interest"
                  type="text"
                  maxLength={500}
                />
              </div>
            </div>
            <div className="panel-contact-footer">
              <p className="panel-contact-status" role="status" aria-live="polite">{status}</p>
              <button className="panel-contact-submit" type="submit">Send</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
