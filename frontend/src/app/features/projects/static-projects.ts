/**
 * Progetti mostrati finché il CMS non ne ha (home e /projects). Prima erano
 * copiati identici in entrambi i componenti.
 */
export interface StaticProject {
  icon: string;
  tags: string[];
  titleKey: string;
  descKey: string;
  featureKeys: string[];
}

export const STATIC_PROJECTS: readonly StaticProject[] = [
  {
    icon: 'earth-europe',
    tags: ['Cesium.js', 'Angular', 'TypeScript'],
    titleKey: 'projects.geo.title',
    descKey: 'projects.geo.desc',
    featureKeys: ['projects.geo.f1', 'projects.geo.f2', 'projects.geo.f3', 'projects.geo.f4'],
  },
  {
    icon: 'vr-cardboard',
    tags: ['Photo Sphere', 'Angular', 'WebGL'],
    titleKey: 'projects.vr.title',
    descKey: 'projects.vr.desc',
    featureKeys: ['projects.vr.f1', 'projects.vr.f2', 'projects.vr.f3', 'projects.vr.f4'],
  },
  {
    icon: 'chart-pie',
    tags: ['Looker', 'Angular', 'Chart.js'],
    titleKey: 'projects.dash.title',
    descKey: 'projects.dash.desc',
    featureKeys: ['projects.dash.f1', 'projects.dash.f2', 'projects.dash.f3', 'projects.dash.f4'],
  },
  {
    icon: 'book-open',
    tags: ['Angular', 'Node.js', 'PostgreSQL'],
    titleKey: 'projects.lib.title',
    descKey: 'projects.lib.desc',
    featureKeys: ['projects.lib.f1', 'projects.lib.f2', 'projects.lib.f3', 'projects.lib.f4'],
  },
  {
    icon: 'shield-halved',
    tags: ['Angular', '.NET', 'API'],
    titleKey: 'projects.ins.title',
    descKey: 'projects.ins.desc',
    featureKeys: ['projects.ins.f1', 'projects.ins.f2', 'projects.ins.f3', 'projects.ins.f4'],
  },
];
