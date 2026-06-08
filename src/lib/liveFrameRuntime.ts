import { mapOptions, type MapOption } from '@/data/matchOptions';
import type { LiveVisionAnalysis, LiveVisionProbe } from '@/lib/liveVision';
import type { MapSelectionDetection, VisionScreenType } from '@/lib/visionPipelineCore';

export const liveFrameSchedule = {
  confirmProbeIntervalMs: 125,
  heavyVisionIntervalMs: 450,
  mapSelectionEvidenceTtlMs: 6_500,
  mapSelectionScreenHoldMs: 1_600,
  observingVisionIntervalMs: 1_800,
  ocrCooldownMs: 550,
  probeIntervalMs: 250,
  stableOcrCooldownMs: 2_500,
  stableMapSelectionTtlMs: 2_500,
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
    temporalMatched: boolean;
    textConfidence: number;
    textMatched: boolean;
    visualConfidence: number;
    visualMapId: MapOption['value'];
    visualMargin: number;
  }[];
  observedAt: number;
}

export interface LiveSceneRuntimeState {
  classifier: LiveSceneClassifierEngine;
  lastMapSelectionAt: number;
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
const temporalVisualMarginFloor = 0.008;
const temporalSlotScoreThreshold = 1.35;
const slots = ['left', 'center', 'right'] as const;
const mapModeById = new Map(mapOptions.map((map) => [map.value, map.modeId] as const));

export const createLiveSceneRuntimeState = (): LiveSceneRuntimeState => ({
  classifier: 'heuristic-v1',
  lastMapSelectionAt: 0,
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

const hasRecentMapSelectionProbe = (state: LiveSceneRuntimeState) =>
  state.recentProbes.some(
    (probe) =>
      probe.screenCandidate === 'map_selection' && probe.confidence >= mapSelectionProbeThreshold,
  );

const hasRecentNonMapProbeWindow = (state: LiveSceneRuntimeState) =>
  state.recentProbes.length >= 3 &&
  state.recentProbes.every((probe) => probe.screenCandidate !== 'map_selection');

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
    !visionInFlight && shouldProbe && now - state.lastVisionAt >= visionInterval;
  const ocrCooldown =
    state.phase === 'stable-map-selection'
      ? liveFrameSchedule.stableOcrCooldownMs
      : liveFrameSchedule.ocrCooldownMs;
  const includeOcr =
    shouldRunVision && state.phase !== 'observing' && now - state.lastOcrAt >= ocrCooldown;

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

  if (
    state.phase === 'stable-map-selection' &&
    hasRecentNonMapProbeWindow(state) &&
    !hasRecentMapSelectionProbe(state)
  ) {
    state.stableMapCandidateIds = [];
    state.stableScreenType = 'unknown';
    setPhase(state, 'observing', now);
    return;
  }

  if (
    state.phase === 'stable-map-selection' &&
    probe.screenCandidate === 'map_selection' &&
    probe.confidence >= mapSelectionProbeThreshold
  ) {
    state.stableScreenType = 'map_selection';
    return;
  }

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
  return slots
    .map((slot) => {
      const scores = new Map<MapOption['value'], number>();

      for (const selection of selections) {
        for (const candidate of selection.mapCandidates.filter((item) => item.slot === slot)) {
          const textScore = candidate.textMatched
            ? 3.2 + candidate.textConfidence * 1.4 + selection.confidence * 0.4
            : 0;
          const visualScore =
            candidate.visualMargin >= temporalVisualMarginFloor
              ? candidate.visualConfidence * 0.75 +
                candidate.visualMargin * 18 +
                selection.confidence * 0.25
              : 0;
          const confidenceScore = textScore + visualScore + (candidate.temporalMatched ? 0.35 : 0);

          if (confidenceScore > 0) {
            scores.set(candidate.mapId, (scores.get(candidate.mapId) ?? 0) + confidenceScore);
          }
        }
      }

      const winner = [...scores.entries()].sort((left, right) => right[1] - left[1])[0];

      return winner && winner[1] >= temporalSlotScoreThreshold ? winner[0] : null;
    })
    .filter((mapId): mapId is MapOption['value'] => Boolean(mapId));
};

const getTrackableMapSelection = (
  analysis: LiveVisionAnalysis,
): MapSelectionDetection<MapOption['value']> | undefined => {
  if (analysis.mapSelection) {
    return analysis.mapSelection;
  }

  const mapSelection = analysis.screen.mapSelection;

  if (!mapSelection || mapSelection.textEvidenceCount <= 0) {
    return undefined;
  }

  return mapSelection;
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

  const trackableMapSelection = getTrackableMapSelection(analysis);

  if (!trackableMapSelection) {
    state.recentMapSelections = pruneByAge(
      state.recentMapSelections,
      now,
      liveFrameSchedule.mapSelectionEvidenceTtlMs,
    );

    const hasFreshStableMapSelection =
      state.stableMapCandidateIds.length > 0 &&
      state.lastMapSelectionAt > 0 &&
      now - state.lastMapSelectionAt <= liveFrameSchedule.stableMapSelectionTtlMs;
    const hasFreshMapSelectionActivity =
      hasRecentMapSelectionProbe(state) ||
      (state.lastMapSelectionAt > 0 &&
        now - state.lastMapSelectionAt <= liveFrameSchedule.mapSelectionScreenHoldMs);

    if (hasFreshStableMapSelection) {
      state.stableScreenType = 'map_selection';
      setPhase(state, 'stable-map-selection', now);
      return;
    }

    if (hasFreshMapSelectionActivity) {
      state.stableMapCandidateIds = [];
      state.stableScreenType = 'map_selection';
      setPhase(state, 'confirming-map-selection', now);
      return;
    }

    state.stableMapCandidateIds = [];
    state.stableScreenType = analysis.screen.screenType;
    setPhase(state, 'observing', now);
    return;
  }

  state.lastMapSelectionAt = now;
  state.recentMapSelections = pruneByAge(
    [
      ...state.recentMapSelections,
      {
        confidence: Math.max(analysis.screen.confidence, trackableMapSelection.confidence),
        mapCandidates: trackableMapSelection.candidates.map((candidate) => ({
          confidence: candidate.confidence,
          mapId: candidate.mapId as MapOption['value'],
          margin: candidate.margin,
          slot: candidate.slot,
          temporalMatched: candidate.temporalMatched ?? false,
          textConfidence: candidate.textConfidence ?? 0,
          textMatched: candidate.textMatched ?? false,
          visualConfidence: candidate.visualConfidence ?? candidate.confidence,
          visualMapId: (candidate.visualMapId ?? candidate.mapId) as MapOption['value'],
          visualMargin: candidate.visualMargin ?? candidate.margin,
        })),
        observedAt: now,
      },
    ],
    now,
    liveFrameSchedule.mapSelectionEvidenceTtlMs,
  );

  const stableCandidates = getStableMapCandidateIds(state.recentMapSelections);
  const stableUniqueCandidateCount = new Set(stableCandidates).size;

  if (
    stableCandidates.length >= 3 &&
    stableUniqueCandidateCount >= 3 &&
    getRecentMapSelectionConfidence(state) >= 0.78
  ) {
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
  const sourceMapSelection = analysis.mapSelection ?? analysis.screen.mapSelection;

  if (!sourceMapSelection || stableMapCandidateIds.length === 0) {
    return analysis;
  }

  const stableBySlot = new Map(slots.map((slot, index) => [slot, stableMapCandidateIds[index]]));
  const candidates = sourceMapSelection.candidates.map((candidate) => {
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
      modeId: matchedAlternative?.modeId ?? mapModeById.get(stableMapId) ?? candidate.modeId,
      temporalMatched: true,
    };
  });
  const mapSelection = {
    ...sourceMapSelection,
    candidates,
    confidence: Math.max(sourceMapSelection.confidence, 0.86),
    evidence: [...sourceMapSelection.evidence, 'temporal map agreement'],
  };

  return {
    ...analysis,
    mapSelection,
    screen: {
      ...analysis.screen,
      mapSelection,
      confidence: Math.max(analysis.screen.confidence, 0.86),
      evidence: [...analysis.screen.evidence, 'temporal map agreement'],
      screenType: 'map_selection',
    },
  };
};
