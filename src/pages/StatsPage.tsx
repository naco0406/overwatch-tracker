import type { LucideIcon } from 'lucide-react';
import { BarChart3, Clock3, Filter, ListOrdered, Map, Swords, Target } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const filterChips = ['기간', '모드', '맵', '계정', '큐', '영웅'];
const statMetrics = [
  { icon: BarChart3, label: '전체 경기', value: '0', detail: '기록 대기' },
  { icon: Target, label: '승률', value: '--', detail: '전체' },
  { icon: Map, label: '맵 수', value: '--', detail: '기록된 맵' },
  { icon: Clock3, label: '피크 시간', value: '--', detail: '시간대' },
];

const StatsPage = () => (
  <div className="flex flex-1 flex-col gap-6">
    <PageHeader
      eyebrow="분석"
      title="통계"
      actions={
        <Button variant="outline" className="bg-transparent">
          <Filter className="h-4 w-4" />
          필터
        </Button>
      }
    />

    <section className="workspace-panel overflow-hidden">
      <div className="grid border-b border-border md:grid-cols-4">
        {statMetrics.map((metric) => (
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

      <div className="space-y-5 p-4 sm:p-5">
        <div className="mobile-scroll -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {filterChips.map((chip) => (
            <button key={chip} className="status-chip tap-target shrink-0 hover:border-primary/25">
              <span className="status-dot" />
              {chip}
            </button>
          ))}
        </div>

        <Tabs defaultValue="mode" className="w-full">
          <TabsList className="mobile-scroll flex w-full justify-start overflow-x-auto xl:inline-flex xl:w-auto">
            <TabsTrigger value="mode">모드</TabsTrigger>
            <TabsTrigger value="map">맵</TabsTrigger>
            <TabsTrigger value="hero">영웅</TabsTrigger>
            <TabsTrigger value="time">시간</TabsTrigger>
            <TabsTrigger value="order">순서</TabsTrigger>
          </TabsList>

          <TabsContent value="mode" className="mt-4">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <p className="metric-label">모드 분포</p>
                <h2 className="mt-2 text-xl font-bold">모드별 통계</h2>
              </div>
              <div className="grid gap-5 p-4 sm:p-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="field-surface flex min-h-[280px] items-end gap-3 p-5">
                  {[36, 58, 42, 70, 48, 62, 54].map((height, index) => (
                    <div key={index} className="relative z-10 flex flex-1 items-end">
                      <div
                        className="w-full rounded-t-md border border-dashed border-primary/20 bg-card/85"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>
                <EmptyState
                  icon={BarChart3}
                  title="분석할 경기 없음"
                  description="아직 분석할 경기 데이터가 없습니다."
                  className="min-h-[280px]"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="map" className="mt-4">
            <TabEmpty icon={Map} label="맵 분포" title="맵별 통계" emptyTitle="맵 기록 없음" />
          </TabsContent>
          <TabsContent value="hero" className="mt-4">
            <TabEmpty
              icon={Swords}
              label="영웅 풀"
              title="영웅별 통계"
              emptyTitle="영웅 기록 없음"
            />
          </TabsContent>
          <TabsContent value="time" className="mt-4">
            <TabEmpty
              icon={Clock3}
              label="시간대"
              title="시간대별 통계"
              emptyTitle="시간대 기록 없음"
            />
          </TabsContent>
          <TabsContent value="order" className="mt-4">
            <TabEmpty
              icon={ListOrdered}
              label="세션 순서"
              title="세션 내 순서별 통계"
              emptyTitle="순서 기록 없음"
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  </div>
);

interface TabEmptyProps {
  emptyTitle: string;
  icon: LucideIcon;
  label: string;
  title: string;
}

const TabEmpty = ({ emptyTitle, icon: Icon, label, title }: TabEmptyProps) => (
  <div className="overflow-hidden rounded-lg border border-border bg-card">
    <div className="border-b border-border p-4">
      <p className="metric-label">{label}</p>
      <h2 className="mt-2 text-xl font-bold">{title}</h2>
    </div>
    <div className="p-4 sm:p-5">
      <EmptyState
        icon={Icon}
        title={emptyTitle}
        description="아직 분석할 경기 데이터가 없습니다."
      />
    </div>
  </div>
);

export { StatsPage };
