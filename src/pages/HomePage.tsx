import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Clock3,
  Crosshair,
  FilePlus2,
  Flag,
  Map,
  Plus,
  ShieldCheck,
  Swords,
  TrendingUp,
} from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const emptySessionSlots = Array.from({ length: 6 });

const summaryMetrics = [
  {
    detail: '저장 대기',
    icon: CalendarDays,
    label: '오늘 경기',
    tone: 'text-primary bg-primary/10',
    value: '0',
  },
  {
    detail: '데이터 연결 전',
    icon: TrendingUp,
    label: '승률',
    tone: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.12)]',
    value: '--',
  },
  {
    detail: '세션 시작 전',
    icon: Activity,
    label: '현재 흐름',
    tone: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.14)]',
    value: '--',
  },
];

const reviewFields = [
  { label: '모드', value: '미선택' },
  { label: '맵', value: '미선택' },
  { label: '결과', value: '미선택' },
  { label: '스코어', value: '-- : --' },
  { label: '영웅', value: '미선택' },
];

const pipeline = [
  { label: '캡처', icon: Clipboard },
  { label: '확인', icon: CheckCircle2 },
  { label: '저장', icon: ShieldCheck },
];

const HomePage = () => (
  <div className="flex flex-1 flex-col gap-6">
    <PageHeader
      eyebrow="오늘"
      title="경기 기록"
      actions={
        <>
          <Button variant="outline" className="hidden sm:inline-flex" disabled>
            <Crosshair className="h-4 w-4" />
            OCR 분석
          </Button>
          <Button>
            <Plus className="h-4 w-4" />
            수기 입력
          </Button>
        </>
      }
    />

    <section className="workspace-panel overflow-hidden">
      <div className="grid border-b border-border 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid md:grid-cols-3">
          {summaryMetrics.map((metric) => (
            <div
              key={metric.label}
              className="flex min-h-[112px] items-start justify-between gap-4 border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-5"
            >
              <div>
                <p className="metric-label">{metric.label}</p>
                <p className="mt-3 text-3xl font-bold leading-none">{metric.value}</p>
                <p className="mt-2 text-xs text-muted-foreground">{metric.detail}</p>
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${metric.tone}`}
              >
                <metric.icon className="h-5 w-5" />
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border bg-[hsl(var(--surface-2))] p-4 sm:p-5 2xl:border-l 2xl:border-t-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="metric-label">기본값</p>
              <p className="mt-2 text-lg font-bold">역할 고정</p>
            </div>
            <span className="status-chip">
              <span className="status-dot" />
              Solo
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-r border-border p-3">
              <p className="metric-label">큐</p>
              <p className="mt-2 text-sm font-semibold">솔로</p>
            </div>
            <div className="p-3">
              <p className="metric-label">입력</p>
              <p className="mt-2 text-sm font-semibold">수기</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="p-4 sm:p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="metric-label">입력</p>
              <h2 className="mt-2 text-2xl font-bold tracking-normal">새 경기</h2>
            </div>
            <Badge
              variant="outline"
              className="hidden w-fit border-primary/25 bg-primary/5 text-primary sm:inline-flex"
            >
              OCR 준비
            </Badge>
          </div>

          <div className="field-surface flex min-h-[320px] items-center justify-center p-6 text-center sm:min-h-[380px]">
            <div className="relative z-10 w-full max-w-lg">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-primary/20 bg-card text-primary">
                <Clipboard className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-2xl font-bold tracking-normal">스코어보드 캡처</h3>
              <p className="mt-2 text-sm text-muted-foreground">입력 대기 중</p>

              <div className="mt-7 grid gap-2 sm:grid-cols-2">
                <Button size="lg">
                  <FilePlus2 className="h-4 w-4" />
                  수기 입력
                </Button>
                <Button size="lg" variant="outline" className="hidden sm:inline-flex" disabled>
                  <Crosshair className="h-4 w-4" />
                  OCR 분석
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid overflow-hidden rounded-lg border border-border sm:grid-cols-3">
            {pipeline.map((item, index) => (
              <div
                key={item.label}
                className="flat-row tap-target flex items-center gap-3 p-3 sm:border-b-0 sm:border-r sm:last:border-r-0"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">STEP {index + 1}</p>
                  <p className="text-sm font-semibold">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="border-t border-border bg-[hsl(var(--surface-2))] p-4 sm:p-5 2xl:border-l 2xl:border-t-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="metric-label">확인 패널</p>
              <h3 className="mt-2 text-lg font-bold">분석 대기</h3>
            </div>
            <span className="status-chip">
              <span className="status-dot" />
              Idle
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
            {reviewFields.map((field) => (
              <div
                key={field.label}
                className="flat-row flex items-center justify-between gap-3 p-3"
              >
                <span className="text-sm font-semibold text-muted-foreground">{field.label}</span>
                <span className="truncate text-sm font-semibold">{field.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-r border-border p-3">
              <Map className="h-4 w-4 text-primary" />
              <p className="metric-label mt-3">맵</p>
            </div>
            <div className="border-r border-border p-3">
              <Flag className="h-4 w-4 text-[hsl(var(--warning))]" />
              <p className="metric-label mt-3">결과</p>
            </div>
            <div className="p-3">
              <Clock3 className="h-4 w-4 text-[hsl(var(--success))]" />
              <p className="metric-label mt-3">세션</p>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section className="workspace-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
        <div>
          <p className="metric-label">세션</p>
          <h2 className="mt-2 text-lg font-bold tracking-normal">오늘 세션</h2>
        </div>
        <Badge variant="secondary">0 경기</Badge>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-3">
          {emptySessionSlots.map((_, index) => (
            <div
              key={index}
              className="flex h-14 items-center justify-center rounded-md border border-dashed border-border bg-secondary/40 text-xs font-semibold text-muted-foreground"
            >
              {index + 1}
            </div>
          ))}
        </div>
        <EmptyState
          icon={Swords}
          title="저장된 경기 없음"
          description="아직 오늘 세션에 저장된 경기가 없습니다."
          className="min-h-[180px]"
          action={
            <Button variant="outline" className="bg-transparent">
              <Plus className="h-4 w-4" />
              경기 추가
            </Button>
          }
        />
      </div>
    </section>
  </div>
);

export { HomePage };
