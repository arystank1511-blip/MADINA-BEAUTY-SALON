import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Appointment, clientName, Config, money, send } from './api';
import { ErrorBox, Modal } from './components';

export const methodNames = { CASH: 'наличные', KASPI: 'Kaspi QR' } as const;

/** «Оплачено 3 000 ₸ · Kaspi QR» once the payment is recorded. */
export function Paid({ a, config }: { a: Appointment; config: Config }) {
  if (a.paidMinor === null) return null;
  return (
    <span className="paid">
      Оплачено {money(a.paidMinor, config.currency)}
      {a.paymentMethod && ` · ${methodNames[a.paymentMethod]}`}
    </span>
  );
}

/** Records what the client actually paid and how; the visit becomes completed. */
export function PaymentDialog({
  a,
  config,
  onClose,
}: {
  a: Appointment;
  config: Config;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [amount, setAmount] = useState(String((a.paidMinor ?? a.priceMinor) / 100));
  const paidMinor = Math.round(Number(amount.replace(/\s/g, '').replace(',', '.')) * 100);
  const valid = amount.trim() !== '' && Number.isFinite(paidMinor) && paidMinor >= 0;
  const save = useMutation({
    mutationFn: (paymentMethod: 'CASH' | 'KASPI') =>
      send(`/admin/appointments/${a.id}/payment`, 'PATCH', { paidMinor, paymentMethod }),
    onSuccess: () => {
      for (const key of ['day', 'appointments', 'stats', 'growth'])
        void client.invalidateQueries({ queryKey: [key] });
      onClose();
    },
  });
  const submit = (method: 'CASH' | 'KASPI') => (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate(method);
  };
  return (
    <Modal title="Оплата" onClose={() => !save.isPending && onClose()}>
      <p>
        {clientName(a)} · {a.serviceName}
        <br />
        <small>По прайсу: от {money(a.priceMinor, config.currency)}</small>
      </p>
      <form className="payment-form" onSubmit={submit('CASH')}>
        <label>
          Сумма, ₸
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {save.error && <ErrorBox error={save.error} />}
        <div className="payment-buttons">
          <button className="md-btn yes" disabled={!valid || save.isPending}>
            Наличные
          </button>
          <button
            type="button"
            className="md-btn kaspi"
            disabled={!valid || save.isPending}
            onClick={submit('KASPI')}
          >
            Kaspi QR
          </button>
        </div>
      </form>
    </Modal>
  );
}
