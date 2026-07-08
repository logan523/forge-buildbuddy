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
export type { SpatialReasonNote, SpatialReasonResult } from "./spatial-reason";
export { applySpatialReasoning, reasoningChips } from "./spatial-reason";
export type { SceneEdge3D } from "./connection-spars";
export {
  buildConnectionEdges,
  attachConnectionSpars,
  mapRefToNodeId,
  edgeTransform,
} from "./connection-spars";
export type { SunState } from "./sun";
export {
  DEFAULT_SUN,
  sunDirection,
  sunLightPosition,
  solarRotationTowardSun,
  sunLabel,
} from "./sun";
export type { CatalogPartId, CatalogEntry } from "./catalog";
export { CATALOG, inferCatalogId, applyCatalogHints, catalogAssetPaths } from "./catalog";
export type { MaterialPresetId } from "./materials";
export {
  getMaterialPreset,
  inferMaterialPreset,
  resolvePhysicalMaterial,
  MATERIAL_PRESET_IDS,
} from "./materials";
export type { QualityTier, QualitySettings } from "./quality";
export { qualitySettings, detectQualityTier } from "./quality";
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
