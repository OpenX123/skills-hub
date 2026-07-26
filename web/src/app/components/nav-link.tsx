export type NavLinkData = {
  href: string;
  label: string;
};
/** A navigation link. */
export default function NavLink({ d }: { d: NavLinkData }) {
  return (
    <a className="block text-color-001 text-sm leading-5 cursor-pointer hover:text-foreground hover:outline-foreground hover:[text-decoration-color:var(--foreground)]" data-component="link" href={d.href}>
      {d.label}
    </a>
  );
}
