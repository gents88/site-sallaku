import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ChatSession, ChatSessionDocument, ChatMessage } from './schemas/chat-session.schema';
import { MailService } from '../mail/mail.service';
import { AboutService } from '../about/about.service';
import { AboutDocument } from '../about/schemas/about.schema';
import { AiProviderService } from '../common/services/ai-provider.service';
import { ProjectsService } from '../projects/projects.service';
import { BlogService } from '../blog/blog.service';
import { SettingsService } from '../common/settings/settings.service';
import { StreamMarkerFilter } from './stream-markers';
import { buildLabBlock, selectPostsForPrompt } from './chatbot-context';

interface PromptProject {
  title?: string;
  description?: string;
  technologies?: string[];
}

interface PromptPost {
  title?: string;
  slug?: string;
  excerpt?: string;
  tags?: string[];
}

function buildSystemPrompt(
  about?: Partial<AboutDocument> | null,
  projects?: PromptProject[],
  posts?: PromptPost[],
  labBlock: string = buildLabBlock(),
): string {
  const aboutLines = [
    about?.headline && `Headline: ${about.headline}`,
    about?.bio && `Bio: ${about.bio}`,
    about?.location && `Location: ${about.location}`,
    about?.skills?.length && `Skills: ${about.skills.join(', ')}`,
  ].filter(Boolean);

  const aboutBlock = aboutLines.length
    ? `\nHere is real, up-to-date information about Gent — use it to answer questions about him accurately:\n${aboutLines.join('\n')}\n`
    : '';

  const projectsBlock = projects?.length
    ? `\nGent's real projects (use these exact names/details when asked about his work — don't invent projects):\n${projects
        .slice(0, 12)
        .map((p) => `- ${p.title}: ${p.description}${p.technologies?.length ? ` [${p.technologies.join(', ')}]` : ''}`)
        .join('\n')}\n`
    : '';

  const blogBlock = posts?.length
    ? `\nGent's recent blog posts (mention and link these — path is /blog/<slug> — when relevant to the visitor's question):\n${posts
        .slice(0, 8)
        .map((p) => `- "${p.title}" (/blog/${p.slug})${p.excerpt ? `: ${p.excerpt}` : ''}`)
        .join('\n')}\n`
    : '';

  return `You are an AI assistant embedded in Gent Sallaku's developer portfolio website.
Gent Sallaku is a full-stack developer specialized in Angular, Javascript, NestJS, MongoDB, and modern web technologies.
He built this portfolio to showcase his projects, experiences, and free tools.
${aboutBlock}${projectsBlock}${blogBlock}
Gent also built a suite of free tools available on this site, under the "🧰 AI & Tools" menu (base path /lab/...). If a visitor asks about tools, document processing, PDFs, or productivity utilities, proactively mention the relevant ones and give their exact path. If the visitor asks specifically how one of these tools works, explain briefly (1-2 short sentences, using the steps below) what they do and don't — don't just repeat the name. Always give this explanation in the visitor's own language (per the language rules below), never only in English, no matter which language they ask in.

${labBlock}

Your role:
- Answer questions about Gent's skills, projects, and experience
- Help visitors navigate the portfolio (sections: Home, Projects, Blog, Services, Contact) and the AI & Tools suite above
- Act as a general-purpose assistant: answer any other question the visitor asks (programming, general knowledge, advice, casual conversation, anything), even if unrelated to Gent or the portfolio
- Be welcoming, professional, and helpful

Keep responses under 150 words unless asked for more detail.
If you don't know something specific about Gent (not covered above), suggest the visitor contact him at gentsallaku@gmail.com or use the Contact section — but this only applies to questions about Gent himself, not to general questions.

Work availability (important):
- Gent currently works as an employee. He is NOT looking for freelance work, consulting, quotes or new collaborations through this site.
- Never offer, promise or advertise his services, availability or rates, and never invite visitors to hire him or to propose collaborations or projects.
- If a visitor asks whether he is available, for a quote, or to hire him, answer briefly (in the visitor's language) that he is not taking on new engagements at the moment, and that the Contact section is for questions about the site, the projects and the tools.

Contact requests (important):
- If the visitor asks how to contact Gent, asks for his email, or wants to get in touch with him, reply with this (translated naturally into the visitor's language): he can be reached by writing to gentsallaku@gmail.com, or by using the Contact section of the site, where there's a quick form to send messages directly — the Contact section also has his phone number, which can be used to call him or write to him on WhatsApp.
- Then, still in the visitor's language, ask whether they'd rather talk to Gent live/in real time right now instead of waiting for an email reply.
- Whenever your reply offers or discusses talking to Gent live/in real time (proactively, or because the visitor asked/agreed), add this exact marker line by itself: LIVE_OFFER: true — this renders a real "talk now" button for the visitor, so include it instead of describing how to start the live chat yourself.
- Do not add the LIVE_OFFER line for any other kind of reply.

Language rules:
- Always reply in the same language the visitor's latest message is written in. Detect the language from the message itself before composing the answer; this takes priority over any interface-language setting below.
- Never reply in English to an Italian message just because the interface language is English.
- Pay close attention to correctly recognizing Albanian (Shqip) and never confuse it with similar-sounding Balkan languages (Serbian, Bosnian, Croatian, Macedonian) — if the visitor writes in Albanian, reply in Albanian.
- If you cannot confidently identify the language, reply in English.
Do not use the website interface language to choose the response language.

Follow-up suggestions (required):
After your reply (and after the LIVE_OFFER line, when present), on its own final line, add exactly:
SUGGESTIONS: question one? | question two? | question three?
- Three short, natural follow-up questions the visitor might ask next, in the same language as your reply, each under 8 words.
- This must be the last line of your output, must not be mentioned anywhere else in the reply, and must always be present.`;
}

