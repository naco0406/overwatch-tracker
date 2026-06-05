import type { MapOption } from '@/data/matchOptions';
import type { LiveVisionAnalysis, LiveVisionProbe } from '@/lib/liveVision';
import type { VisionScreenType } from '@/lib/visionPipelineCore';

export const liveFrameSchedule = {
  confirmProbeIntervalMs: 125,
  heavyVisionIntervalMs: 700,
  observingVisionIntervalMs: 2_500,
  ocrCooldownMs: 1_800,
  probeIntervalMs: 250,
  stableMapSelectionTtlMs: 2_600,
  stableWindowMs: 1_500,
} as const;

export type LiveSceneClassifierEngine = 'custom-model-ready' | 'heuristic-v1';

export type LiveScenePhase =
  | 'confirming-map-selection'
  | 'observing'
  | 'stable-map-selection'
  | 'suspecting-map-selection';

export interface LiveSceneSnapshot {
  cadenceLabel: string;
  classifier: LiveSceneClassifierEngine;
  confidence: number;
  lastChangedAt: string | null;
  phase: LiveScenePhase;
  stableMapCandidateIds: MapOption['value'][];
  stableScreenType: VisionScreenType;
  windowSize: number;
}

export interface LiveFrameAnalysisPlan {
  includeOcr: boolean;
  shouldProbe: boolean;
  shouldRunVision: boolean;
}

export interface LiveSceneClassifier<TFrame> {
  classify: (frame: TFrame) => LiveVisionProbe | Promise<LiveVisionProbe>;
  id: LiveSceneClassifierEngine;
  input: 'canvas' | 'image-bitmap' | 'tensor';
}

interface TimedProbe {
  confidence: number;
  observedAt: number;
  screenCandidate: VisionScreenType;
}

interface TimedMapSelection {
  confidence: number;
  mapCandidates: {
    confidence: number;
    mapId: MapOption['value'];
    margin: number;
    slot: string;
    textEvidenceCount: number;
  }[];
  observedAt: number;
}

export interface LiveSceneRuntimeState {
  classifier: LiveSceneClassifierEngine;
  lastOcrAt: number;
  lastPhaseChangedAt: number;
  lastProbeAt: number;
  lastVisionAt: number;
  phase: LiveScenePhase;
  recentMapSelections: TimedMapSelection[];
  recentProbes: TimedProbe[];
  stableMapCandidateIds: MapOption['value'][];
  stableScreenType: VisionScreenType;
}

const mapSelectionProbeThreshold = 0.5;
const mapSelectionConfirmThreshold = 0.66;

export const createLiveSceneRuntimeState = (): LiveSceneRuntimeState => ({
  classifier: 'heuristic-v1',
  lastOcrAt: 0,
  lastPhaseChangedAt: 0,
  lastProbeAt: 0,
  lastVisionAt: 0,
  phase: 'observing',
  recentMapSelections: [],
  recentProbes: [],
  stableMapCandidateIds: [],
  stableScreenType: 'unknown',
});

const pruneByAge = <TItem extends { observedAt: number }>(
  items: TItem[],
  now: number,
  ttlMs: number,
) => items.filter((item) => now - item.observedAt <= ttlMs);

const setPhase = (state: LiveSceneRuntimeState, phase: LiveScenePhase, now: number) => {
  if (state.phase === phase) {
    return;
  }

  state.phase = phase;
  state.lastPhaseChangedAt = now;
};

const getRecentMapSelectionConfidence = (state: LiveSceneRuntimeState) => {
  if (state.recentMapSelections.length === 0) {
    return 0;
  }

  return Math.max(...state.recentMapSelections.map((selection) => selection.confidence));
};

const getMapSelectionProbeConfidence = (state: LiveSceneRuntimeState) => {
  const mapProbes = state.recentProbes.filter((probe) => probe.screenCandidate === 'map_selection');

  if (mapProbes.length === 0) {
    return 0;
  }

  return mapProbes.reduce((sum, probe) => sum + probe.confidence, 0) / mapProbes.length;
};

