import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Crosshair, Loader2, LockKeyhole, Shield, Swords, Target } from 'lucide-react';
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

const loginFeatureCards = [
  {
    description: '맵, 영웅, 결과를 한 화면에서 빠르게 저장',
    icon: Target,
    label: '빠른 기록',
  },
  {
    description: '전장, 모드, 영웅별 흐름을 자동으로 집계',
    icon: BarChart3,
    label: '전적 분석',
  },
  {
    description: '블리자드 공식 통계로 픽률, 벤률, 승률을 비교',
    icon: Swords,
    label: '영웅 메타',
  },
] as const;

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
    <main className="relative min-h-screen overflow-hidden bg-[hsl(var(--ow-navy))]">
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        src="/assets/overwatch/maps/numbani.jpg"
      />
      <div className="absolute inset-0 bg-slate-950/35" />
      <div className="relative grid min-h-screen xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="ow-nav-surface hidden min-h-screen flex-col justify-between border-r border-white/10 p-8 xl:flex xl:[clip-path:polygon(0_0,100%_0,92%_100%,0_100%)] 2xl:p-10">
          <div className="flex items-center gap-3">
            <div className="ow-brand-mark relative z-10 flex h-12 w-12 items-center justify-center bg-accent text-accent-foreground">
              <Crosshair className="h-6 w-6" />
            </div>
            <div className="relative z-10">
              <p className="text-base font-black text-white">OW TRACKER</p>
              <p className="text-xs font-bold text-white/45">전적 · 메타 · e스포츠</p>
            </div>
          </div>

          <div className="relative z-10 max-w-3xl">
            <p className="metric-label text-primary">오버워치 데이터</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-black leading-[1.08] tracking-normal text-white 2xl:text-5xl">
              내 전적과 지금의 메타를 한곳에서.
            </h1>
            <div className="mt-8 grid max-w-2xl gap-px overflow-hidden border-y border-white/10 bg-white/10">
              {loginFeatureCards.map((feature) => (
                <div
                  key={feature.label}
                  className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-4 bg-[hsl(var(--ow-navy))] p-4"
                >
                  <div className="ow-game-icon-shell h-11 w-11 bg-primary">
                    <div className="ow-game-icon-core bg-[hsl(var(--ow-navy))] text-primary">
                      <feature.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-white">{feature.label}</p>
                    <p className="mt-1 text-xs font-semibold leading-relaxed text-white/50">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex max-w-xl items-center gap-3 border-l-4 border-accent bg-white/8 p-4">
            <Shield className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-semibold leading-6 text-white/55">
              개인 기록은 로그인한 계정에만 연결됩니다. 가입 후 배틀태그와 닉네임을 설정할 수
              있습니다.
            </p>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 xl:px-10">
          <div className="w-full max-w-md">
            <div className="mb-4 flex items-center gap-3 xl:hidden">
              <div className="ow-brand-mark flex h-11 w-11 items-center justify-center bg-accent text-accent-foreground">
                <Crosshair className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black text-white">OW TRACKER</p>
                <p className="text-xs font-bold text-white/55">전적 · 메타 · e스포츠</p>
              </div>
            </div>
            <div className="workspace-panel ow-panel-cap overflow-hidden shadow-[0_26px_70px_-28px_rgb(2_6_23/0.9)]">
              <div className="border-b border-white/10 bg-[hsl(var(--ow-navy))] p-6 text-white">
                <div className="ow-game-icon-shell mb-3 h-11 w-11 bg-accent">
                  <div className="ow-game-icon-core bg-[hsl(var(--ow-ink))] text-white">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                </div>
                <h1 className="text-2xl font-black leading-none tracking-normal">
                  {mode === 'signin' ? '로그인' : '회원가입'}
                </h1>
                <p className="mt-1.5 text-sm font-semibold text-white/45">개인 계정</p>
              </div>
              <div className="p-5 sm:p-6">
                <div className="mb-5 grid grid-cols-2 rounded-[3px] border border-border bg-secondary p-1">
                  {[
                    ['signin', '로그인'],
                    ['signup', '회원가입'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleModeChange(value as 'signin' | 'signup')}
                      className={cn(
                        'tap-target h-10 rounded-[2px] border-b-2 border-transparent text-sm font-bold text-muted-foreground',
                        mode === value && 'border-accent bg-card text-foreground shadow-sm',
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
      </div>
    </main>
  );
};

export { LoginPage };
