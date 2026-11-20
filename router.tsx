import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export function navigate(to: string, replace = false) {
  if (location.pathname + location.search === to) return;
  if (replace) history.replaceState({}, '', to);
  else history.pushState({}, '', to);
  window.dispatchEvent(new Event('navchange'));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [p, setP] = useState(location.pathname);
  useEffect(() => {
    const f = () => setP(location.pathname);
    window.addEventListener('popstate', f);
    window.addEventListener('navchange', f);
    return () => {
      window.removeEventListener('popstate', f);
      window.removeEventListener('navchange', f);
    };
  }, []);
  return p;
}

export function Link({ to, onClick, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={go} {...rest}>{children}</a>;
}
