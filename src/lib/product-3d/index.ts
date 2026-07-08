export type {
  ProductScene3D,
  SceneNode3D,
  LayerViewState,
  GeomKind,
  NodePose3D,
  PoseLayout3D,
} from "./types";
export {
  defaultLayerView,
  computeNodeWorldPosition,
  nodeOpacity,
  nodeVisible,
  focusLayerForStep,
  applyPoseLayout,
  extractPoseLayout,
} from "./types";
export {
  buildProductScene3D,
  buildSatClockScene3D,
  buildBoxedScene3D,
  buildWeatherStickScene3D,
  buildRobotChassisScene3D,
  buildSensorPodScene3D,
  buildBreadboardScene3D,
  applyFormLayoutToScene,
  posesFromFormLayout,
  uniqueLayers,
} from "./build-scene";
export {
  poseStorageKey,
  loadPoseLayout,
  savePoseLayout,
  clearPoseLayout,
  upsertNodePose,
} from "./pose-storage";
export type { PoseHint, PoseHintMap, EnrichPosesResult } from "./enrich-poses";
export {
  sanitizePoseHints,
  sanitizePoseLayout,
  resolveHintsOntoScene,
  enrichPosesFromParams,
  enrichScenePoses,
  applyEnrichmentToScene,
  mergePoseLayouts,
} from "./enrich-poses";
export type { BeautyMeshSpec, BeautyProvider, BeautyResolveResult } from "./beauty-mesh";
export {
  isAllowedBeautyUrl,
  sanitizeBeautyMesh,
  beautyUnderlayAllowed,
  beautyDisplayOpacity,
  buildBeautyPrompt,
  resolveBeautyMesh,
  beautyGenerationConfigured,
  prepareBeautyGeneration,
} from "./beauty-mesh";
export { mapMeshyStatus, startBeautyGeneration, pollBeautyGeneration } from "./beauty-generate";
export type { BeautyTaskStatus } from "./beauty-generate";
