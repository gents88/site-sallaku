/**
 * Versione del rilascio, iniettata a build-time da scripts/ng-build.js tramite
 * `ng build --define`. Con `ng serve`, i test o un `ng build` diretto valgono i
 * default di angular.json ('dev').
 */
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export interface BuildInfo {
  /** Commit git corto; un "+" finale indica modifiche non committate. */
  commit: string;
  /** Ora di build, "YYYY-MM-DD HH:mm" (Europe/Rome). */
  time: string;
}

export const BUILD_INFO: BuildInfo = {
  commit: typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev',
  time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '',
};