const FALLBACK_RESPONSES: { pattern: RegExp; response: string }[] = [
  {
    pattern: /^(ciao|hello|hi|hey|salve|buongiorno|buonasera|hej)/i,
    response:
      "Hello! I'm the AI assistant on Gent Sallaku's portfolio. How can I help you today? Feel free to ask about his projects, skills, or anything else!",
  },
  {
    pattern: /project|progetto|lavoro|work|portfolio/i,
    response:
      "Gent has built several full-stack projects using Angular, NestJS, and MongoDB. You can explore them in the **Projects** section of this portfolio! Want to know about a specific project?",
  },
  {
    pattern: /experience|esperienza|skill|competenz|tecnolog|technology|stack/i,
    response:
      "Gent specialises in full-stack web development: **Angular** (frontend), **NestJS** (backend), **MongoDB** (database), and **TypeScript** throughout. He also works with Docker, Railway, and cloud deployments.",
  },
  {
    pattern: /contact|contatt|email|messag|reach/i,
    response:
      "You can write to Gent directly at gentsallaku@gmail.com, or use the **Contact** section on this site, which has a quick form to send messages directly — you'll also find his phone number there, to call him or write on WhatsApp. Would you rather talk to him live, in real time, right now?",
  },
  {
    pattern: /blog|article|articolo|post/i,
    response:
      "Gent writes about web development, Angular, NestJS, and software engineering in the **Blog** section. Check it out for technical insights and tutorials!",
  },
  {
    pattern: /service|servizio|freelance|hire|availab/i,
    response:
      "Gent currently works as an employee and is not taking on freelance work or new engagements through this site. You can explore his **Projects** and the free **AI & Tools**, or use the Contact page for questions.",
  },
  {
    pattern: /about|chi è|chi sei|presentati|introduce/i,
    response:
      "Gent Sallaku is a full-stack developer passionate about building modern, performant web applications. This portfolio showcases his work and expertise. Visit the **About** section to learn more!",
  },
];

const DEFAULT_FALLBACK =
  "I'm the AI assistant for this portfolio. I can answer questions about Gent's projects, skills, and the tools on this site. You're also welcome to use the **Contact** section to get in touch with him directly!";
const DEFAULT_ITALIAN_FALLBACK =
  'Sono l’assistente AI di questo portfolio. Posso rispondere a domande sui progetti, sulle competenze e sugli strumenti di questo sito. Puoi anche usare la sezione **Contact** per contattarlo direttamente!';
const DEFAULT_ALBANIAN_FALLBACK =
  'Jam asistenti AI i këtij portofoli. Mund t’u përgjigjem pyetjeve për projektet, aftësitë dhe mjetet e kësaj faqeje. Mund të përdorësh edhe seksionin **Contact** për ta kontaktuar drejtpërdrejt!';
const DEFAULT_LOCALIZED_FALLBACKS: Record<string, string> = {
  it: DEFAULT_ITALIAN_FALLBACK,
  sq: DEFAULT_ALBANIAN_FALLBACK,
  es: 'Soy el asistente de IA de este portfolio. Puedo responder preguntas sobre los proyectos, las habilidades y las herramientas de este sitio. También puedes usar la sección **Contact** para contactarlo directamente.',
  pt: 'Sou o assistente de IA deste portfólio. Posso responder a perguntas sobre os projetos, as competências e as ferramentas deste site. Também podes usar a secção **Contact** para contactá-lo diretamente.',
  fr: "Je suis l'assistant IA de ce portfolio. Je peux répondre aux questions sur les projets, les compétences et les outils de ce site. Vous pouvez aussi utiliser la section **Contact** pour le contacter directement.",
  de: 'Ich bin der KI-Assistent dieses Portfolios. Ich kann Fragen zu Gents Projekten, Fähigkeiten und den Tools dieser Website beantworten. Du kannst ihn auch direkt über den Bereich **Contact** kontaktieren.',
};

/**
 * Parole frequenti per lingua. Il riconoscimento conta quante ne compaiono e sceglie la lingua che ne ha di più
 * (prima bastava una parola-chiave, quindi "Quali strumenti avete per i PDF?" non era riconosciuto come italiano).
 * Serve solo alle risposte predefinite: quando l'AI risponde, la lingua la sceglie il modello.
 */
