import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Config, send, User } from '../api';
import { Arrow, ErrorBox } from '../components';
const schema = z.object({
  email: z.email('Введите корректный email'),
  password: z.string().min(10, 'Не менее 10 символов').max(128, 'Не более 128 символов'),
});
/** Staff sign-in only. Guests book through WhatsApp and never need an account. */
export function Auth({ config }: { config: Config }) {
  const [visible, setVisible] = useState(false),
    [error, setError] = useState<unknown>(null);
  const [params] = useSearchParams();
  const nav = useNavigate(),
    client = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const raw = params.get('returnTo');
  let returnTo = '/master';
  try {
    const destination = new URL(raw || '/master', window.location.origin);
    if (destination.origin === window.location.origin)
      returnTo = destination.pathname + destination.search + destination.hash;
  } catch {
    // An invalid address from a shared link must not prevent signing in.
  }
  async function submit(data: z.infer<typeof schema>) {
    setError(null);
    try {
      const user = await send<User>('/auth/login', 'POST', {
        email: data.email,
        password: data.password,
      });
      client.setQueryData(['me'], user);
      await client.invalidateQueries({ queryKey: ['availability'] });
      nav(returnTo, { replace: true });
    } catch (e) {
      setError(e);
    }
  }
  return (
    <section className="auth-page">
      <div className="auth-aside">
        <p className="eyebrow">ДЛЯ АДМИНИСТРАТОРА / {config.name}</p>
        <h1>
          Хорошо
          <br />
          снова
          <br />
          <span>увидеться.</span>
        </h1>
        <p>
          Записи, цены и расписание салона.
          <br />
          Клиенты записываются через WhatsApp.
        </p>
      </div>
      <div className="auth-card">
        <p className="eyebrow">УПРАВЛЕНИЕ</p>
        <h2>С возвращением.</h2>
        <p>Войдите, чтобы управлять записями и ценами.</p>
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          <label>
            Email
            <input type="email" autoComplete="email" {...form.register('email')} />
            {form.formState.errors.email && (
              <small className="field-error">{form.formState.errors.email.message}</small>
            )}
          </label>
          <label>
            Пароль
            <div className="password-wrap">
              <input
                type={visible ? 'text' : 'password'}
                autoComplete="current-password"
                {...form.register('password')}
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {form.formState.errors.password && (
              <small className="field-error">{form.formState.errors.password.message}</small>
            )}
          </label>
          {error != null && <ErrorBox error={error} />}
          <button className="button full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Подождите…' : 'Войти'}
            <Arrow />
          </button>
        </form>
      </div>
    </section>
  );
}
