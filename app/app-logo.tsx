import { base } from '@/lib/client';

export default function AppLogo({ className = 'auth-logo' }: { className?: string }) {
  return <span className={className}><img src={`${base}bus-logo.png`} alt="OnRoute bus tracker logo" width={512} height={512}/></span>;
}
