import type { Metadata } from "next";
import Link from "next/link";
import BrandLogo from "../brand-logo";

export const metadata: Metadata = { title: "Privacy Notice" };

const sections = [
  [
    "What this notice covers",
    "This notice explains how AgentX processes information when a business uses the platform to build or operate a voice agent. The business operating the agent is responsible for its own customer notice, lawful basis and instructions.",
  ],
  [
    "Information processed",
    "A voice agent may process call audio, transcripts, contact details, appointment requests and other details a caller chooses to provide. AgentX also processes account information, agent configuration and operational records needed to run the workspace.",
  ],
  [
    "Why it is used",
    "Information is used to deliver a requested conversation, create the follow-up a caller has approved, secure the service, troubleshoot failures and provide the business with its own authorised operational records.",
  ],
  [
    "Processors and transfers",
    "Voice, identity, hosting and billing functions rely on service providers selected by the customer. Before production launch, the account owner must publish the current processor list, hosting regions and any cross-border transfer safeguards in its customer-facing notice.",
  ],
  [
    "Retention and deletion",
    "Do not keep transcripts or call records indefinitely. Set a documented retention period for each deployment, restrict access to authorised staff and provide a verified process for deletion, correction and access requests before accepting public calls.",
  ],
  [
    "Your choices",
    "Callers should be told before recording or transcription begins and may choose another contact channel. Requests about personal information should be directed to the business named in the voice agent introduction.",
  ],
];

export default function PrivacyPage() {
  return (
    <main className="legalShell">
      <nav className="legalNav"><BrandLogo /><Link href="/">Return home</Link></nav>
      <article className="legalContent">
        <p className="productKicker"><span />Policy template</p>
        <h1>Privacy Notice</h1>
        <p className="legalLead">This is the product-level baseline for AgentX. It must be completed with the deploying business legal identity, contact details, processor list and retention schedule before public launch.</p>
        {sections.map(([heading, body]) => <section key={heading}><h2>{heading}</h2><p>{body}</p></section>)}
        <aside className="legalCallout">This page is a release requirement, not legal advice. Have local counsel review the final notice for the markets where each agent operates.</aside>
      </article>
      <footer className="legalFooter"><Link href="/terms">Terms of Use</Link><Link href="/platform">Release status</Link></footer>
    </main>
  );
}
