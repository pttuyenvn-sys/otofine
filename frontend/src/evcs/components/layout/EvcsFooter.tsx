import Link from "next/link";
import {
  FOOTER_LEGAL,
  FOOTER_NAV,
  SOCIAL_LINKS,
} from "@evcs/constants/navigation";
import { SITE } from "@evcs/constants/site";
import { HotlineLink } from "@evcs/components/conversion/HotlineLink";
import { Container } from "@evcs/components/layout/Container";

const CURRENT_YEAR = new Date().getFullYear();

export function EvcsFooter() {
  return (
    <footer className="evcs-footer">
      <Container>
        <div className="evcs-footer__grid">
          <div>
            <div className="evcs-footer__brand-name">{SITE.name}</div>
            <p className="evcs-footer__brand-desc">{SITE.description}</p>
            <div className="evcs-footer__social">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.icon}
                  href={social.href}
                  className="evcs-footer__social-link"
                  aria-label={social.label}
                  target={social.href.startsWith("http") ? "_blank" : undefined}
                  rel={
                    social.href.startsWith("http")
                      ? "noopener noreferrer"
                      : undefined
                  }
                >
                  {social.icon.slice(0, 2).toUpperCase()}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="evcs-footer__heading">Khám phá</h3>
            <ul className="evcs-footer__links">
              {FOOTER_NAV.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="evcs-footer__link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="evcs-footer__heading">Liên hệ</h3>
            <p className="evcs-footer__contact-item">
              Hotline: <HotlineLink />
            </p>
            <p className="evcs-footer__contact-item">
              Email:{" "}
              <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </p>
            <p className="evcs-footer__contact-item">{SITE.address}</p>
          </div>
        </div>

        <div className="evcs-footer__bottom">
          <p>
            © {CURRENT_YEAR} {SITE.name}. Bản quyền thuộc về EVCS.
          </p>
          <div className="evcs-footer__legal">
            {FOOTER_LEGAL.map((link) => (
              <Link key={link.label} href={link.href}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
