import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api, send } from './api';
import { ErrorBox, Modal } from './components';
import { useT } from './i18n';

export interface Photo {
  id: string;
  caption: string;
  width: number;
  height: number;
}
export const photoUrl = (id: string) => `/api/v1/gallery/${id}`;
export function usePromo() {
  return useQuery({
    queryKey: ['promo'],
    queryFn: () =>
      api<{ promo: { text: string; until: string | null } | null }>('/promo').then((r) => r.promo),
    staleTime: 5 * 60000,
  });
}
/** Offers the owner switched on in the admin; the site mentions no discount otherwise. */
export function useOffers() {
  return useQuery({
    queryKey: ['offers'],
    queryFn: () =>
      api<{
        loyalty: { every: number; reward: string } | null;
        birthdayDiscount: number | null;
      }>('/offers'),
    staleTime: 5 * 60000,
  });
}
export function useGallery() {
  return useQuery({ queryKey: ['gallery'], queryFn: () => api<Photo[]>('/gallery') });
}

/** The salon's current offer, edited in the admin «Сайт» tab. */
export function PromoBanner() {
  const promo = usePromo();
  if (!promo.data) return null;
  return (
    <aside className="promo-banner" role="note">
      <Sparkles aria-hidden="true" size={18} />
      <span>{promo.data.text}</span>
    </aside>
  );
}

/** Photos of work in a grid; a tap opens the photo large. */
export function Gallery({ photos }: { photos: Photo[] }) {
  const [open, setOpen] = useState<Photo | null>(null);
  const { t } = useT();
  return (
    <>
      <div className="gallery-grid">
        {photos.map((p) => (
          <button key={p.id} className="gallery-item" onClick={() => setOpen(p)}>
            <img
              src={photoUrl(p.id)}
              alt={p.caption || t('Работа мастера')}
              width={p.width}
              height={p.height}
              loading="lazy"
            />
            {p.caption && <span>{p.caption}</span>}
          </button>
        ))}
      </div>
      {open && (
        <Modal title={open.caption || t('Работа мастера')} onClose={() => setOpen(null)}>
          <img
            className="gallery-full"
            src={photoUrl(open.id)}
            alt={open.caption || t('Работа мастера')}
          />
        </Modal>
      )}
    </>
  );
}

/** Phone photos are large: scale to ≤ 1600 px and JPEG so an upload stays well under 1 MB. */
async function shrink(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale),
    height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (blob && (blob.size < 900000 || quality === 0.55)) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { data: btoa(binary), mime: 'image/jpeg', width, height };
    }
  }
  throw new Error('Не удалось обработать фото.');
}

/** Button that opens the camera or gallery and puts the photo on the site. */
export function PhotoUpload({ className = 'button', label = '📷 Добавить фото работы' }) {
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(0);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const upload = useMutation({
    mutationFn: async (f: File) =>
      send('/admin/gallery', 'POST', { ...(await shrink(f)), caption }),
    onSuccess: () => {
      setFile(null);
      setCaption('');
      setDone((n) => n + 1);
      void client.invalidateQueries({ queryKey: ['gallery'] });
    },
  });
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            upload.reset();
            setFile(f);
          }
        }}
      />
      {done > 0 && !file && (
        <p role="status" className="price-saved">
          Фото добавлено на сайт.
        </p>
      )}
      {file && (
        <Modal title="Фото на сайт" onClose={() => !upload.isPending && setFile(null)}>
          <form
            className="payment-form"
            onSubmit={(e) => {
              e.preventDefault();
              upload.mutate(file);
            }}
          >
            <img className="gallery-full" src={preview} alt="" />
            <label>
              Подпись (необязательно)
              <input
                maxLength={200}
                placeholder="Например: каре и окрашивание"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
            {upload.error && <ErrorBox error={upload.error} />}
            <button className="md-btn yes" disabled={upload.isPending}>
              {upload.isPending ? 'Загружаем…' : 'Добавить на сайт'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