export const getLiveFrameAnalysisPlan = (
  state: LiveSceneRuntimeState,
  now: number,
  visionInFlight: boolean,
): LiveFrameAnalysisPlan => {
  const probeInterval =
    state.phase === 'suspecting-map-selection' || state.phase === 'confirming-map-selection'
      ? liveFrameSchedule.confirmProbeIntervalMs
      : liveFrameSchedule.probeIntervalMs;
  const shouldProbe = now - state.lastProbeAt >= probeInterval;
  const visionInterval =
    state.phase === 'observing'
      ? liveFrameSchedule.observingVisionIntervalMs
      : state.phase === 'stable-map-selection'
        ? liveFrameSchedule.heavyVisionIntervalMs * 2
        : liveFrameSchedule.heavyVisionIntervalMs;
  const shouldRunVision =
    !visionInFlight &&
    shouldProbe &&
    state.phase !== 'observing' &&
    now - state.lastVisionAt >= visionInterval;
  const includeOcr =
    shouldRunVision &&
    state.phase !== 'suspecting-map-selection' &&
    now - state.lastOcrAt >= liveFrameSchedule.ocrCooldownMs;

  return {
    includeOcr,
    shouldProbe,
    shouldRunVision,
  };
};

export const reduceLiveProbe = (
  state: LiveSceneRuntimeState,
  probe: LiveVisionProbe,
  now: number,
) => {
  state.lastProbeAt = now;
  state.recentProbes = pruneByAge(
    [
      ...state.recentProbes,
      {
        confidence: probe.confidence,
        observedAt: now,
        screenCandidate: probe.screenCandidate,
      },
    ],
    now,
    liveFrameSchedule.stableWindowMs,
  );

  const mapProbeCount = state.recentProbes.filter(
    (recentProbe) =>
      recentProbe.screenCandidate === 'map_selection' &&
      recentProbe.confidence >= mapSelectionProbeThreshold,
  ).length;
  const probeConfidence = getMapSelectionProbeConfidence(state);

  if (mapProbeCount >= 2 && probeConfidence >= mapSelectionConfirmThreshold) {
    setPhase(state, 'confirming-map-selection', now);
    return;
  }

  if (probe.screenCandidate === 'map_selection' && probe.confidence >= mapSelectionProbeThreshold) {
    setPhase(state, 'suspecting-map-selection', now);
    return;
  }

  if (state.phase !== 'stable-map-selection') {
    setPhase(state, 'observing', now);
  }
};

