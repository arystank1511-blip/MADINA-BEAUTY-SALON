import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Config, send, User } from '../api';
import { Arrow, ErrorBox } from '../components';
const schema = z.object({
  name: z.string().optional(),
  email: z.email('Введите корректный email'),
  password: z.string().min(10, 'Не менее 10 символов').max(128, 'Не более 128 символов'),
});
export function Auth({ config, register = false }: { config: Config; register?: boolean }) {
  const [visible, setVisible] = useState(false),
    [error, setError] = useState<unknown>(null);
  const [params] = useSearchParams();
  const nav = useNavigate(),
    client = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const raw = params.get('returnTo');
  let returnTo = '/my';
  try {
    const destination = new URL(raw || '/my', window.location.origin);
    if (destination.origin === window.location.origin)
      returnTo = destination.pathname + destination.search + destination.hash;
  } catch {
    // An invalid address from a shared link must not prevent signing in.
  }
  async function submit(data: z.infer<typeof schema>) {
    if (register && (!data.name || data.name.trim().length < 2)) {
      form.setError('name', { message: 'Введите имя, не менее 2 символов' });
      return;
    }
    setError(null);
    try {
      const user = await send<User>(
        register ? '/auth/register' : '/auth/login',
        'POST',
        register ? data : { email: data.email, password: data.password },
      );
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
        <p className="eyebrow">ВАШЕ ПРОСТРАНСТВО / {config.name}</p>
        <h1>
          Хорошо
          <br />
          снова
          <br />
          <span>увидеться.</span>
        </h1>
        <p>
          Все ваши посещения в одном месте.
          <br />
          Выбирайте время. Меняйте планы.
        </p>
      </div>
      <div className="auth-card">
        <p className="eyebrow">{register ? 'НОВЫЙ АККАУНТ' : 'ЛИЧНЫЙ КАБИНЕТ'}</p>
        <h2>{register ? 'Знакомимся?' : 'С возвращением.'}</h2>
        <p>
          {register
            ? 'Создайте аккаунт для первой записи.'
            : 'Войдите, чтобы записаться или управлять посещениями.'}
        </p>
        <form onSubmit={form.handleSubmit(submit)} noValidate>
          {register && (
            <label>
              Имя
              <input autoComplete="given-name" {...form.register('name')} />
              {form.formState.errors.name && (
                <small className="field-error">{form.formState.errors.name.message}</small>
              )}
            </label>
          )}
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
                autoComplete={register ? 'new-password' : 'current-password'}
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
            {form.formState.isSubmitting ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}
            <Arrow />
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Уже знакомы?' : 'Первый раз у нас?'}{' '}
          <Link
            to={`${register ? '/login' : '/register'}?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {register ? 'Войти' : 'Создать аккаунт'}
          </Link>
        </p>
        {config.demo && (
          <details className="demo-access">
            <summary>Доступ для знакомства с демо</summary>
            <p>
              Клиент: client@forma.example
              <br />
              Администратор: admin@forma.example
              <br />
              Пароль: FormaDemo2026!
            </p>
          </details>
        )}
      </div>
    </section>
  );
}
