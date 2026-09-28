import { LegalPage } from "@/components/legal/LegalPage";

const Privacy = () => (
  <LegalPage title="Privacy Policy" updated="September 28, 2026">
    <p>
      Persona is a demo onboarding experience. This page explains what we receive when you connect Google and what we do
      with it.
    </p>

    <section>
      <h2>What we receive from Google</h2>
      <p>
        When you tap “Continue with Google”, Persona only receives your <strong className="text-white">name</strong> and{" "}
        <strong className="text-white">email address</strong>. We don't ask for access to your Gmail messages, contacts,
        calendar or anything else.
      </p>
    </section>

    <section>
      <h2>How we use it</h2>
      <p>We use your name and email only to set up your assistant in this demo, for example to greet you by name and show which account is connected.</p>
    </section>

    <section>
      <h2>Where it's stored</h2>
      <ul>
        <li>Your name, email and onboarding answers are stored in the app's database.</li>
        <li>Your Google sign-in token is checked once to confirm it's really you, then thrown away. It is never stored.</li>
        <li>Conversation text from your call and chat with Persona is stored so your thread comes back when you return.</li>
      </ul>
    </section>

    <section>
      <h2>What we never do</h2>
      <p>We never sell your information, and we don't share it with advertisers.</p>
    </section>

    <section>
      <h2>Deleting your data</h2>
      <p>You can reset anytime from the app. Resetting onboarding deletes your saved session, your Gmail connection and your conversation history.</p>
    </section>
  </LegalPage>
);

export default Privacy;
