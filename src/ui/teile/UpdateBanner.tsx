// Banner für Update-Meldungen: liegt über der Seite (position: fixed), blendet weich ein und aus.
import { useEffect, useState } from 'react';
import { useUpdate, verstecke } from '../../pwa';

export function UpdateBanner() {
  const b = useUpdate();
  const [montiert, setMontiert] = useState(false);
  const [an, setAn] = useState(false);
  useEffect(() => {
    if (b.an) { setMontiert(true); requestAnimationFrame(() => requestAnimationFrame(() => setAn(true))); }
    else { setAn(false); const t = setTimeout(() => setMontiert(false), 380); return () => clearTimeout(t); }
  }, [b.an, b.schluessel]);
  if (!montiert) return null;
  const lage = b.unten ? 'bottom-[max(env(safe-area-inset-bottom),12px)]' : 'top-[max(env(safe-area-inset-top),12px)]';
  return (
    <div role="status" onClick={() => b.art === 'info' && verstecke()}
      className={`fixed left-3 right-3 ${lage} z-50 flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl shadow-2xl transition-opacity duration-300
        ${an ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${b.art === 'update' ? 'bg-[#34c759] text-[#06240e] font-semibold' : 'bg-[#2d2d33] text-[#f2f2f7]'}`}>
      <span>{b.text}</span>
      {b.art === 'update' && <button className="rounded-xl bg-[#06240e] text-white px-3.5 py-2 font-semibold" onClick={() => location.reload()}>Jetzt laden</button>}
    </div>
  );
}