const getStableMapCandidateIds = (selections: TimedMapSelection[]): MapOption['value'][] => {
  const slots = ['left', 'center', 'right'];

  return slots
    .map((slot) => {
      const scores = new Map<MapOption['value'], number>();

      for (const selection of selections) {
        for (const candidate of selection.mapCandidates.filter((item) => item.slot === slot)) {
          const confidenceScore =
            candidate.confidence * 1.2 +
            candidate.margin * 14 +
            selection.confidence * 0.6 +
            candidate.textEvidenceCount * 0.35;

          scores.set(candidate.mapId, (scores.get(candidate.mapId) ?? 0) + confidenceScore);
        }
      }

      return [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
    })
    .filter((mapId): mapId is MapOption['value'] => Boolean(mapId));
};

export const reduceLiveVisionAnalysis = (
  state: LiveSceneRuntimeState,
  analysis: LiveVisionAnalysis,
  now: number,
  options: { includedOcr: boolean },
) => {
  state.lastVisionAt = now;

  if (options.includedOcr) {
    state.lastOcrAt = now;
  }

  if (analysis.screen.screenType !== 'map_selection' || !analysis.mapSelection) {
    state.recentMapSelections = pruneByAge(
      state.recentMapSelections,
      now,
      liveFrameSchedule.stableMapSelectionTtlMs,
    );

    if (now - state.lastPhaseChangedAt > liveFrameSchedule.stableMapSelectionTtlMs) {
      state.stableMapCandidateIds = [];
      state.stableScreenType = analysis.screen.screenType;
      setPhase(state, 'observing', now);
    }

    return;
  }

  state.recentMapSelections = pruneByAge(
    [
      ...state.recentMapSelections,
      {
        confidence: analysis.screen.confidence,
        mapCandidates: analysis.mapSelection.candidates.map((candidate) => ({
          confidence: candidate.confidence,
          mapId: candidate.mapId as MapOption['value'],
          margin: candidate.margin,
          slot: candidate.slot,
          textEvidenceCount: analysis.mapSelection?.textEvidenceCount ?? 0,
        })),
        observedAt: now,
      },
    ],
    now,
    liveFrameSchedule.stableMapSelectionTtlMs,
  );

  const stableCandidates = getStableMapCandidateIds(state.recentMapSelections);

  if (stableCandidates.length >= 2 && getRecentMapSelectionConfidence(state) >= 0.78) {
    state.stableMapCandidateIds = stableCandidates;
    state.stableScreenType = 'map_selection';
    setPhase(state, 'stable-map-selection', now);
    return;
  }

  state.stableScreenType = 'map_selection';
  setPhase(state, 'confirming-map-selection', now);
};

export const getLiveSceneSnapshot = (
  state: LiveSceneRuntimeState,
  now: number,
): LiveSceneSnapshot => {
  const confidence =
    state.phase === 'stable-map-selection'
      ? getRecentMapSelectionConfidence(state)
      : Math.max(getMapSelectionProbeConfidence(state), getRecentMapSelectionConfidence(state));
  const cadenceLabel =
    state.phase === 'observing'
      ? '저비용 감시'
      : state.phase === 'stable-map-selection'
        ? '안정 추적'
        : '짧은 버스트';

  return {
    cadenceLabel,
    classifier: state.classifier,
    confidence,
    lastChangedAt: state.lastPhaseChangedAt
      ? new Date(Date.now() - Math.max(0, now - state.lastPhaseChangedAt)).toISOString()
      : null,
    phase: state.phase,
    stableMapCandidateIds: state.stableMapCandidateIds,
    stableScreenType: state.stableScreenType,
    windowSize: state.recentProbes.length + state.recentMapSelections.length,
  };
};

export const createStableMapSelectionAnalysis = (
  analysis: LiveVisionAnalysis,
  stableMapCandidateIds: MapOption['value'][],
): LiveVisionAnalysis => {
  if (
    analysis.screen.screenType !== 'map_selection' ||
    !analysis.mapSelection ||
    stableMapCandidateIds.length === 0
  ) {
    return analysis;
  }

  const stableBySlot = new Map(
    ['left', 'center', 'right'].map((slot, index) => [slot, stableMapCandidateIds[index]]),
  );
  const candidates = analysis.mapSelection.candidates.map((candidate) => {
    const stableMapId = stableBySlot.get(candidate.slot);

    if (!stableMapId || stableMapId === candidate.mapId) {
      return candidate;
    }

    const matchedAlternative = candidate.alternatives.find(
      (alternative) => alternative.mapId === stableMapId,
    );

    return {
      ...candidate,
      alternatives: matchedAlternative
        ? [
            matchedAlternative,
            ...candidate.alternatives.filter((alternative) => alternative.mapId !== stableMapId),
          ]
        : candidate.alternatives,
      confidence: Math.max(candidate.confidence, matchedAlternative?.confidence ?? 0.82),
      mapId: stableMapId,
      margin: Math.max(candidate.margin, matchedAlternative ? candidate.margin : 0.012),
      modeId: matchedAlternative?.modeId ?? candidate.modeId,
    };
  });

  return {
    ...analysis,
    mapSelection: {
      ...analysis.mapSelection,
      candidates,
      confidence: Math.max(analysis.mapSelection.confidence, 0.86),
      evidence: [...analysis.mapSelection.evidence, 'temporal map agreement'],
    },
    screen: {
      ...analysis.screen,
      confidence: Math.max(analysis.screen.confidence, 0.86),
      evidence: [...analysis.screen.evidence, 'temporal map agreement'],
    },
  };
};
