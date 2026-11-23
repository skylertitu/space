"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ComponentProps } from "react"

let isConsolePatched = false;

function patchConsoleErrorOnce() {
  if (isConsolePatched || typeof window === 'undefined' || process.env.NODE_ENV !== 'development') {
    return;
  }
  isConsolePatched = true;
  const orig = console.error;
  console.error = (...args: any[]) => {
    const argStr = args.map(a => String(a)).join(' ');
    if (
      argStr.includes('Encountered a script tag') ||
      argStr.includes('429') ||
      argStr.includes('Jupiter') ||
      argStr.includes('Retrying') ||
      argStr.includes('price')
    ) {
      return;
    }
    orig.apply(console, args);
  };
}

export function ThemeProvider({ 
  children, 
  ...props 
}: ComponentProps<typeof NextThemesProvider>) {
  React.useEffect(() => {
    patchConsoleErrorOnce();
  }, []);

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
