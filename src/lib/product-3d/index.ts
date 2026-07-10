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
  isolatedPullOffset,
  ISOLATE_PULL_MM,
} from "./types";
export type {
  AssemblyViewState,
  AssemblyTreeNode,
  SectionPlane,
} from "./assembly-view";
export {
  defaultAssemblyView,
  selectNode,
  isolateNode,
  clearIsolate,
  toggleIsolate,
  applyViewUpdater,
  selectNodePreserveView,
  toggleLayerVisible,
  toggleNodeVisible,
  soloLayer,
  setExplode,
  toggleConnectionMap,
  setSection,
  toggleSection,
  resetAssemblyView,
  assemblyNodeOpacity,
  assemblyNodeVisible,
  buildAssemblyTree,
  presentForStep,
  inspectNode,
  toLayerView,
} from "./assembly-view";
export type {
  AssemblyRecipe,
  AssemblyFrame,
  PartDef,
  JointDef,
  PhaseDef,
  PartAnchorDef,
} from "./assembly-recipe";
export {
  resolveAssemblyFrame,
  applyFrameToNodes,
  partPresent,
  nodePresent,
  phaseIndexForStep,
} from "./assembly-recipe";
export { SAT_CLOCK_RECIPE, getRecipeForTemplate } from "./sat-clock-recipe";
export { auditPlanRender, auditStepRender, scrubForStep } from "./step-render-audit";
export type { StepRenderFinding } from "./step-render-audit";
export { pinWorldPositionMm, frameForPin, resolvePinLocal } from "./pin-focus";
export { wireRouteForNodes } from "./micro-wire-bridge";
export { connectionPads } from "./connection-pads";
export type { ConnectionPad } from "./connection-pads";
export {
  SAT_PIN_LOCALS,
  SAT_PIN_NODE_IDS,
  pinAnchorsForNode,
  meshPinStubsForNode,
  pinLocal,
} from "./sat-pins";
export type { PinLocal } from "./sat-pins";
export type { WireRoute3D, WireInsulation } from "./harness";
export {
  buildHarnesses,
  routePath,
  pathLength,
  chordLength,
  pickAnchor,
  anchorWorldPosition,
  rotateLocalOffset,
  hugCageEdge,
  harnessToEdgePoints,
  wiresForPart,
  wireLegend,
  wireDisplayLabel,
} from "./harness";
export {
  wireCubeRods,
  cubeCorners,
  cylinderEulerFromDirection,
  applyEulerToUp,
  directionError,
  rodEndpointError,
  assertSatFidelityParams,
  lerpVec3,
  SAT_FIDELITY,
} from "./geom-math";
export type { RodSegment } from "./geom-math";
export {
  cadCameraForNodes,
  frameForNodeIds,
  sceneWorldBounds,
  CAD_LAYER_COLORS,
} from "./cad-frame";
export type { CadFrame } from "./cad-frame";
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
export {
  REAL_PARTS,
  LIFE_LAYOUT,
  getRealPart,
  deriveCageEdgeMm,
  boardGeomParams,
  cellGeomParams,
  solarGeomParams,
  realPartForNodeId,
  cellRadiusMm,
  cellLengthMm,
} from "./real-parts";
export type { RealPartSpec, RealPin, CatalogPartId, Vec3Mm } from "./real-parts";
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
export type { CatalogEntry } from "./catalog";
export {
  CATALOG,
  inferCatalogId,
  applyCatalogHints,
  catalogAssetPaths,
  readyCatalogAssetPaths,
  resolveCatalogAssetUrl,
} from "./catalog";
export type { MaterialPresetId } from "./materials";
export {
  getMaterialPreset,
  inferMaterialPreset,
  resolvePhysicalMaterial,
  MATERIAL_PRESET_IDS,
} from "./materials";
export type { MapKind } from "./procedural-maps";
export {
  makeBrushedMetalNormal,
  makeFr4Roughness,
  makePvcNormal,
  makeCopperPadNormal,
  getProceduralMap,
  proceduralMapSize,
  clearProceduralMapCache,
} from "./procedural-maps";
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
export { deriveStepPresence } from "./step-presence";
export type { StepPresence } from "./step-presence";
