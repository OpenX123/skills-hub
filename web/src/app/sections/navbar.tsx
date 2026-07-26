import NavLink from "../components/nav-link";
import { navLinkData as navLinkDataContent, BRAND } from "../content";

/** 顶部导航。 */
export default function Navbar({ navLinkData = navLinkDataContent } = {}) {
  return (
    <header className="h-14 block sticky top-0 z-50 bg-background border-b border-solid border-b-border">
      <div className="flex px-4 justify-between items-center gap-6 h-14 mx-auto max-w-6xl">
        <a className="h-7 flex items-center gap-2 cursor-pointer" data-component="link" href="#leaderboard">
          <span className="block text-lg leading-7">🧩</span>
          <span className="inline text-lg font-medium leading-7 tracking-[-0.45px]">{BRAND}</span>
        </a>
        <nav className="flex items-center gap-6" data-component="nav">
          {navLinkData.map((d, i) => <NavLink key={i} d={d} />)}
        </nav>
      </div>
    </header>
  );
}
