/** Kazakhstan number in international form (7XXXXXXXXXX) for wa.me links, or ''. */
export const intlPhone = (phone: string | null | undefined) => {
  const d = (phone || '').replace(/\D/g, '');
  if (d.length === 10) return '7' + d;
  if (d.length === 11 && d.startsWith('8')) return '7' + d.slice(1);
  return d.length >= 11 ? d : '';
};
