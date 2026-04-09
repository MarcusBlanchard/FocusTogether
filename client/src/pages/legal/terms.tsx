import { LegalDocLayout } from "@/components/legal/legal-doc-layout";

export default function TermsOfService() {
  return (
    <LegalDocLayout title="Terms of Service" updated="April 9, 2026">
      <p>
        These Terms of Service (“Terms”) govern your access to and use of Flowlocked, including the
        website, APIs, and desktop application (together, the “Service”) operated by{" "}
        <strong>[YOUR LEGAL ENTITY NAME]</strong> (“we,” “us,” or “our”). By creating an account,
        using the Service, or downloading the desktop app, you agree to these Terms. If you do not
        agree, do not use the Service.
      </p>

      <h2>1. Who may use the Service</h2>
      <p>
        You must be at least the age of digital consent in your jurisdiction (often 16 or 18) and able
        to form a binding contract. If you use the Service on behalf of an organization, you represent
        that you have authority to bind that organization.
      </p>

      <h2>2. Description of the Service</h2>
      <p>
        Flowlocked helps users schedule and join focus sessions with accountability partners. The
        Service may include video or audio sessions, social features, notifications, and desktop
        software that monitors certain device activity during active sessions to support focus goals.
      </p>

      <h2>3. Accounts and security</h2>
      <p>
        You are responsible for safeguarding your credentials and for activity under your account.
        Notify us promptly at <strong>[CONTACT EMAIL]</strong> if you suspect unauthorized access.
      </p>

      <h2>4. Focus monitoring and accountability features</h2>
      <p>
        The desktop application and related browser tools may collect and transmit information about
        your device activity (such as foreground application names and, where applicable, website
        domains or URLs) to our servers during active focus sessions. That information may be used to
        classify distractions, show alerts, and share session-relevant status with other participants
        you have joined in a session with, as described in our Privacy Policy.
      </p>
      <p>
        You acknowledge that accountability features are inherently intrusive by design and that you
        should only use them if you understand and accept how data is processed and shared.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Violate applicable law or infringe others’ rights.</li>
        <li>Harass, abuse, threaten, or discriminate against other users.</li>
        <li>
          Attempt to probe, scan, or test the vulnerability of the Service, bypass security, or access
          data you are not authorized to access.
        </li>
        <li>
          Reverse engineer, decompile, or disassemble the desktop app except where prohibited law
          does not allow this restriction.
        </li>
        <li>
          Use the Service to monitor another person’s device without their informed consent and lawful
          authority.
        </li>
        <li>
          Upload malware, interfere with the Service’s operation, or impose an unreasonable load on our
          infrastructure.
        </li>
      </ul>

      <h2>6. User content</h2>
      <p>
        If you submit content (such as profile information, messages, or session data), you grant us a
        worldwide, non-exclusive license to host, process, transmit, and display that content solely to
        provide and improve the Service. You represent that you have the rights needed to grant this
        license.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Service may integrate third-party providers (for example, authentication, hosting,
        payments, analytics, or real-time communication). Their use is subject to their respective
        terms and privacy policies.
      </p>

      <h2>8. Beta features</h2>
      <p>
        We may release features labeled beta or experimental. They may be incomplete or change without
        notice.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE
        DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE
        WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT WILL WE BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA,
        GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OF THE SERVICE. OUR AGGREGATE
        LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS
        YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) <strong>[USD AMOUNT]</strong>.
      </p>
      <p>
        Some jurisdictions do not allow certain limitations; in those cases, our liability is limited
        to the fullest extent permitted by law.
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You will defend and indemnify us and our affiliates, officers, directors, employees, and agents
        against any claims, damages, losses, liabilities, and expenses (including reasonable attorneys’
        fees) arising from your use of the Service, your content, or your violation of these Terms.
      </p>

      <h2>12. Suspension and termination</h2>
      <p>
        We may suspend or terminate your access if you violate these Terms or if we need to protect the
        Service or other users. You may stop using the Service at any time. Provisions that by their
        nature should survive will survive termination.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may modify these Terms by posting an updated version and updating the “Last updated” date.
        If changes are material, we will provide reasonable notice where required by law. Continued use
        after the effective date constitutes acceptance.
      </p>

      <h2>14. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of <strong>[STATE / COUNTRY]</strong>, excluding conflict-of-law
        rules. Courts located in <strong>[VENUE]</strong> will have exclusive jurisdiction, unless applicable
        law requires otherwise.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms: <strong>[CONTACT EMAIL]</strong>
        <br />
        Postal address: <strong>[OPTIONAL MAILING ADDRESS]</strong>
      </p>
    </LegalDocLayout>
  );
}
