import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "../brand-logo";

export const metadata: Metadata = { title: "Terms of Use" };

const sections = [
  ["Use of the service", "Use AgentX only for lawful business workflows and only with clear authority to process each caller's information. Do not use the service for emergency, medical, legal, financial or other high-stakes decisions without an appropriate human escalation path."],
  ["Your agent configuration", "You are responsible for the facts, prompts, connected accounts, working hours, handoff contacts and customer notices configured for an agent. Review the generated blueprint and test every connected action before publishing."],
  ["Human review", "AgentX is designed to capture requests and assist with approved information. A person must review exceptions, complaints, sensitive decisions and any action that cannot be independently confirmed by a connected system."],
  ["Credentials and access", "Protect account credentials, agent access keys and connected-service tokens. Rotate keys when access changes, restrict staff permissions and immediately revoke credentials you suspect have been exposed."],
  ["Availability and changes", "Third-party providers may affect speech, identity, telephony, hosting or payment availability. Keep a human contact route available and do not represent an integration as active until it has been configured and tested."],
  ["Launch responsibility", "The deploying business is responsible for privacy disclosures, consent wording, retention, sector-specific compliance, consumer communications and contractual terms for its customers."],
];

export default function TermsPage() {
  return (
    <main className="legalShell">
      <nav className="legalNav"><BrandLogo /><Link href="/">Return home</Link></nav>
      <article className="legalContent">
        <p className="productKicker"><span />Policy template</p>
        <h1>Terms of Use</h1>
        <p className="legalLead">These product terms set the operating expectations for an AgentX deployment. Complete them with the legal entity, governing law, billing terms and support contact before publishing.</p>
        {sections.map(([heading, body]) => <section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}
        <aside className="legalCallout">A production deployment needs final commercial terms, service-level commitments and compliance review from the business that operates the agent.</aside>
      </article>
      <footer className="legalFooter"><Link href="/privacy">Privacy Notice</Link><Link href="/platform">Release status</Link></footer>
    </main>
  );
}
