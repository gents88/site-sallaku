// Ambient declarations for prismjs sub-modules (components and plugins)
// TypeScript requires these for dynamic import() calls — static side-effect
// imports don't need them. The actual JS is provided by the prismjs package.
declare module 'prismjs/components/*' {}
declare module 'prismjs/plugins/*' {}
