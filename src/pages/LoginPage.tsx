import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, LockKeyhole, Shield, Swords, Target } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const getRedirectPath = (state: unknown) => {
  if (state && typeof state === 'object' && 'from' in state) {
    const from = (state as { from?: unknown }).from;

    if (typeof from === 'string' && from.startsWith('/')) {
      return from;
    }
  }

  return '/';
};

const LoginPage = () => {
  const { isLoading, session, signIn, signUp } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const redirectPath = useMemo(() => getRedirectPath(location.state), [location.state]);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && session) {
      navigate(redirectPath, { replace: true });
    }
  }, [isLoading, navigate, redirectPath, session]);

  const handleModeChange = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode);
    setPassword('');
    setPasswordConfirm('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === 'signup') {
      if (password.length < 8) {
        toast({
          title: '비밀번호가 너무 짧습니다.',
          description: '8자 이상으로 입력하세요.',
          variant: 'destructive',
        });
        return;
      }

      if (password !== passwordConfirm) {
        toast({
          title: '비밀번호가 일치하지 않습니다.',
          description: '확인 입력값을 다시 확인하세요.',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }

      navigate(redirectPath, { replace: true });
    } catch (error) {
      toast({
        title: mode === 'signin' ? '로그인 실패' : '회원가입 실패',
        description: error instanceof Error ? error.message : '이메일과 비밀번호를 확인하세요.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen bg-background px-4 py-8 xl:grid-cols-[minmax(0,1fr)_500px] xl:p-0">
      <section className="arena-surface data-grid hidden min-h-screen flex-col justify-between border-r border-border/70 p-8 xl:flex">
        <div className="flex items-center gap-3">
          <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Swords className="h-5 w-5" />
          </div>
          <div className="relative z-10">
            <p className="text-sm font-semibold">Overwatch Tracker</p>
            <p className="text-xs text-muted-foreground">Private match intelligence</p>
          </div>
        </div>

        <div className="relative z-10 max-w-3xl">
          <p className="metric-label">세션 콕핏</p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-normal">
            입력은 빠르게, 판단은 선명하게.
          </h1>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            <div className="surface-panel interactive-lift p-4">
              <Target className="h-5 w-5 text-primary" />
              <p className="mt-5 text-2xl font-semibold">--</p>
              <p className="metric-label mt-2">승률</p>
            </div>
            <div className="surface-panel interactive-lift p-4">
              <BarChart3 className="h-5 w-5 text-[hsl(var(--warning))]" />
              <p className="mt-5 text-2xl font-semibold">0</p>
              <p className="metric-label mt-2">경기</p>
            </div>
            <div className="surface-panel interactive-lift p-4">
              <Shield className="h-5 w-5 text-[hsl(var(--success))]" />
              <p className="mt-5 text-2xl font-semibold">Solo</p>
              <p className="metric-label mt-2">기본 큐</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 max-w-xl text-sm leading-6 text-muted-foreground">
          Private match log
        </p>
      </section>

      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center xl:min-h-screen">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center gap-3 xl:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Swords className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold">Overwatch Tracker</p>
              <p className="text-xs text-muted-foreground">Private match log</p>
            </div>
          </div>
          <div className="workspace-panel overflow-hidden">
            <div className="border-b border-border/70 bg-card p-6">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-semibold leading-none tracking-normal">
                {mode === 'signin' ? '로그인' : '회원가입'}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">개인 계정</p>
            </div>
            <div className="p-5 sm:p-6">
              <div className="mb-5 grid grid-cols-2 rounded-lg border border-border/70 bg-secondary p-1">
                {[
                  ['signin', '로그인'],
                  ['signup', '회원가입'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleModeChange(value as 'signin' | 'signup')}
                    className={cn(
                      'tap-target h-10 rounded-md text-sm font-semibold text-muted-foreground',
                      mode === value && 'bg-card text-foreground',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form className="grid gap-4" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    disabled={isSubmitting}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">비밀번호</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    minLength={mode === 'signin' ? 6 : 8}
                    disabled={isSubmitting}
                    required
                  />
                </div>
                {mode === 'signup' ? (
                  <div className="grid gap-2">
                    <Label htmlFor="password-confirm">비밀번호 확인</Label>
                    <Input
                      id="password-confirm"
                      type="password"
                      value={passwordConfirm}
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      disabled={isSubmitting}
                      required
                    />
                    <p className="text-xs font-semibold leading-relaxed text-muted-foreground">
                      가입 후 커뮤니티에서 사용할 닉네임은 로그인 후 설정합니다.
                    </p>
                  </div>
                ) : null}
                <Button
                  size="lg"
                  type="submit"
                  disabled={
                    isSubmitting || !email || !password || (mode === 'signup' && !passwordConfirm)
                  }
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === 'signin' ? '로그인' : '계정 만들기'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export { LoginPage };