const LANGUAGE_WORDS: Record<string, string> = {
  en: 'the is are can you your how what do does hire my with for me about tell have want where who why',
  it: 'ciao sono sei grazie perche come posso vorrei buongiorno buonasera progetto progetti quali avete hai cosa dove quando puoi fare voglio disponibile lavoro strumenti il lo gli di che per un una',
  es: 'hola gracias cómo como puedo quiero proyecto proyectos buenos qué que cuáles tienes tus sobre cuéntame cuentame para trabajo herramientas dónde donde el los las una',
  pt: 'olá ola obrigado obrigada como posso quero projeto projetos bom quais você voce tens tem para uma trabalho ferramentas onde não nao os as',
  fr: 'bonjour merci comment peux voudrais projet projets salut quels quelles avez vous pour une travail outils où est les des je tu parle ton tes',
  de: 'hallo danke wie kann möchte projekt projekte guten welche haben sie für eine arbeit werkzeuge wo ich ist der die das und mit deine',
  sq: 'dhe është eshte për çfarë cfare shqip lutem faleminderit përshëndetje projektet mjete punë ku si mund ka tungjatjeta',
};

function detectLanguage(message: string): string | undefined {
  const words = message.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (!words.length) return undefined;
  const scores = Object.entries(LANGUAGE_WORDS).map(([lang, list]) => {
    const set = new Set(list.split(' '));
    return { lang, score: words.filter((w) => set.has(w)).length };
  });
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  // L'inglese non è un "riconoscimento": è il comportamento predefinito, quindi qui non si restituisce.
  if (best.score === 0 || best.score === second.score || best.lang === 'en') return undefined;
  return best.lang;
}

/**
 * Risposte predefinite per argomento nelle lingue del sito, usate quando l'AI non è disponibile (prima solo
 * l'inglese aveva risposte per argomento; le altre lingue ricevevano un messaggio generico). Per l'inglese
 * restano FALLBACK_RESPONSES. Il contatto rimanda alla sezione Contatti del sito, senza ripetere indirizzi.
 */
type FallbackTopic = 'greeting' | 'services' | 'contact' | 'projects' | 'skills' | 'blog' | 'tools' | 'about';

const TOPIC_PATTERNS: { topic: FallbackTopic; pattern: RegExp }[] = [
  // I servizi prima dei progetti: "lavoro freelance" contiene "lavoro" ma è una domanda sulla disponibilità.
  { topic: 'greeting', pattern: /^\s*(ciao|hello|hi|hey|salve|buongiorno|buonasera|hej|hola|bonjour|salut|hallo|olá|ola|tungjatjeta|përshëndetje)\b/i },
  { topic: 'services', pattern: /service|servizi|freelance|hire|availab|disponibil|assum|preventiv|quote|collaborazion|colabor|incarico|dispon[ií]vel|contrat|embaucher|einstellen|punësoj/i },
  { topic: 'contact', pattern: /contact|contatt|email|messag|reach|kontakt|contacto|contactar|contacter|escrib|scriv/i },
  { topic: 'tools', pattern: /tool|strument|pdf|qr|convert|firma|firmar|signer|comprim|heic|herramienta|outil|werkzeug|ferramenta|mjet/i },
  { topic: 'blog', pattern: /blog|article|articol|artícul|artigo|artikel|post/i },
  { topic: 'projects', pattern: /project|progett|lavor|work|portfolio|proyecto|projet|projekt|projeto|projekte/i },
  { topic: 'skills', pattern: /experience|esperienz|skill|competenz|tecnolog|technology|stack|experiencia|habilidad|compétence|fähigkeit|competência|aftësi/i },
  { topic: 'about', pattern: /about|chi è|chi sei|presentati|introduce|quién|qui es|wer bist|quem é|kush je/i },
];

