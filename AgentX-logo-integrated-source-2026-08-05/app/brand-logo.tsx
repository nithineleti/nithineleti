import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = { href?: string; compact?: boolean; className?: string };

export default function BrandLogo({ href = "/", compact = false, className = "" }: BrandLogoProps) {
  const logo = (
    <span className={`brandIdentity ${compact ? "brandIdentityCompact" : ""} ${className}`.trim()}>
      <Image
        className="brandLogoImage"
        src={compact ? "/agentx-symbol.png" : "/agentx-logo.png"}
        alt="Agent X — Intelligence in Action"
        width={compact ? 64 : 220}
        height={compact ? 64 : 92}
        priority
        // Served straight from static assets. The optimizer endpoint needs a
        // Cloudflare Images binding and only accepts its own width allow-list,
        // so routing a fixed-size 29KB brand PNG through it just breaks the logo.
        unoptimized
      />
    </span>
  );
  return href ? <Link className="brand" href={href} aria-label="AgentX home">{logo}</Link> : logo;
}
