import { Link } from "react-router-dom";

import { LegalPage } from "@/components/legal/LegalPage";

const Terms = () => (
  <LegalPage title="Terms of Use" updated="September 28, 2026">
    <p>
      Persona is a demo onboarding experience. It shows how an AI assistant could get you set up over a voice call and
      iMessage-style chat.
    </p>

    <section>
      <h2>Provided as is</h2>
      <p>
        This demo is provided “as is”, without warranties of any kind. Features may change, break or be removed at any
        time, and conversations with Persona may be inaccurate.
      </p>
    </section>

    <section>
      <h2>Using the demo</h2>
      <ul>
        <li>Don't share sensitive information such as passwords or financial details with Persona.</li>
        <li>Don't use the demo for anything unlawful or to disrupt the service.</li>
      </ul>
    </section>

    <section>
      <h2>Your information</h2>
      <p>
        How we handle your name and email is described in the{" "}
        <Link to="/privacy" className="text-[#0A84FF] hover:underline">
          Privacy Policy
        </Link>
        . You can reset your onboarding anytime from the app.
      </p>
    </section>
  </LegalPage>
);

export default Terms;