const TOPIC_RESPONSES: Record<string, Record<FallbackTopic, string>> = {
  it: {
    greeting: "Ciao! Sono l'assistente AI di questo portfolio. Posso rispondere a domande sui progetti, le competenze e gli strumenti gratuiti del sito. Cosa ti interessa?",
    services: 'Gent al momento lavora come dipendente e non accetta lavori freelance né nuovi incarichi tramite questo sito. Puoi esplorare i suoi **Progetti** e gli strumenti gratuiti **AI & Tools**, oppure usare la sezione **Contatti** per domande.',
    contact: "Puoi usare la sezione **Contatti** del sito: c'è un modulo per scrivere direttamente a Gent e anche il numero di telefono, per chiamarlo o scrivergli su WhatsApp. Preferisci parlare con lui dal vivo, adesso?",
    projects: 'Gent ha realizzato diversi progetti full-stack con Angular, NestJS e MongoDB. Li trovi nella sezione **Progetti** del sito. Vuoi saperne di più su uno in particolare?',
    skills: 'Gent è uno sviluppatore full-stack: **Angular** per il frontend, **NestJS** per il backend, **MongoDB** per i dati e **TypeScript** ovunque. Usa anche Docker e Railway per il rilascio.',
    blog: 'Gent scrive di sviluppo web, Angular, NestJS e ingegneria del software nella sezione **Blog**. Dai un\'occhiata per guide e approfondimenti!',
    tools: 'Nel menu **AI & Tools** trovi strumenti gratuiti: firmare, comprimere e unire PDF, convertire foto HEIC in JPG, creare QR code e molto altro. Dimmi cosa vuoi fare e ti indico quello giusto.',
    about: 'Gent Sallaku è uno sviluppatore full-stack appassionato di applicazioni web moderne e performanti. Questo portfolio raccoglie i suoi lavori: i dettagli sono nella sezione **Chi sono**.',
  },
  es: {
    greeting: '¡Hola! Soy el asistente de IA de este portfolio. Puedo responder preguntas sobre los proyectos, las habilidades y las herramientas gratuitas del sitio. ¿Qué te interesa?',
    services: 'Gent trabaja actualmente como empleado y no acepta trabajos freelance ni nuevos encargos a través de este sitio. Puedes explorar sus **Proyectos** y las herramientas gratuitas de **AI & Tools**, o usar la sección **Contacto** para preguntas.',
    contact: 'Puedes usar la sección **Contacto** del sitio: hay un formulario para escribir directamente a Gent y también su teléfono, para llamarlo o escribirle por WhatsApp. ¿Prefieres hablar con él en directo ahora?',
    projects: 'Gent ha creado varios proyectos full-stack con Angular, NestJS y MongoDB. Los encuentras en la sección **Proyectos**. ¿Quieres saber más de alguno en concreto?',
    skills: 'Gent es desarrollador full-stack: **Angular** en el frontend, **NestJS** en el backend, **MongoDB** para los datos y **TypeScript** en todo el proyecto. También usa Docker y Railway para los despliegues.',
    blog: 'Gent escribe sobre desarrollo web, Angular, NestJS e ingeniería de software en la sección **Blog**. ¡Échale un vistazo para guías y artículos técnicos!',
    tools: 'En el menú **AI & Tools** hay herramientas gratuitas: firmar, comprimir y unir PDF, convertir fotos HEIC a JPG, crear códigos QR y mucho más. Dime qué quieres hacer y te indico la adecuada.',
    about: 'Gent Sallaku es un desarrollador full-stack apasionado por las aplicaciones web modernas y rápidas. Este portfolio reúne su trabajo: los detalles están en la sección **Sobre mí**.',
  },
  pt: {
    greeting: 'Olá! Sou o assistente de IA deste portfólio. Posso responder a perguntas sobre os projetos, as competências e as ferramentas gratuitas do site. O que te interessa?',
    services: 'O Gent trabalha atualmente como funcionário e não aceita trabalhos freelance nem novos projetos através deste site. Podes explorar os seus **Projetos** e as ferramentas gratuitas de **AI & Tools**, ou usar a secção **Contacto** para perguntas.',
    contact: 'Podes usar a secção **Contacto** do site: há um formulário para escrever diretamente ao Gent e também o telefone, para ligar-lhe ou escrever no WhatsApp. Preferes falar com ele ao vivo, agora?',
    projects: 'O Gent criou vários projetos full-stack com Angular, NestJS e MongoDB. Encontras na secção **Projetos**. Queres saber mais sobre algum em particular?',
    skills: 'O Gent é programador full-stack: **Angular** no frontend, **NestJS** no backend, **MongoDB** para os dados e **TypeScript** em todo o lado. Também usa Docker e Railway para publicar.',
    blog: 'O Gent escreve sobre desenvolvimento web, Angular, NestJS e engenharia de software na secção **Blog**. Espreita para guias e artigos técnicos!',
    tools: 'No menu **AI & Tools** há ferramentas gratuitas: assinar, comprimir e juntar PDF, converter fotos HEIC em JPG, criar códigos QR e muito mais. Diz-me o que queres fazer e indico-te a certa.',
    about: 'O Gent Sallaku é um programador full-stack apaixonado por aplicações web modernas e rápidas. Este portfólio reúne o seu trabalho: os detalhes estão na secção **Sobre mim**.',
  },
  fr: {
    greeting: "Bonjour ! Je suis l'assistant IA de ce portfolio. Je peux répondre aux questions sur les projets, les compétences et les outils gratuits du site. Qu'est-ce qui vous intéresse ?",
    services: "Gent travaille actuellement comme salarié et n'accepte ni missions freelance ni nouveaux engagements via ce site. Vous pouvez découvrir ses **Projets** et les outils gratuits **AI & Tools**, ou utiliser la section **Contact** pour poser vos questions.",
    contact: "Vous pouvez utiliser la section **Contact** du site : un formulaire permet d'écrire directement à Gent, et son numéro de téléphone s'y trouve aussi, pour l'appeler ou lui écrire sur WhatsApp. Préférez-vous lui parler en direct, maintenant ?",
    projects: "Gent a réalisé plusieurs projets full-stack avec Angular, NestJS et MongoDB. Vous les trouverez dans la section **Projets**. Souhaitez-vous en savoir plus sur l'un d'eux ?",
    skills: 'Gent est développeur full-stack : **Angular** pour le frontend, **NestJS** pour le backend, **MongoDB** pour les données et **TypeScript** partout. Il utilise aussi Docker et Railway pour les déploiements.',
    blog: "Gent écrit sur le développement web, Angular, NestJS et l'ingénierie logicielle dans la section **Blog**. Jetez-y un œil pour des guides et des articles techniques !",
    tools: "Dans le menu **AI & Tools**, vous trouverez des outils gratuits : signer, compresser et fusionner des PDF, convertir des photos HEIC en JPG, créer des QR codes et bien plus. Dites-moi ce que vous voulez faire et je vous indique le bon.",
    about: "Gent Sallaku est un développeur full-stack passionné par les applications web modernes et performantes. Ce portfolio réunit ses réalisations : les détails sont dans la section **À propos**.",
  },
  de: {
    greeting: 'Hallo! Ich bin der KI-Assistent dieses Portfolios. Ich kann Fragen zu Projekten, Fähigkeiten und den kostenlosen Tools der Website beantworten. Was interessiert dich?',
    services: 'Gent arbeitet derzeit als Angestellter und nimmt über diese Website weder Freelance-Aufträge noch neue Projekte an. Du kannst seine **Projekte** und die kostenlosen **AI & Tools** ansehen oder den Bereich **Kontakt** für Fragen nutzen.',
    contact: 'Nutze den Bereich **Kontakt** der Website: Dort gibt es ein Formular, um Gent direkt zu schreiben, und auch seine Telefonnummer, um ihn anzurufen oder ihm auf WhatsApp zu schreiben. Möchtest du jetzt lieber live mit ihm sprechen?',
    projects: 'Gent hat mehrere Full-Stack-Projekte mit Angular, NestJS und MongoDB umgesetzt. Du findest sie im Bereich **Projekte**. Möchtest du mehr über eines davon erfahren?',
    skills: 'Gent ist Full-Stack-Entwickler: **Angular** im Frontend, **NestJS** im Backend, **MongoDB** für die Daten und überall **TypeScript**. Außerdem nutzt er Docker und Railway für Deployments.',
    blog: 'Gent schreibt im **Blog** über Webentwicklung, Angular, NestJS und Software-Engineering. Schau vorbei für Anleitungen und technische Artikel!',
    tools: 'Im Menü **AI & Tools** findest du kostenlose Werkzeuge: PDFs signieren, komprimieren und zusammenfügen, HEIC-Fotos in JPG umwandeln, QR-Codes erstellen und mehr. Sag mir, was du vorhast, und ich nenne dir das passende.',
    about: 'Gent Sallaku ist ein Full-Stack-Entwickler mit Leidenschaft für moderne, schnelle Webanwendungen. Dieses Portfolio zeigt seine Arbeit: Details findest du im Bereich **Über mich**.',
  },
  sq: {
    greeting: 'Përshëndetje! Jam asistenti AI i këtij portofoli. Mund t’u përgjigjem pyetjeve për projektet, aftësitë dhe mjetet falas të faqes. Çfarë të intereson?',
    services: 'Gent aktualisht punon si i punësuar dhe nuk pranon punë freelance apo angazhime të reja përmes kësaj faqeje. Mund të shohësh **Projektet** e tij dhe mjetet falas **AI & Tools**, ose të përdorësh seksionin **Kontakt** për pyetje.',
    contact: 'Mund të përdorësh seksionin **Kontakt** të faqes: aty ka një formular për t’i shkruar drejtpërdrejt Gentit dhe edhe numrin e telefonit, për ta thirrur ose për t’i shkruar në WhatsApp. Preferon të flasësh me të drejtpërdrejt, tani?',
    projects: 'Gent ka realizuar disa projekte full-stack me Angular, NestJS dhe MongoDB. I gjen te seksioni **Projektet**. Dëshiron të dish më shumë për ndonjërin?',
    skills: 'Gent është zhvillues full-stack: **Angular** për frontend-in, **NestJS** për backend-in, **MongoDB** për të dhënat dhe **TypeScript** kudo. Përdor edhe Docker e Railway për publikimin.',
    blog: 'Gent shkruan për zhvillimin e uebit, Angular, NestJS dhe inxhinierinë e softuerit te seksioni **Blog**. Hidhi një sy për udhëzues dhe artikuj teknikë!',
    tools: 'Te menuja **AI & Tools** gjen mjete falas: nënshkrim, kompresim dhe bashkim PDF, konvertim i fotove HEIC në JPG, krijim kodesh QR e më shumë. Më thuaj çfarë dëshiron të bësh dhe të tregoj mjetin e duhur.',
    about: 'Gent Sallaku është zhvillues full-stack i pasionuar pas aplikacioneve moderne dhe të shpejta të uebit. Ky portofol përmbledh punën e tij: detajet janë te seksioni **Rreth meje**.',
  },
};

