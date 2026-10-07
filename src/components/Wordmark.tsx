/** "Wardrobe to Wallet" in the logo's pink and teal */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-script leading-none whitespace-nowrap ${className}`}>
      <span className="text-brand-500">Wardrobe</span>
      <span className="mx-1 text-[0.6em] text-slate-700 dark:text-slate-300">to</span>
      <span className="text-emerald-400">Wallet</span>
    </span>
  );
}
