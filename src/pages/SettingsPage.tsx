import type { LucideIcon } from 'lucide-react';
import {
  Database,
  Download,
  LogOut,
  Map,
  ScanLine,
  ShieldCheck,
  Swords,
  Upload,
} from 'lucide-react';

import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

const SettingsPage = () => {
  const { signOut, user } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      toast({
        title: '로그아웃 실패',
        description: error instanceof Error ? error.message : '잠시 후 다시 시도하세요.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <PageHeader eyebrow="설정" title="설정" />

      <section className="workspace-panel overflow-hidden">
        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={ShieldCheck} label="계정" title="계정" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 rounded-md border border-border bg-secondary p-3 sm:min-w-[320px]">
              <p className="metric-label">이메일</p>
              <p className="mt-1 truncate text-sm font-semibold">{user?.email}</p>
            </div>
            <Button variant="outline" className="bg-transparent" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          </div>
        </div>

        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={Swords} label="마스터 데이터" title="영웅" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">영웅 표시명과 역할 기준</p>
            <Button variant="outline" className="bg-transparent sm:w-auto" disabled>
              편집
            </Button>
          </div>
        </div>

        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={Map} label="마스터 데이터" title="맵" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">맵과 모드 매핑</p>
            <Button variant="outline" className="bg-transparent sm:w-auto" disabled>
              편집
            </Button>
          </div>
        </div>

        <div className="flat-row grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={ScanLine} label="OCR" title="보정" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">스코어보드 ROI 보정</p>
            <Button variant="outline" className="bg-transparent sm:w-auto" disabled>
              <Upload className="h-4 w-4" />
              스크린샷 업로드
            </Button>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
          <SectionLead icon={Database} label="데이터" title="데이터" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="bg-transparent" disabled>
              <Upload className="h-4 w-4" />
              가져오기
            </Button>
            <Button variant="outline" className="bg-transparent" disabled>
              <Download className="h-4 w-4" />
              내보내기
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

interface SectionLeadProps {
  icon: LucideIcon;
  label: string;
  title: string;
}

const SectionLead = ({ icon: Icon, label, title }: SectionLeadProps) => (
  <div className="flex items-center gap-3">
    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="metric-label">{label}</p>
      <h2 className="mt-1 text-lg font-bold">{title}</h2>
    </div>
  </div>
);

export { SettingsPage };