/** Lingua dell'interfaccia (es. "it", "pt-BR") ridotta a uno dei codici supportati. */
function normalizeLang(lang?: string): string | undefined {
  const code = (lang ?? '').toLowerCase().slice(0, 2);
  return code === 'en' || TOPIC_RESPONSES[code] ? code : undefined;
}

/** Matches the visitor asking to contact Gent, in any of the site's supported languages — used to offer live chat from the static fallback replies. */
const CONTACT_INTENT_PATTERN =
  /contact|contatt|reach\s+him|reach\s+out|get in touch|kontakt|contacto|contactar|kontaktoj|kontakto/i;

/** Splits the model's raw output into the visible reply and the trailing `LIVE_OFFER:` / `SUGGESTIONS:` marker lines (either order). */
function parseAIReply(raw: string): { content: string; suggestions?: string[]; liveOffer?: boolean } {
  const lines = raw.trim().split('\n');
  let suggestions: string[] | undefined;
  let liveOffer: boolean | undefined;

  while (lines.length) {
    const last = lines[lines.length - 1].trim();

    const suggMatch = last.match(/^SUGGESTIONS:\s*(.+)$/i);
    if (suggMatch) {
      suggestions = suggMatch[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3);
      lines.pop();
      continue;
    }

    const offerMatch = last.match(/^LIVE_OFFER:\s*(true|false)$/i);
    if (offerMatch) {
      liveOffer = offerMatch[1].toLowerCase() === 'true';
      lines.pop();
      continue;
    }

    break;
  }

  const content = lines.join('\n').trim();
  return {
    content: content || raw.trim(),
    suggestions: suggestions?.length ? suggestions : undefined,
    liveOffer,
  };
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @InjectModel(ChatSession.name)
    private readonly chatSessionModel: Model<ChatSessionDocument>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly aboutService: AboutService,
    private readonly aiProvider: AiProviderService,
    private readonly projectsService: ProjectsService,
    private readonly blogService: BlogService,
    // @Optional: i test che costruiscono il servizio a mano non devono conoscere i flag.
    @Optional() private readonly settings?: SettingsService,
  ) {}

  async sendMessage(
    message: string,
    sessionId?: string,
    meta?: { ip?: string; userAgent?: string },
    lang?: string,
  ): Promise<{ sessionId: string; reply: string; timestamp: Date; suggestions?: string[]; liveOffer?: boolean }> {
    const sid = sessionId && sessionId.length > 0 ? sessionId : randomUUID();

    let session = await this.chatSessionModel.findOne({ sessionId: sid }).exec();
    if (!session) {
      session = new this.chatSessionModel({ sessionId: sid, messages: [] });
    }

    const userMsg: ChatMessage = { role: 'user', content: message, timestamp: new Date() };
    session.messages.push(userMsg);

    const historyForAI = session.messages
      .slice(-20) // last 20 messages for context window
      .map((m) => ({ role: m.role, content: m.content }));

    const { content: reply, suggestions, liveOffer, usedFallback } = await this.callAI(historyForAI, lang);

    const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: new Date(), usedFallback };
    session.messages.push(assistantMsg);
    session.lastActivity = new Date();

    await session.save();

    return { sessionId: sid, reply, timestamp: assistantMsg.timestamp, suggestions, liveOffer };
  }

  /**
   * Stessa cosa di sendMessage, ma `onDelta` riceve il testo man mano che il modello lo scrive.
   * Il risultato finale è identico a quello di sendMessage (testo pulito, suggerimenti, offerta live).
   */
  async sendMessageStream(
    message: string,
    sessionId: string | undefined,
    _meta: { ip?: string; userAgent?: string } | undefined,
    lang: string | undefined,
    onDelta: (text: string) => void,
  ): Promise<{ sessionId: string; reply: string; timestamp: Date; suggestions?: string[]; liveOffer?: boolean }> {
    const sid = sessionId && sessionId.length > 0 ? sessionId : randomUUID();

    let session = await this.chatSessionModel.findOne({ sessionId: sid }).exec();
    if (!session) {
      session = new this.chatSessionModel({ sessionId: sid, messages: [] });
    }

    session.messages.push({ role: 'user', content: message, timestamp: new Date() });
    const historyForAI = session.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));

    const { content: reply, suggestions, liveOffer, usedFallback } = await this.callAIStream(historyForAI, lang, onDelta);

    const assistantMsg: ChatMessage = { role: 'assistant', content: reply, timestamp: new Date(), usedFallback };
    session.messages.push(assistantMsg);
    session.lastActivity = new Date();
    await session.save();

    return { sessionId: sid, reply, timestamp: assistantMsg.timestamp, suggestions, liveOffer };
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const session = await this.chatSessionModel.findOne({ sessionId }).exec();
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async getTodayInteractionCount(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    // Count sessions that had activity today by filtering lastActivity >= start
    // or count messages with timestamp >= start across all sessions
    const sessions = await this.chatSessionModel
      .find({ lastActivity: { $gte: start } })
      .exec();
    // Count total user messages across those sessions today
    return sessions.reduce((total, s) => {
      return total + s.messages.filter(m => m.role === 'user' && new Date(m.timestamp) >= start).length;
    }, 0);
  }

  async getTodaySessions(page = 1, limit = 15): Promise<{
    data: Array<{
      sessionId: string;
      messages: ChatMessage[];
      lastActivity: Date;
      createdAt: Date;
      messageCount: number;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const safePage  = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const filter = { lastActivity: { $gte: start } };
    const [sessions, total] = await Promise.all([
      this.chatSessionModel
        .find(filter)
        .sort({ lastActivity: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.chatSessionModel.countDocuments(filter).exec(),
    ]);

    return {
      data: (sessions as Array<any>).map(s => ({
        sessionId: s.sessionId,
        messages: s.messages ?? [],
        lastActivity: s.lastActivity,
        createdAt: s.createdAt,
        messageCount: s.messages?.length ?? 0,
      })),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /** Counts assistant replies served today from the static canned fallback (AI call failed/unavailable) — surfaces AI provider outages that would otherwise go unnoticed. */
  async getTodayFallbackCount(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const sessions = await this.chatSessionModel
      .find({ lastActivity: { $gte: start } })
      .exec();
    return sessions.reduce((total, s) => {
      return total + s.messages.filter(
        m => m.role === 'assistant' && m.usedFallback && new Date(m.timestamp) >= start,
      ).length;
    }, 0);
  }

  async getChatbotStats(): Promise<{
    totalSessions: number;
    totalMessages: number;
    interactionsToday: number;
    sessionsThisMonth: number;
    fallbackRepliesToday: number;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalSessions, allSessions, sessionsThisMonth, interactionsToday, fallbackRepliesToday] = await Promise.all([
      this.chatSessionModel.countDocuments().exec(),
      this.chatSessionModel.find({}, 'messages').lean().exec(),
      this.chatSessionModel.countDocuments({ createdAt: { $gte: startOfMonth } }).exec(),
      this.getTodayInteractionCount(),
      this.getTodayFallbackCount(),
    ]);

    const totalMessages = (allSessions as Array<{ messages: unknown[] }>).reduce(
      (sum, s) => sum + (s.messages?.length ?? 0), 0,
    );

    return { totalSessions, totalMessages, interactionsToday, sessionsThisMonth, fallbackRepliesToday };
  }

  /** Appends a message written live (visitor or Gent) once a live handoff session is active */
  async appendLiveMessage(
    sessionId: string,
    role: 'user' | 'agent',
    content: string,
  ): Promise<ChatMessage> {
    const session = await this.chatSessionModel.findOne({ sessionId }).exec();
    if (!session) throw new NotFoundException('Session not found');

    const message: ChatMessage = { role, content, timestamp: new Date() };
    session.messages.push(message);
    session.lastActivity = new Date();
    await session.save();
    return message;
  }

  async sendTranscript(sessionId: string, email: string): Promise<{ success: boolean }> {
    const session = await this.chatSessionModel.findOne({ sessionId }).exec();
    if (!session || session.messages.length === 0) {
      return { success: false };
    }
    const result = await this.mailService.sendChatTranscript(email, session.messages);
    return { success: result.success };
  }

  /** Tutti gli articoli pubblicati (titolo, slug, estratto, tag), in memoria per 10 minuti: servono alla ricerca del bot. */
  private postsCache: { at: number; data: PromptPost[] } | null = null;

  private async allPublishedPosts(): Promise<PromptPost[]> {
    if (this.postsCache && Date.now() - this.postsCache.at < 10 * 60_000) return this.postsCache.data;
    const data: PromptPost[] = [];
    try {
      for (let page = 1; page <= 6; page++) {
        const res = await this.blogService.findPublished(undefined, page, 50);
        data.push(...((res.data ?? []) as PromptPost[]));
        if (!res.totalPages || page >= res.totalPages) break;
      }
    } catch (err) {
      this.logger.warn('Blog posts unavailable for the chatbot prompt', err instanceof Error ? err.message : err);
      return this.postsCache?.data ?? data;
    }
    this.postsCache = { at: Date.now(), data };
    return data;
  }

  /** System prompt + conversazione, con gli strumenti e gli articoli più pertinenti all'ultimo messaggio. */
  private async buildPromptMessages(messages: { role: string; content: string }[]): Promise<{ role: string; content: string }[]> {
    const last = messages[messages.length - 1]?.content ?? '';
    const [about, projects, posts] = await Promise.all([
      this.aboutService.get().catch(() => null),
      this.projectsService.findAll().catch(() => []) as Promise<PromptProject[]>,
      this.allPublishedPosts(),
    ]);
    const system = buildSystemPrompt(about, projects, selectPostsForPrompt(posts, last), buildLabBlock(last));
    return [{ role: 'system', content: system }, ...messages];
  }

  private readonly aiOptions = { model: 'openai/gpt-oss-120b', maxTokens: 900, timeoutMs: 20_000, source: 'chatbot' as const };

  // Provider attivo: Groq.
  private async callAI(
    messages: { role: string; content: string }[],
    lang?: string,
  ): Promise<{ content: string; suggestions?: string[]; liveOffer?: boolean; usedFallback: boolean }> {
    const last = messages[messages.length - 1].content;
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    // AI spenta dalla dashboard (interruttore d'emergenza): risposte predefinite.
    const aiEnabled = (await this.settings?.isEnabled('aiEnabled').catch(() => true)) ?? true;
    if (!apiKey || !aiEnabled) {
      return { ...this.getFallbackResponse(last, lang), usedFallback: true };
    }

    try {
      const raw = await this.aiProvider.chatCompletion(await this.buildPromptMessages(messages), this.aiOptions);
      if (!raw) return { ...this.getFallbackResponse(last, lang), usedFallback: true };
      return { ...parseAIReply(raw), usedFallback: false };
    } catch (err) {
      this.logger.warn('AI call failed, using fallback', err instanceof Error ? err.message : err);
      return { ...this.getFallbackResponse(last, lang), usedFallback: true };
    }
  }

  /**
   * Come callAI, ma il testo arriva a pezzi (`onDelta`) mentre il modello lo scrive. Le righe di servizio
   * (LIVE_OFFER/SUGGESTIONS) non vengono mai inviate come testo: escono solo nel risultato finale.
   * Se lo stream fallisce prima di mostrare qualcosa si ripiega sulla risposta predefinita; se fallisce a metà
   * si tiene il testo già mostrato invece di cancellarlo.
   */
  private async callAIStream(
    messages: { role: string; content: string }[],
    lang: string | undefined,
    onDelta: (text: string) => void,
  ): Promise<{ content: string; suggestions?: string[]; liveOffer?: boolean; usedFallback: boolean }> {
    const last = messages[messages.length - 1].content;
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    const aiEnabled = (await this.settings?.isEnabled('aiEnabled').catch(() => true)) ?? true;
    if (!apiKey || !aiEnabled) {
      return { ...this.getFallbackResponse(last, lang), usedFallback: true };
    }

    const filter = new StreamMarkerFilter();
    let partial = '';
    try {
      const raw = await this.aiProvider.chatCompletionStream(await this.buildPromptMessages(messages), this.aiOptions, (text) => {
        partial += text;
        const visible = filter.push(text);
        if (visible) onDelta(visible);
      });
      if (!raw) return { ...this.getFallbackResponse(last, lang), usedFallback: true };
      return { ...parseAIReply(raw), usedFallback: false };
    } catch (err) {
      this.logger.warn('AI stream failed', err instanceof Error ? err.message : err);
      if (partial.trim().length > 20) return { ...parseAIReply(partial), usedFallback: false };
      return { ...this.getFallbackResponse(last, lang), usedFallback: true };
    }
  }

  // Provider alternativo (Gemini) — tenuto per eventuale ripristino futuro.
  // private async callGeminiAI(messages: { role: string; content: string }[], lang?: string): Promise<string> {
  //   const apiKey = this.configService.get<string>('GEMINI_API_KEY');
  //   if (!apiKey) {
  //     return this.getFallbackResponse(messages[messages.length - 1].content);
  //   }
  //
  //   const contents = messages.map((m) => ({
  //     role: m.role === 'assistant' ? 'model' : 'user',
  //     parts: [{ text: m.content }],
  //   }));
  //
  //   try {
  //     const response = await fetch(
  //       `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
  //       {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify({
  //           system_instruction: { parts: [{ text: buildSystemPrompt(lang) }] },
  //           contents,
  //           generationConfig: { maxOutputTokens: 350, temperature: 0.7 },
  //         }),
  //         signal: AbortSignal.timeout(15_000),
  //       },
  //     );
  //
  //     if (!response.ok) {
  //       const err = await response.text();
  //       this.logger.warn(`Gemini responded with status ${response.status}: ${err}`);
  //       return this.getFallbackResponse(messages[messages.length - 1].content);
  //     }
  //
  //     const data = (await response.json()) as {
  //       candidates?: { content?: { parts?: { text?: string }[] } }[];
  //       usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
  //     };
  //     this.logger.log(`Gemini → ${data.usageMetadata?.promptTokenCount ?? '?'} prompt + ${data.usageMetadata?.candidatesTokenCount ?? '?'} completion tokens`);
  //     return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || this.getFallbackResponse(messages[messages.length - 1].content);
  //   } catch (err) {
  //     this.logger.warn('AI call failed, using fallback', err instanceof Error ? err.message : err);
  //     return this.getFallbackResponse(messages[messages.length - 1].content);
  //   }
  // }

  private getFallbackResponse(userMessage: string, uiLang?: string): { content: string; liveOffer?: boolean } {
    const liveOffer = CONTACT_INTENT_PATTERN.test(userMessage) || undefined;

    // La lingua del messaggio ha la precedenza; se non si riconosce, quella dell'interfaccia del sito.
    const language = detectLanguage(userMessage) ?? normalizeLang(uiLang);
    if (language && language !== 'en' && TOPIC_RESPONSES[language]) {
      const topic = TOPIC_PATTERNS.find((t) => t.pattern.test(userMessage))?.topic;
      const content = topic ? TOPIC_RESPONSES[language][topic] : (DEFAULT_LOCALIZED_FALLBACKS[language] ?? DEFAULT_FALLBACK);
      return { content, liveOffer };
    }

    for (const { pattern, response } of FALLBACK_RESPONSES) {
      if (pattern.test(userMessage)) return { content: response, liveOffer };
    }
    return { content: DEFAULT_FALLBACK, liveOffer };
  }
}
