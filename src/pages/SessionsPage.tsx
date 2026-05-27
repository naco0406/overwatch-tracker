import { CalendarClock, Circle, Filter, Swords } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const sessionRows = Array.from({ length: 4 });
const sessionMetrics = [
  { icon: CalendarClock, label: '이번 주 세션', value: '0', detail: '기록 대기' },
  { icon: Swords, label: '평균 경기 수', value: '--', detail: '세션당' },
  { icon: Circle, label: '최장 흐름', value: '--', detail: '연승/연패' },
];

const SessionsPage = () => (
  <div className="flex flex-1 flex-col gap-6">
    <PageHeader
      eyebrow="기록"
      title="세션"
      actions={
        <Button variant="outline" className="bg-transparent">
          <Filter className="h-4 w-4" />
          필터
        </Button>
      }
    />

    <section className="workspace-panel overflow-hidden">
      <div className="grid border-b border-border md:grid-cols-3">
        {sessionMetrics.map((metric) => (
          <div
            key={metric.label}
            className="flex items-start justify-between gap-4 border-b border-border p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-5"
          >
            <div>
              <p className="metric-label">{metric.label}</p>
              <p className="mt-3 text-2xl font-bold">{metric.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
              <metric.icon className="h-5 w-5" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 p-4 sm:p-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="metric-label">타임라인</p>
              <h2 className="mt-2 text-xl font-bold">세션 타임라인</h2>
            </div>
            <Badge variant="secondary">0 경기</Badge>
          </div>
          <div className="field-surface p-4">
            <EmptyState
              icon={CalendarClock}
              title="세션 없음"
              description="아직 저장된 세션이 없습니다."
              className="relative z-10 min-h-[340px] bg-card/90"
            />
          </div>
        </div>

        <aside className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-[hsl(var(--surface-2))] p-4">
            <p className="metric-label">세션 카드</p>
            <h3 className="mt-2 text-lg font-bold">날짜별 기록</h3>
          </div>
          {sessionRows.map((_, index) => (
            <div key={index} className="flat-row flex items-center gap-3 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-xs font-bold text-muted-foreground">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="h-2.5 w-24 rounded-full bg-secondary" />
                <div className="mt-2 h-2 w-36 rounded-full bg-secondary/70" />
              </div>
            </div>
          ))}
        </aside>
      </div>
    </section>
  </div>
);

export { SessionsPage };
