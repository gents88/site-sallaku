import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ProjectDocument = Project & Document;

@Schema({ timestamps: true, collection: 'projects' })
export class Project {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ unique: true })
  slug: string;

  @Prop({ type: [String], default: [] })
  technologies: string[];

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: '' })
  liveUrl: string;

  @Prop({ default: '' })
  repoUrl: string;

  @Prop({ default: false })
  featured: boolean;

  @Prop({ default: 0 })
  order: number;

  // ── Case study (pagina /projects/:slug) ────────────
  @Prop({ default: '' })
  problem: string;

  @Prop({ default: '' })
  solution: string;

  @Prop({ default: '' })
  results: string;

  /**
   * Traduzioni dei campi testuali per lingua non predefinita
   * ({ en: { title, description, problem, solution, results }, ... }).
   * L'italiano resta nei campi base; un campo mancante ricade sull'italiano.
   */
  @Prop({ type: Object, default: {} })
  translations: Record<string, Partial<Record<'title' | 'description' | 'problem' | 'solution' | 'results', string>>>;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
// Featured projects sorted by order is the most common public query
ProjectSchema.index({ featured: 1, order: 1 });
ProjectSchema.index({ order: 1 });
/** Full-text per /search: stessi criteri dell'indice dei post (multilingua, nessuno stemming). */
ProjectSchema.index(
  {
    'title': 'text',
    'description': 'text',
    'technologies': 'text',
    'problem': 'text',
    'solution': 'text',
    'results': 'text',
    'translations.en.title': 'text',
    'translations.en.description': 'text',
    'translations.en.problem': 'text',
    'translations.en.solution': 'text',
    'translations.en.results': 'text',
    'translations.sq.title': 'text',
    'translations.sq.description': 'text',
    'translations.sq.problem': 'text',
    'translations.sq.solution': 'text',
    'translations.sq.results': 'text',
    'translations.es.title': 'text',
    'translations.es.description': 'text',
    'translations.es.problem': 'text',
    'translations.es.solution': 'text',
    'translations.es.results': 'text',
    'translations.pt.title': 'text',
    'translations.pt.description': 'text',
    'translations.pt.problem': 'text',
    'translations.pt.solution': 'text',
    'translations.pt.results': 'text',
    'translations.fr.title': 'text',
    'translations.fr.description': 'text',
    'translations.fr.problem': 'text',
    'translations.fr.solution': 'text',
    'translations.fr.results': 'text',
    'translations.de.title': 'text',
    'translations.de.description': 'text',
    'translations.de.problem': 'text',
    'translations.de.solution': 'text',
    'translations.de.results': 'text',
  },
  {
    name: 'project_fulltext',
    weights: { 'title': 10, 'description': 3, 'technologies': 6, 'problem': 2, 'solution': 2, 'results': 2, 'translations.en.title': 10, 'translations.en.description': 3, 'translations.en.problem': 2, 'translations.en.solution': 2, 'translations.en.results': 2, 'translations.sq.title': 10, 'translations.sq.description': 3, 'translations.sq.problem': 2, 'translations.sq.solution': 2, 'translations.sq.results': 2, 'translations.es.title': 10, 'translations.es.description': 3, 'translations.es.problem': 2, 'translations.es.solution': 2, 'translations.es.results': 2, 'translations.pt.title': 10, 'translations.pt.description': 3, 'translations.pt.problem': 2, 'translations.pt.solution': 2, 'translations.pt.results': 2, 'translations.fr.title': 10, 'translations.fr.description': 3, 'translations.fr.problem': 2, 'translations.fr.solution': 2, 'translations.fr.results': 2, 'translations.de.title': 10, 'translations.de.description': 3, 'translations.de.problem': 2, 'translations.de.solution': 2, 'translations.de.results': 2 },
    default_language: 'none',
    language_override: 'textSearchLanguage',
  },
);
