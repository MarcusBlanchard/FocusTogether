import { LegalDocLayout } from "@/components/legal/legal-doc-layout";

export default function PrivacyPolicy() {
  return (
    <LegalDocLayout title="Privacy Policy" updated="April 9, 2026">
      <p>
        This Privacy Policy describes how <strong>[YOUR LEGAL ENTITY NAME]</strong> (“we,” “us,” or
        “our”) collects, uses, and shares information when you use Flowlocked (the “Service”), including
        our website and desktop application.
      </p>

      <h2>1. Information we collect</h2>

      <h3>1.1 Account and profile</h3>
      <p>
        We collect information you provide when you register or update your profile, such as name,
        username, email address, profile image, preferences, and authentication identifiers from our
        identity provider.
      </p>

      <h3>1.2 Session and social features</h3>
      <p>
        We process information about scheduled sessions you create or join, participation status,
        friend connections, notifications, and in-session activity signals needed to operate matching
        and accountability features.
      </p>

      <h3>1.3 Desktop application and browser companion</h3>
      <p>
        When you run the Flowlocked desktop app during an active focus session, it may collect and send
        to our servers:
      </p>
      <ul>
        <li>Foreground application name or identifier and related metadata.</li>
        <li>
          For supported browsers, website hostname or URL information used to detect distracting sites,
          depending on your platform and permissions.
        </li>
        <li>
          High-level focus state (for example, active, idle, or distracted) derived from the above.
        </li>
      </ul>
      <p>
        The app may require operating-system permissions (such as accessibility) to read this
        information. We use it only as described in this Policy and in the in-product disclosures.
      </p>

      <h3>1.4 Communications and support</h3>
      <p>If you contact us, we collect the information you provide in that correspondence.</p>

      <h3>1.5 Technical data</h3>
      <p>
        We collect standard logs and device data such as IP address, approximate location derived from
        IP, user agent, app version, timestamps, and diagnostic events to secure and operate the Service.
      </p>

      <h3>1.6 Cookies and similar technologies</h3>
      <p>
        We use cookies, local storage, and similar technologies where needed to keep you signed in,
        remember preferences, measure basic performance, and protect against abuse. You can control
        cookies through your browser settings; disabling some cookies may limit functionality.
      </p>

      <h2>2. How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>Provide, maintain, and improve the Service.</li>
        <li>Match sessions, show schedules, and deliver in-app and system notifications.</li>
        <li>
          Enforce focus rules during sessions, including alerting you and, where applicable, other
          participants about session-relevant activity.
        </li>
        <li>Detect abuse, fraud, and security issues.</li>
        <li>Comply with law and enforce our Terms of Service.</li>
        <li>Analyze aggregated or de-identified usage trends.</li>
      </ul>

      <h2>3. How we share information</h2>
      <p>We may share information:</p>
      <ul>
        <li>
          <strong>With other participants</strong> in a session when needed for accountability (for
          example, high-level status or alerts the product is designed to show partners).
        </li>
        <li>
          <strong>With service providers</strong> who process data on our behalf under contractual
          obligations (hosting, authentication, payments, analytics, communications infrastructure).
        </li>
        <li>
          <strong>For legal reasons</strong> if we believe disclosure is required by law, regulation,
          legal process, or governmental request, or to protect rights, safety, and security.
        </li>
        <li>
          <strong>In connection with a business transaction</strong> such as a merger or acquisition,
          subject to appropriate safeguards.
        </li>
      </ul>
      <p>We do not sell your personal information for money as that term is commonly understood.</p>

      <h2>4. Retention</h2>
      <p>
        We retain information for as long as your account is active and as needed to provide the
        Service, comply with legal obligations, resolve disputes, and enforce agreements. Retention
        periods may vary by data category; contact us for more detail.
      </p>

      <h2>5. Security</h2>
      <p>
        We implement technical and organizational measures designed to protect personal information.
        No method of transmission or storage is completely secure; we cannot guarantee absolute
        security.
      </p>

      <h2>6. Your rights and choices</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or export personal
        information, or to object to or restrict certain processing. You may also have the right to
        lodge a complaint with a supervisory authority. To exercise rights, contact{" "}
        <strong>[CONTACT EMAIL]</strong>. We may need to verify your request.
      </p>

      <h2>7. Children</h2>
      <p>
        The Service is not directed to children under the age where parental consent is required in
        your jurisdiction. We do not knowingly collect personal information from children.
      </p>

      <h2>8. International transfers</h2>
      <p>
        We may process information in countries other than where you live. Where required, we use
        appropriate safeguards for cross-border transfers.
      </p>

      <h2>9. U.S. state privacy notices</h2>
      <p>
        Residents of certain U.S. states may have additional rights under local privacy laws. Contact{" "}
        <strong>[CONTACT EMAIL]</strong> to submit a request. We will not discriminate against you for
        exercising applicable privacy rights.
      </p>

      <h2>10. Changes to this Policy</h2>
      <p>
        We may update this Policy from time to time. We will post the updated version and revise the
        “Last updated” date. Where required, we will provide additional notice.
      </p>

      <h2>11. Contact</h2>
      <p>
        Data protection / privacy inquiries: <strong>[CONTACT EMAIL]</strong>
        <br />
        Postal address: <strong>[OPTIONAL MAILING ADDRESS]</strong>
      </p>
    </LegalDocLayout>
  );
}
