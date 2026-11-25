export {
  InvestigationScene,
  type InvestigationSceneProps,
} from "./InvestigationScene";
export {
  DeskProps,
  DeskBackdrop,
  TABLE_TOP_Y,
  BLOTTER_THICKNESS,
  BLOTTER_CENTER_Y,
  BOARD_ANCHOR_Y,
  TABLE_SCALE,
  DESK_MODEL_PATHS,
  preloadDeskModels,
  getScenePropLayout,
  prepareDecorativeObject,
  seatObjectOnSurface,
  type DeskPropsProps,
  type DeskBackdropProps,
  type ScenePropLayout,
} from "./DeskProps";
export {
  LightingAndAtmosphere,
  type LightingAndAtmosphereProps,
} from "./LightingAndAtmosphere";
export { CameraRig, type CameraRigProps } from "./CameraRig";
export {
  WebGLErrorBoundary,
  isWebGLAvailable,
  attachWebGLContextListeners,
  type WebGLErrorBoundaryProps,
  type WebGLContextHandlers,
} from "./WebGLErrorBoundary";
