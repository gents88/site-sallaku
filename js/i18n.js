/**
 * i18n – Internationalization System
 * Supports: IT (default), EN, SQ (Albanian)
 */
const i18n = {
    currentLang: 'it',
    
    translations: {
        // ══════════ ITALIANO ══════════
        it: {
            // Navbar
            'nav.about': 'About',
            'nav.tech': 'Tech Stack',
            'nav.projects': 'Progetti',
            'nav.services': 'Servizi',
            'nav.experience': 'Esperienza',
            'nav.skills': 'Soft Skills',
            'nav.contact': 'Contatti',

            // Hero
            'hero.badge': 'Disponibile per progetti enterprise',
            'hero.role': 'Senior Front-End Developer',
            'hero.description': 'Sono nato a Blinisht, nella regione di Zadrima, un piccolo villaggio nel nord-ovest dell\'Albania, incastonato tra colline, montagne e la costa adriatica. Crescere con quattro fratelli ha reso la mia infanzia vivace e formativa, fatta di collaborazione, creativita e un forte senso di comunita. Dopo la Rivolta albanese del 1997, mi sono unito all\'Associazione Ambasciatori di Pace, contribuendo alle attivita di sminamento e al supporto delle comunita colpite. Questa esperienza ha rafforzato in me resilienza, responsabilita e spirito di servizio. Nel mondo dell\'informatica ho iniziato a muovere i primi passi gia dal 2005, programmando piccole applicazioni e costruendo, nel tempo, un percorso fatto di studio e diverse esperienze lavorative che hanno consolidato le mie competenze tecniche. Oggi vivo a Torino, dopo molti anni vissuti a Milano. Dal 2018 progetto e sviluppo interfacce enterprise ad alte prestazioni nei settori banking, telco e aerospace. Con un background full-stack .NET, oggi sono specializzato in architetture scalabili basate su Angular e JavaScript, utilizzando diverse librerie per costruire applicazioni moderne, interattive e orientate ai dati, con particolare attenzione alla data visualization e al 3D web.',
            'hero.cta.projects': 'Progetti',
            'hero.cta.contact': 'Contatti',
            'hero.stat.years': 'Anni di esperienza',
            'hero.stat.companies': 'Aziende enterprise',
            'hero.stat.projects': 'Progetti completati',
            'hero.tag.1': 'Angular',
            'hero.tag.2': 'Web Applications',
            'hero.tag.3': 'UI/UX & Data Visualization 3D Web',
            'hero.scroll': 'Scorri',

            // Short hero / positioning
            'hero.short': 'Angular, JavaScript e TypeScript con RxJS — architetture modulari orientate a performance prevedibili e gestione reattiva dello stato. Integrazione di librerie JavaScript per data visualization e interfacce avanzate, con strategie di code splitting, lazy loading e telemetry per osservabilità e ottimizzazione runtime.',
            'cta.review': 'Richiedi una review architetturale',
            'cta.demo': 'Mostrami i tuoi dati — prenota una demo',
            'cta.consult': 'Avvia una consulenza tecnica (15 min)',

            // Positioning title + intro
            'positioning.title': 'Posizionamento',
            'positioning.intro': 'Progetto e consegno interfacce Angular scalabili per sistemi enterprise mission‑critical, riducendo latenza e aumentando affidabilità operativa.',

            // Case studies (HTML)
            'case.1': '<h3>Piattaforma Enterprise per Monitoraggio Operativo in Tempo Reale</h3><p><strong>Problema reale:</strong> Dashboard legacy non reggeva picchi di evento (latency &gt; 2s), memory leak lato client e dati aggregati troppo tardi per decisioni operative.</p><p><strong>Soluzione implementata:</strong> Rifattorizzazione in micro‑frontends Angular, stream processing WebSocket con backplane Kafka, lazy loading e OnPush change detection; cache LRU client-side e integrazione OpenTelemetry per observability.</p><p><strong>Tecnologie:</strong> Angular (standalone), RxJS, WebSocket, Kafka, Node.js gateway, OpenTelemetry, Chart.js.</p><p><strong>Impatto:</strong> -70% latenza dall\'evento alla visualizzazione, MTTR dimezzato, throughput x4 senza upgrade hardware, adozione interna +35%.</p>',
            'case.title': 'Case Studies',
            'case.2': '<h3>Suite di Dashboard Analitiche per KPI Finanziari</h3><p><strong>Problema reale:</strong> Serie storiche con milioni di punti causavano freeze UI e query lente lato API.</p><p><strong>Soluzione implementata:</strong> Pipeline di pre-aggregation su time-series DB, paginazione e virtual scroll nel client, caching semantico, Web Workers per calcoli pesanti e offscreen canvas per rendering complessi.</p><p><strong>Tecnologie:</strong> Angular, TypeScript, Web Workers, TimescaleDB, Redis, Chart.js / ApexCharts.</p><p><strong>Impatto:</strong> tempo medio di rendering ridotto da 6s a 800ms; CPU client peak -60%; affidabilità delle metriche aumentata grazie a materialized views.</p>',
            'case.3': '<h3>Visualizzazione 3D Geospaziale per Fleet Management</h3><p><strong>Problema reale:</strong> Visualizzazione in tempo reale di milioni di entità causava overload GPU/CPU e degrado UX su dispositivi enterprise.</p><p><strong>Soluzione implementata:</strong> Server-side tiling e clustering, stream differenziale (deltas) verso client; Cesium.js con LOD dinamico, culling e modalità "lite" per dispositivi limitati.</p><p><strong>Tecnologie:</strong> Cesium.js, WebGL optimizations, Node.js tiling service, protobuf diff streams, Redis.</p><p><strong>Impatto:</strong> entità visualizzabili in real-time aumentate da 50k a 1M mantenendo frame-rate sostenuto; consumo GPU client -40%; time-to-insight ~3x più veloce.</p>',

            // Banner / accessibility
            'banner.wip': 'Sito in costruzione — Work in progress',
            'skip.link': 'Vai al contenuto principale',

            // Contact cards
            'contact.card.email.title': 'Email',
            'contact.card.email.desc': 'gentsallaku@email.com',
            'contact.card.phone.title': 'Telefono',
            'contact.card.phone.desc': '+39 3892352291',
            'contact.card.pec.title': 'PEC',
            'contact.card.pec.desc': 'gent.sallaku@pec.it',
            'contact.card.linkedin.title': 'LinkedIn',
            'contact.card.linkedin.desc': '/in/gent-sallaku',
            'contact.card.github.title': 'GitHub',
            'contact.card.github.desc': '/gentsallaku',

            // About
            'about.tag': '&lt;about&gt;',
            'about.title.1': 'Chi ',
            'about.title.2': 'Sono',
            'about.vision.title': 'Visione End-to-End',
            'about.vision.desc': 'Approccio architetturale completo, dalla progettazione del design system alla delivery in produzione. Esperienza consolidata nel tradurre requisiti di business complessi in interfacce intuitive e performanti per contesti enterprise.',
            'about.perf.title': 'Performance & Scalabilità',
            'about.perf.desc': 'Focus costante sull\'ottimizzazione delle performance, lazy loading strategico, change detection ottimizzata e architetture modulari. Ogni componente è progettato per scalare in contesti ad alto traffico.',
            'about.lead.title': 'Leadership & Mentoring',
            'about.lead.desc': 'Guida tecnica di team front-end, definizione di best practice, code review strutturate e sessioni di mentoring. Costruisco team autonomi e competenti, promuovendo una cultura di qualità del codice.',
            'about.intro': '<p>Sono Gent Sallaku, Senior Front‑End & API Developer con oltre otto anni di esperienza nella progettazione e realizzazione di interfacce enterprise ad alte prestazioni. Mi occupo di architetture Angular scalabili, ottimizzazione delle performance, data visualization e soluzioni 3D per applicazioni realtime. Ho guidato refactor e iniziative di observability in contesti banking, telco e aerospace, riducendo la latenza e aumentando l\'affidabilità operativa.</p><p>Offro consulenza tecnica, code review e mentoring: trasformo requisiti complessi in soluzioni manutenibili, sicure e misurabili. Lavoro a stretto contatto con product team e ingegneri backend per mettere in produzione componenti che resistono al carico e facilitano decisioni operative basate sui dati.</p>',
            'hero.stat.latency': 'Riduzione latenza (tipica)',

            // Tech Stack
            'tech.tag': '&lt;tech-stack&gt;',
            'tech.title.1': 'Tech ',
            'tech.title.2': 'Stack',
            'tech.cat.frontend': 'Frontend Core',
            'tech.cat.ui': 'UI Frameworks',
            'tech.cat.dataviz': 'Data Viz & 3D',
            'tech.cat.backend': 'Backend',
            'tech.cat.devops': 'DevOps & Tools',

            // Projects
            'projects.tag': '&lt;projects&gt;',
            'projects.lead': 'Una panoramica più ampia dei lavori svolti in ambito enterprise: visualizzazione geospaziale, dashboard analitiche, librarie digitali e piattaforme assicurative con attenzione a UX, performance e integrazione API.',
            'projects.title.1': 'Progetti ',
            'projects.title.2': 'Chiave',
            'projects.geo.title': 'Visualizzazione 3D Geospaziale',
            'projects.geo.desc': 'Piattaforma interattiva per la visualizzazione geospaziale 3D con dati real-time. Rendering di entità geolocalizzate su globo terrestre, gestione layer multipli, analisi spaziale e integrazione con servizi GIS enterprise.',
            'projects.geo.f1': 'Globe 3D interattivo',
            'projects.geo.f2': 'Real-time data streaming',
            'projects.geo.f3': 'Layer management avanzato',
            'projects.geo.f4': 'Performance ottimizzate',
            'projects.vr.title': 'Virtual Tour 360°',
            'projects.vr.desc': 'Applicazione immersiva per virtual tour con navigazione fluida tra ambienti 360°. Hotspot interattivi, transizioni cinematiche, overlay informativi e supporto multi-device ottimizzato per mobile e desktop.',
            'projects.vr.f1': 'Navigazione immersiva 360°',
            'projects.vr.f2': 'Hotspot interattivi',
            'projects.vr.f3': 'Multi-device responsive',
            'projects.vr.f4': 'Transizioni fluide',
            'projects.dash.title': 'Dashboard Analytics',
            'projects.dash.desc': 'Suite di dashboard analitiche con Looker Embedded e visualizzazioni custom. KPI real-time, drill-down multi-livello, export dati, filtri dinamici e personalizzazione avanzata per stakeholder diversificati.',
            'projects.dash.f1': 'Looker Embedded integration',
            'projects.dash.f2': 'KPI real-time',
            'projects.dash.f3': 'Drill-down multi-livello',
            'projects.dash.f4': 'Custom visualizations',
            'projects.lib.title': 'Libraria',
            'projects.lib.desc': 'Piattaforma digitale per la gestione completa di librerie, catalogo e prestiti.',
            'projects.lib.f1': 'Catalogo libri centralizzato',
            'projects.lib.f2': 'Gestione prestiti e scadenze',
            'projects.lib.f3': 'Ricerca avanzata e filtri',
            'projects.lib.f4': 'Dashboard operativa in real-time',
            'projects.ins.title': 'Piattaforma Assicurativa',
            'projects.ins.desc': 'Soluzione web per il settore assicurativo con gestione polizze, sinistri e workflow approvativi.',
            'projects.ins.f1': 'Gestione polizze end-to-end',
            'projects.ins.f2': 'Workflow sinistri digitalizzato',
            'projects.ins.f3': 'Integrazione con servizi esterni',
            'projects.ins.f4': 'Audit trail e sicurezza dati',

            // Projects page CTA
            'projects.cta.ask.title': 'Vuoi parlarne?',
            'projects.cta.ask.desc': 'Se stai cercando uno sviluppo web enterprise o una consulenza su API, Angular, .NET o Django, puoi contattarmi direttamente dalla homepage.',

            'faq.tag': '&lt;faq&gt;',
            'faq.title.1': 'Domande ',
            'faq.title.2': 'Frequenti',
            'faq.q1': 'Di cosa ti occupi principalmente?',
            'faq.a1': 'Mi occupo di sviluppo web enterprise, interfacce Angular, API REST, data visualization e applicazioni 3D web.',
            'faq.q2': 'Lavori anche su backend?',
            'faq.a2': 'Sì, ho esperienza anche su .NET, Django, Python e integrazione di servizi API.',
            'faq.q3': 'Sei disponibile per progetti da remoto o ibridi?',
            'faq.a3': 'Sì, posso lavorare da remoto o in modalità ibrida a seconda delle esigenze del progetto.',
            'faq.q4': 'Come posso contattarti?',
            'faq.a4': 'Puoi scrivermi via email, PEC, chiamarmi o contattarmi su WhatsApp usando i riferimenti nella sezione contatti.',

            'contact.form.title': 'Invia un messaggio',
            'contact.form.name': 'Nome e cognome',
            'contact.form.email': 'Email',
            'contact.form.message': 'Messaggio',
            'contact.form.submit': 'Invia via Email',
            'contact.form.note': 'Il form apre il client email con il messaggio compilato. Per l\'invio automatico serve un endpoint server.',

            // Experience
            'exp.tag': '&lt;experience&gt;',
            'exp.title.1': 'Percorso ',
            'exp.title.2': 'Professionale',
            'exp.current': 'Attuale',
            'exp.previous': 'Precedente',

            'exp.1.title': 'Architettura Angular & 3D Web Enterprise',
            'exp.1.role': 'Senior Front-End Developer · ',
            'exp.1.desc': 'Guida tecnica su progetti enterprise nei settori aerospace e defence. Architettura Angular avanzata con moduli scalabili, visualizzazione 3D geospaziale con Cesium.js',
            'exp.2.title': 'Piattaforme Digitali & Data Visualization',
            'exp.2.role': 'Front-End Developer · Specialista Data Viz',
            'exp.2.desc': 'Sviluppo di piattaforme digitali innovative nel settore telco e media. Dashboard analitiche con Looker Embedded, virtual tour immersivi con Photo Sphere Viewer, integrazione API complesse e focus su performance e UX.',
            'exp.3.title': 'Consulenza Enterprise & Ecosistema Microsoft',
            'exp.3.role': 'Front-End Developer · Angular Consultant',
            'exp.3.desc': 'Consulenza enterprise su progetti Microsoft-based per clienti banking. Sviluppo di portali web complessi, integrazione con ecosistema Azure e transizione da architetture legacy a soluzioni Angular moderne.',
            'exp.4.title': 'Full-Stack Development & Architetture Software',
            'exp.4.role': 'Full-Stack Developer',
            'exp.4.desc': 'Sviluppo full-stack con tecnologie .NET e Angular. Progettazione di architetture software, sviluppo API RESTful e interfacce web per clienti del settore finanziario e assicurativo.',
            'exp.5.title': 'Fondamenta Software & Metodologie Agile',
            'exp.5.role': 'Junior Developer',
            'exp.5.desc': 'Inizio del percorso professionale nel mondo dello sviluppo software. Apprendimento delle fondamenta di .NET, prime esperienze con Angular e formazione su metodologie Agile e best practice di sviluppo.',

            // Skills
            'skills.tag': '&lt;soft-skills&gt;',
            'skills.title.1': 'Soft ',
            'skills.title.2': 'Skills',
            'skills.leadership.title': 'Leadership Tecnica',
            'skills.leadership.desc': 'Guida di team front-end con definizione di architetture, standard di sviluppo e processi di code review. Capacità di allineare scelte tecniche con obiettivi di business.',
            'skills.mentoring.title': 'Mentoring',
            'skills.mentoring.desc': 'Formazione attiva di sviluppatori junior e mid-level. Sessioni di pair programming, knowledge sharing strutturato e costruzione di percorsi di crescita personalizzati.',
            'skills.problem.title': 'Problem Solving',
            'skills.problem.desc': 'Approccio analitico e strutturato alla risoluzione di problemi complessi. Capacità di scomporre sfide tecniche in soluzioni incrementali e pragmatiche.',
            'skills.comm.title': 'Comunicazione',
            'skills.comm.desc': 'Comunicazione efficace con stakeholder tecnici e non tecnici. Capacità di tradurre concetti complessi in linguaggio accessibile per decision maker.',

            // Contact
            'contact.tag': '&lt;contact&gt;',
            'contact.title.1': 'Parliamo del tuo ',
            'contact.title.2': 'Progetto',
            'contact.subtitle': '....',

            // Services
            'services.tag': '&lt;services&gt;',
            'services.title': 'Servizi di sviluppo web e API',
            'services.lead': 'Progetto e sviluppo soluzioni enterprise per banking, telco, aerospace e insurance. Lavoro su interfacce Angular, backend .NET e Django, API REST, data visualization e web experience interattive.',
            'services.web.title': 'Sviluppo Web Enterprise',
            'services.web.desc': 'Architetture frontend scalabili, UI moderne, componenti riutilizzabili e attenzione costante a performance e manutenzione del codice.',
            'services.api.title': 'Sviluppo API',
            'services.api.desc': 'Progettazione e integrazione di API REST per applicazioni enterprise, con focus su sicurezza, chiarezza dei contratti e affidabilità.',
            'services.dataviz.title': 'Data Visualization',
            'services.dataviz.desc': 'Dashboard, KPI e visualizzazioni complesse per trasformare i dati in strumenti operativi utili ai decision maker.',
            'services.threed.title': '3D Web & Interactive UI',
            'services.threed.desc': 'Esperienze web immersive con Cesium.js, WebGL e interfacce interattive ottimizzate per mobile e desktop.',
            'services.cta.contact': 'Contatti',
            'services.cta.projects': 'Case Study',

            // Footer
            'footer.text': 'Progettato & Sviluppato da',
            'footer.highlight': 'Gent Sallaku',
        },

        // ══════════ ENGLISH ══════════
        en: {
            'nav.about': 'About',
            'nav.tech': 'Tech Stack',
            'nav.projects': 'Projects',
            'nav.services': 'Services',
            'nav.experience': 'Experience',
            'nav.skills': 'Soft Skills',
            'nav.contact': 'Contact',

            'hero.badge': 'Available for enterprise projects',
            'hero.role': 'Senior Front-End Developer',
                'hero.description': 'I was born in Blinisht, in the Zadrima region, a small village in northwestern Albania, surrounded by hills, mountains, and the Adriatic coast. Growing up with four siblings made my childhood lively and formative, shaped by collaboration, creativity, and a strong sense of community. After the Albanian Revolt of 1997, I joined the Peace Ambassadors Association, contributing to demining activities and support for affected communities. This experience strengthened my resilience, responsibility, and spirit of service. I started my first steps in computer science as early as 2005, programming small applications and building, over time, a path shaped by study and diverse work experiences that consolidated my technical skills. Today I live in Turin, after many years spent in Milan. Since 2018, I have designed and developed enterprise interfaces and high-performance applications in the banking, telco, and aerospace sectors. With a full-stack .NET background, I now specialize in scalable architectures based on Angular and JavaScript, leveraging different libraries to create modern, interactive, data-driven applications, with a strong focus on data visualization and 3D web.',
            'hero.cta.projects': 'Projects',
            'hero.cta.contact': 'Contact',
            'hero.stat.years': 'Years of experience',
            'hero.stat.companies': 'Enterprise companies',
            'hero.stat.projects': 'Completed projects',
            'hero.tag.1': 'Angular',
            'hero.tag.2': 'Web Applications',
            'hero.tag.3': 'UI/UX & Data Visualization 3D Web',
            'hero.scroll': 'Scroll',

            // Short hero / positioning
            'hero.short': 'Angular, JavaScript and TypeScript with RxJS — modular architectures focused on predictable performance and reactive state management. Integration of JavaScript libraries for data visualization and advanced interfaces, with code-splitting strategies, lazy loading and telemetry for observability and runtime optimization.',
            'cta.review': 'Request an architecture review',
            'cta.demo': 'Show me your data — book a demo',
            'cta.consult': 'Start a technical consultation (15 min)',

            // Positioning title + intro
            'positioning.title': 'Positioning',
            'positioning.intro': 'I design and deliver scalable Angular interfaces for mission‑critical enterprise systems, reducing latency and improving operational reliability.',

            // Case studies (HTML)
            'case.1': '<h3>Real-time Operational Monitoring Platform</h3><p><strong>Problem:</strong> Legacy dashboard could not handle event spikes (latency &gt; 2s), client memory leaks and late aggregations.</p><p><strong>Solution:</strong> Rearchitected into Angular micro‑frontends, WebSocket streaming backed by Kafka, lazy loading and OnPush change detection; client LRU cache and OpenTelemetry for observability.</p><p><strong>Technologies:</strong> Angular (standalone), RxJS, WebSocket, Kafka, Node.js gateway, OpenTelemetry, Chart.js.</p><p><strong>Impact:</strong> 70% latency reduction from event to view, MTTR halved, throughput x4 without hardware upgrades, internal adoption +35%.</p>',
            'case.title': 'Case Studies',
            'case.2': '<h3>Analytical Dashboards for Financial KPIs</h3><p><strong>Problem:</strong> Time-series with millions of points caused UI freezes and slow API queries.</p><p><strong>Solution:</strong> Pre-aggregation pipeline on a time-series DB, client virtual scroll and pagination, semantic caching, Web Workers for heavy compute and offscreen canvas for complex rendering.</p><p><strong>Technologies:</strong> Angular, TypeScript, Web Workers, TimescaleDB, Redis, Chart.js / ApexCharts.</p><p><strong>Impact:</strong> Average render time dropped from 6s to 800ms; client CPU peaks -60%; metric reliability improved via materialized views.</p>',
            'case.3': '<h3>Geospatial 3D Visualization for Fleet Management</h3><p><strong>Problem:</strong> Real-time visualization of millions of entities overloaded GPU/CPU and degraded UX on enterprise clients.</p><p><strong>Solution:</strong> Server-side tiling and clustering, differential (delta) streams to clients; Cesium.js with dynamic LOD, culling and a "lite" mode for constrained devices.</p><p><strong>Technologies:</strong> Cesium.js, WebGL optimizations, Node.js tiling service, protobuf diff streams, Redis.</p><p><strong>Impact:</strong> Real-time entities increased from 50k to 1M while maintaining stable frame-rate; client GPU usage -40%; time-to-insight ~3x faster.</p>',

            // Banner / accessibility
            'banner.wip': 'Site under construction — Work in progress',
            'skip.link': 'Skip to main content',

            // Contact cards
            'contact.card.email.title': 'Email',
            'contact.card.email.desc': 'gentsallaku@email.com',
            'contact.card.phone.title': 'Phone',
            'contact.card.phone.desc': '+39 3892352291',
            'contact.card.pec.title': 'PEC',
            'contact.card.pec.desc': 'gent.sallaku@pec.it',
            'contact.card.linkedin.title': 'LinkedIn',
            'contact.card.linkedin.desc': '/in/gent-sallaku',
            'contact.card.github.title': 'GitHub',
            'contact.card.github.desc': '/gentsallaku',

            'about.tag': '&lt;about&gt;',
            'about.title.1': 'About ',
            'about.title.2': 'Me',
            'about.vision.title': 'End-to-End Vision',
            'about.vision.desc': 'Complete architectural approach, from design system creation to production delivery. Proven experience translating complex business requirements into intuitive, high-performance interfaces for enterprise contexts.',
            'about.perf.title': 'Performance & Scalability',
            'about.perf.desc': 'Constant focus on performance optimization, strategic lazy loading, optimized change detection, and modular architectures. Every component is designed to scale in high-traffic contexts.',
            'about.lead.title': 'Leadership & Mentoring',
            'about.lead.desc': 'Technical leadership of front-end teams, defining best practices, structured code reviews, and mentoring sessions. I build autonomous and skilled teams, promoting a culture of code quality.',
            'about.intro': '<p>I\'m Gent Sallaku, a Senior Front‑End & API Developer with over eight years of experience designing and delivering high-performance enterprise interfaces. I focus on scalable Angular architectures, performance optimization, data visualization, and 3D solutions for realtime applications. I have led refactors and observability initiatives in banking, telco and aerospace contexts, reducing latency and improving operational reliability.</p><p>I offer technical consulting, code reviews and mentoring: I turn complex requirements into maintainable, secure and measurable solutions. I work closely with product teams and backend engineers to ship components that withstand load and enable data-driven operational decisions.</p>',
            'hero.stat.latency': 'Typical latency reduction',

            'tech.tag': '&lt;tech-stack&gt;',
            'tech.title.1': 'Tech ',
            'tech.title.2': 'Stack',
            'tech.cat.frontend': 'Frontend Core',
            'tech.cat.ui': 'UI Frameworks',
            'tech.cat.dataviz': 'Data Viz & 3D',
            'tech.cat.backend': 'Backend',
            'tech.cat.devops': 'DevOps & Tools',

            'projects.tag': '&lt;projects&gt;',
            'projects.lead': 'A broader overview of work done in the enterprise space: geospatial visualization, analytical dashboards, digital library platforms and insurance platforms, with focus on UX, performance and API integration.',
            'projects.title.1': 'Key ',
            'projects.title.2': 'Projects',
            'projects.geo.title': '3D Geospatial Visualization',
            'projects.geo.desc': 'Interactive platform for 3D geospatial visualization with real-time data. Rendering of geolocated entities on a globe, multi-layer management, spatial analysis, and enterprise GIS integration.',
            'projects.geo.f1': 'Interactive 3D Globe',
            'projects.geo.f2': 'Real-time data streaming',
            'projects.geo.f3': 'Advanced layer management',
            'projects.geo.f4': 'Optimized performance',
            'projects.vr.title': 'Virtual Tour 360°',
            'projects.vr.desc': 'Immersive virtual tour application with fluid navigation between 360° environments. Interactive hotspots, cinematic transitions, informational overlays, and multi-device support optimized for mobile and desktop.',
            'projects.vr.f1': 'Immersive 360° navigation',
            'projects.vr.f2': 'Interactive hotspots',
            'projects.vr.f3': 'Multi-device responsive',
            'projects.vr.f4': 'Fluid transitions',
            'projects.dash.title': 'Analytics Dashboard',
            'projects.dash.desc': 'Analytical dashboard suite with Looker Embedded and custom visualizations. Real-time KPIs, multi-level drill-down, data export, dynamic filters, and advanced customization for diverse stakeholders.',
            'projects.dash.f1': 'Looker Embedded integration',
            'projects.dash.f2': 'Real-time KPIs',
            'projects.dash.f3': 'Multi-level drill-down',
            'projects.dash.f4': 'Custom visualizations',
            'projects.lib.title': 'Library',
            'projects.lib.desc': 'Digital platform for complete library, catalog, and loan management.',
            'projects.lib.f1': 'Centralized book catalog',
            'projects.lib.f2': 'Loan and due-date management',
            'projects.lib.f3': 'Advanced search and filters',
            'projects.lib.f4': 'Real-time operational dashboard',
            'projects.ins.title': 'Insurance Platform',
            'projects.ins.desc': 'Web solution for the insurance domain with policy, claim, and approval workflow management.',
            'projects.ins.f1': 'End-to-end policy management',
            'projects.ins.f2': 'Digitized claims workflow',
            'projects.ins.f3': 'External service integrations',
            'projects.ins.f4': 'Audit trail and data security',

            'faq.tag': '&lt;faq&gt;',
            'faq.title.1': 'Frequently ',
            'faq.title.2': 'Asked Questions',
            'faq.q1': 'What do you mainly work on?',
            'faq.a1': 'I focus on enterprise web development, Angular interfaces, REST APIs, data visualization, and 3D web applications.',
            'faq.q2': 'Do you also work on backend?',
            'faq.a2': 'Yes, I also have experience with .NET, Django, Python, and API integrations.',
            'faq.q3': 'Are you available for remote or hybrid projects?',
            'faq.a3': 'Yes, I can work remotely or in a hybrid model depending on the project needs.',
            'faq.q4': 'How can I contact you?',
            'faq.a4': 'You can email, send a PEC message, call, or reach out on WhatsApp using the contact details in the contact section.',

            'contact.form.title': 'Send a message',
            'contact.form.name': 'Full name',
            'contact.form.email': 'Email',
            'contact.form.message': 'Message',
            'contact.form.submit': 'Send via Email',
            'contact.form.note': 'The form opens your email client with the message prefilled. Automatic sending requires a server endpoint.',

            'exp.tag': '&lt;experience&gt;',
            'exp.title.1': 'Professional ',
            'exp.title.2': 'Journey',
            'exp.current': 'Current',
            'exp.previous': 'Previous',

            'exp.1.title': 'Angular Architecture & Enterprise 3D Web',
            'exp.1.role': 'Senior Front-End Developer · ',
            'exp.1.desc': 'Technical leadership on enterprise projects in the aerospace and defence sectors. Advanced Angular architecture with scalable modules, 3D geospatial visualization with Cesium.js, front-end team mentoring, and development standards definition.',
            'exp.2.title': 'Digital Platforms & Data Visualization',
            'exp.2.role': 'Front-End Developer · Data Viz Specialist',
            'exp.2.desc': 'Development of innovative digital platforms in the telco and media sectors. Analytical dashboards with Looker Embedded, immersive virtual tours with Photo Sphere Viewer, complex API integration, and focus on performance and UX.',
            'exp.3.title': 'Enterprise Consulting & Microsoft Ecosystem',
            'exp.3.role': 'Front-End Developer · Angular Consultant',
            'exp.3.desc': 'Enterprise consulting on Microsoft-based projects for banking clients. Development of complex web portals, integration with Azure ecosystem, and transition from legacy architectures to modern Angular solutions.',
            'exp.4.title': 'Full-Stack Development & Software Architecture',
            'exp.4.role': 'Full-Stack Developer',
            'exp.4.desc': 'Full-stack development with .NET and Angular technologies. Software architecture design, RESTful API development, and web interfaces for financial and insurance sector clients.',
            'exp.5.title': 'Software Foundations & Agile Methodologies',
            'exp.5.role': 'Junior Developer',
            'exp.5.desc': 'Start of the professional journey in software development. Learning .NET fundamentals, first experiences with Angular, and training in Agile methodologies and development best practices.',

            'skills.tag': '&lt;soft-skills&gt;',
            'skills.title.1': 'Soft ',
            'skills.title.2': 'Skills',
            'skills.leadership.title': 'Technical Leadership',
            'skills.leadership.desc': 'Leading front-end teams with architecture definition, development standards, and code review processes. Ability to align technical choices with business objectives.',
            'skills.mentoring.title': 'Mentoring',
            'skills.mentoring.desc': 'Active training of junior and mid-level developers. Pair programming sessions, structured knowledge sharing, and building personalized growth paths.',
            'skills.problem.title': 'Problem Solving',
            'skills.problem.desc': 'Analytical and structured approach to solving complex problems. Ability to break down technical challenges into incremental and pragmatic solutions.',
            'skills.comm.title': 'Communication',
            'skills.comm.desc': 'Effective communication with both technical and non-technical stakeholders. Ability to translate complex concepts into accessible language for decision makers.',

            'contact.tag': '&lt;contact&gt;',
            'contact.title.1': "Let's talk about your ",
            'contact.title.2': 'Project',
            'contact.subtitle': '....',

            // Services
            'services.tag': '&lt;services&gt;',
            'services.title': 'Web & API Development Services',
            'services.lead': 'I design and build enterprise solutions for banking, telco, aerospace and insurance. I work on Angular frontends, .NET/Django backends, REST APIs, data visualization and interactive web experiences.',
            'services.web.title': 'Enterprise Web Development',
            'services.web.desc': 'Scalable frontend architectures, modern UIs, reusable components and strong focus on performance and maintainability.',
            'services.api.title': 'API Development',
            'services.api.desc': 'Design and integration of REST APIs for enterprise applications, focusing on security, clear contracts and reliability.',
            'services.dataviz.title': 'Data Visualization',
            'services.dataviz.desc': 'Dashboards, KPIs and complex visualizations to turn data into actionable tools for decision makers.',
            'services.threed.title': '3D Web & Interactive UI',
            'services.threed.desc': 'Immersive web experiences with Cesium.js, WebGL and interactive UIs optimized for mobile and desktop.',
            'services.cta.contact': 'Contact',
            'services.cta.projects': 'Case Studies',

            'footer.text': 'Designed & Developed by',
            'footer.highlight': 'Gent Sallaku',
        },

        // ══════════ SHQIP (Albanian) ══════════
        sq: {
            'nav.about': 'Rreth Meje',
            'nav.tech': 'Teknologjitë',
            'nav.projects': 'Projekte',
            'nav.services': 'Sherbime',
            'nav.experience': 'Përvoja',
            'nav.skills': 'Aftësitë',
            'nav.contact': 'Kontakt',

            'hero.badge': 'I disponueshëm për projekte enterprise',
            'hero.role': 'Senior Front-End Developer',
            'hero.description': 'Kam lindur ne Blinisht, ne zonen e Zadrimes, nje fshat i vogel ne veriperendim te Shqiperise, i rrethuar nga kodra, male dhe bregdeti Adriatik. Te rritesh me kater vellezer e beri femijerine time te gjalle dhe formuese, te karakterizuar nga bashkepunimi, kreativiteti dhe nje ndjenje e forte komuniteti. Pas Revoltes shqiptare te vitit 1997, iu bashkova Shoqates Ambasadoret e Paqes, duke kontribuar ne aktivitetet e ndryshme dhe ne mbeshtetjen e komuniteteve te prekura. Kjo pervoje forcoi tek une qendresen, pergjegjesine dhe shpirtin e sherbimit. Ne boten e informatikes hodha hapat e pare qe ne vitin 2005, duke programuar aplikacione te vogla dhe duke ndertuar, me kalimin e kohes, nje rrugetim te mbeshtetur nga studimi dhe pervoja te ndryshme pune qe forcuan aftesite e mia teknike. Sot jetoj ne Torino, pas shume vitesh te kaluara ne Milano. Qe nga viti 2018 projektoj dhe zhvilloj nderfaqe enterprise dhe aplikacione me performance te larte ne sektoret bankar, telekomunikacion dhe hapesinor. Me nje sfond full-stack .NET, sot jam i specializuar ne arkitektura te shkallezueshme te bazuara ne Angular dhe JavaScript, duke shfrytezuar librari te ndryshme per te krijuar aplikacione moderne, interaktive dhe te orientuara nga te dhenat, me fokus te vecante te data visualization dhe 3D web.',
            'hero.cta.projects': 'Projekte',
            'hero.cta.contact': 'Kontakt',
            'hero.stat.years': 'Vite përvojë',
            'hero.stat.companies': 'Kompani enterprise',
            'hero.stat.projects': 'Projekte të përfunduara',
            'hero.tag.1': 'Angular',
            'hero.tag.2': 'Aplikacione Web',
            'hero.tag.3': 'UI/UX & Data Visualization 3D Web',
            'hero.scroll': 'Shkruaj',

            // Short hero / positioning
            'hero.short': 'Angular, JavaScript dhe TypeScript me RxJS — arkitektura modulare të orientuara drejt performancës së parashikueshme dhe menaxhimit reaktiv të gjendjes. Integrimi i bibliotekave JavaScript për vizualizimin e të dhënave dhe ndërfaqe të avancuara, me strategji për ndarjen e kodit (code-splitting), lazy loading dhe telemetry për vëzhgueshmëri dhe optimizim në kohë të ekzekutimit.',
            'cta.review': 'Kërko një rishikim arkitekturor',
            'cta.demo': 'Trego të dhënat tuaja — rezervoni një demo',
            'cta.consult': 'Nisni një konsultë teknike (15 min)',

            // Positioning title + intro
            'positioning.title': 'Pozicionimi',
            'positioning.intro': 'Projektoj dhe dorëzoj ndërfaqe Angular të shkallëzueshme për sisteme enterprise mission‑critical, duke ulur vonesën dhe rritur besueshmërinë operative.',

            // Case studies (HTML)
            'case.1': '<h3>Platformë Monitoring Operacional në Kohë reale</h3><p><strong>Problem:</strong> Dashboard legacy nuk përballonte pikat e ngarkesës (latencë &gt; 2s), memory leak dhe agregime të vonuara.</p><p><strong>Zgjidhja:</strong> Rifaktorim në micro‑frontends Angular, stream WebSocket me backplane Kafka, lazy loading dhe OnPush; cache LRU klient-side dhe OpenTelemetry për observability.</p><p><strong>Teknologji:</strong> Angular, RxJS, WebSocket, Kafka, Node.js gateway, OpenTelemetry, Chart.js.</p><p><strong>Impakt:</strong> -70% latencë, MTTR u përgjysmua, throughput x4 pa upgrade hardware, adoption +35%.</p>',
            'case.title': 'Studime Raste',
            'case.2': '<h3>Dashboard Analitike për KPI Financiare</h3><p><strong>Problem:</strong> Seri kohore me miliona pika shkaktonin freeze UI dhe query të ngadalta.</p><p><strong>Zgjidhja:</strong> Pipeline pre-aggregation në time-series DB, virtual scroll dhe pagination në klient, semantic caching, Web Workers dhe offscreen canvas për rendering kompleks.</p><p><strong>Teknologji:</strong> Angular, TypeScript, Web Workers, TimescaleDB, Redis, Chart.js / ApexCharts.</p><p><strong>Impakt:</strong> Koha mesatare e rendering u ul nga 6s në 800ms; CPU -60%; besueshmëria e metrikave u përmirësua.</p>',
            'case.3': '<h3>Vizualizim 3D Gjeohapësinor për Fleet Management</h3><p><strong>Problem:</strong> Vizualizimi real-time i miliona entiteteve ngarkonte GPU/CPU dhe degradoi UX.</p><p><strong>Zgjidhja:</strong> Server-side tiling dhe clustering, stream diferencial, Cesium.js me LOD dinamik, culling dhe modalitet "lite" për pajisje të kufizuara.</p><p><strong>Teknologji:</strong> Cesium.js, optimizime WebGL, Node.js tiling service, protobuf diff streams, Redis.</p><p><strong>Impakt:</strong> Entitetet real-time rritën nga 50k në 1M, frame-rate i qëndrueshëm; GPU -40%; time-to-insight ~3x më i shpejtë.</p>',

            // Banner / accessibility
            'banner.wip': 'Faqja në ndërtim — Work in progress',
            'skip.link': 'Shko te përmbajtja kryesore',

            // Contact cards
            'contact.card.email.title': 'Email',
            'contact.card.email.desc': 'gentsallaku@email.com',
            'contact.card.phone.title': 'Telefon',
            'contact.card.phone.desc': '+39 3892352291',
            'contact.card.pec.title': 'PEC',
            'contact.card.pec.desc': 'gent.sallaku@pec.it',
            'contact.card.linkedin.title': 'LinkedIn',
            'contact.card.linkedin.desc': '/in/gent-sallaku',
            'contact.card.github.title': 'GitHub',
            'contact.card.github.desc': '/gentsallaku',

            'about.tag': '&lt;about&gt;',
            'about.title.1': 'Rreth ',
            'about.title.2': 'Meje',
            'about.vision.title': 'Vizion End-to-End',
            'about.vision.desc': 'Qasje arkitekturore e plotë, nga projektimi i design system deri te delivery në prodhim. Përvojë e konsoliduar në përkthimin e kërkesave komplekse të biznesit në ndërfaqe intuitive dhe performante për kontekste enterprise.',
            'about.perf.title': 'Performancë & Shkallëzueshmëri',
            'about.perf.desc': 'Fokus i vazhdueshëm në optimizimin e performancës, lazy loading strategjik, change detection i optimizuar dhe arkitektura modulare. Çdo komponent është projektuar për të shkallëzuar në kontekste me trafik të lartë.',
            'about.lead.title': 'Lidershipi & Mentorimi',
            'about.lead.desc': 'Udhëheqje teknike e ekipeve front-end, përcaktimi i best practice, code review të strukturuara dhe sesione mentorimi. Ndërtoj ekipe autonome dhe kompetente, duke promovuar një kulturë të cilësisë së kodit.',
            'about.intro': '<p>Unë jam Gent Sallaku, Senior Front‑End & API Developer me mbi tetë vjet eksperiencë në projektimin dhe realizimin e ndërfaqeve enterprise me performancë të lartë. Merren me arkitektura Angular të shkallëzueshme, optimizimin e performancës, data visualization dhe zgjidhje 3D për aplikacione realtime. Kam udhëhequr refaktorime dhe iniciativa observability në sektorë si banking, telco dhe aerospace, duke ulur latencën dhe rritur besueshmërinë operative.</p><p>Ofroj konsulencë teknike, code review dhe mentoring: transformoj kërkesa komplekse në zgjidhje të mirëmbajtshme, të sigurta dhe të matshme. Bashkëpunoj ngushtë me product team dhe inxhinierë backend për të vënë në prodhim komponentë që përballojnë ngarkesën dhe lehtësojnë vendimmarrjen operacionale të bazuar në të dhëna.</p>',
            'hero.stat.latency': 'Reduktim tipik i latencës',

            'tech.tag': '&lt;tech-stack&gt;',
            'tech.title.1': 'Tech ',
            'tech.title.2': 'Stack',
            'tech.cat.frontend': 'Frontend Core',
            'tech.cat.ui': 'UI Frameworks',
            'tech.cat.dataviz': 'Data Viz & 3D',
            'tech.cat.backend': 'Backend',
            'tech.cat.devops': 'DevOps & Tools',

            'projects.tag': '&lt;projects&gt;',
            'projects.lead': 'Një përmbledhje më e gjerë e punëve në fushën enterprise: vizualizim gjeohapësinor, dashboard analitike, platforma biblioteka digjitale dhe platforma sigurimesh, me fokus në UX, performancë dhe integrim API.',
            'projects.title.1': 'Projekte ',
            'projects.title.2': 'Kryesore',
            'projects.geo.title': 'Vizualizim 3D Gjeohapësinor',
            'projects.geo.desc': 'Platformë interaktive për vizualizimin gjeohapësinor 3D me të dhëna real-time. Rendering i entiteteve të gjeolokalizuara në globin tokësor, menaxhimi i shtresave të shumta, analizë hapësinore dhe integrim me shërbime GIS enterprise.',
            'projects.geo.f1': 'Globe 3D interaktiv',
            'projects.geo.f2': 'Real-time data streaming',
            'projects.geo.f3': 'Menaxhim i avancuar i shtresave',
            'projects.geo.f4': 'Performancë e optimizuar',
            'projects.vr.title': 'Virtual Tour 360°',
            'projects.vr.desc': 'Aplikacion imersiv për virtual tour me navigim të rrjedhshëm mes ambienteve 360°. Hotspot interaktivë, tranzicione kinematike, overlay informative dhe mbështetje multi-device e optimizuar për mobile dhe desktop.',
            'projects.vr.f1': 'Navigim imersiv 360°',
            'projects.vr.f2': 'Hotspot interaktivë',
            'projects.vr.f3': 'Multi-device responsive',
            'projects.vr.f4': 'Tranzicione të rrjedhshme',
            'projects.dash.title': 'Dashboard Analitike',
            'projects.dash.desc': 'Suitë dashboard analitike me Looker Embedded dhe vizualizime custom. KPI real-time, drill-down me shumë nivele, eksport të dhënash, filtra dinamikë dhe personalizim i avancuar për stakeholder të ndryshëm.',
            'projects.dash.f1': 'Integrim Looker Embedded',
            'projects.dash.f2': 'KPI real-time',
            'projects.dash.f3': 'Drill-down me shumë nivele',
            'projects.dash.f4': 'Vizualizime custom',
            'projects.lib.title': 'Librari',
            'projects.lib.desc': 'Platforme dixhitale per menaxhimin e plote te bibliotekave, katalogut dhe huazimeve.',
            'projects.lib.f1': 'Katalog i centralizuar i librave',
            'projects.lib.f2': 'Menaxhim i huazimeve dhe afateve',
            'projects.lib.f3': 'Kerkim i avancuar dhe filtra',
            'projects.lib.f4': 'Dashboard operativ ne kohe reale',
            'projects.ins.title': 'Platforme Sigurimesh',
            'projects.ins.desc': 'Zgjidhje web per sektorin e sigurimeve me menaxhim te policave, demeve dhe workflow te aprovimeve.',
            'projects.ins.f1': 'Menaxhim end-to-end i policave',
            'projects.ins.f2': 'Workflow i digjitalizuar i demeve',
            'projects.ins.f3': 'Integrim me sherbime te jashtme',
            'projects.ins.f4': 'Audit trail dhe sigurie e te dhenave',

            'faq.tag': '&lt;faq&gt;',
            'faq.title.1': 'Pyetje të ',
            'faq.title.2': 'Shpeshta',
            'faq.q1': 'Me çfarë merresh kryesisht?',
            'faq.a1': 'Merren me zhvillim web enterprise, ndërfaqe Angular, API REST, vizualizim të dhënash dhe aplikacione 3D web.',
            'faq.q2': 'A punon edhe me backend?',
            'faq.a2': 'Po, kam përvojë edhe me .NET, Django, Python dhe integrime API.',
            'faq.q3': 'Je i disponueshëm për projekte remote ose hibride?',
            'faq.a3': 'Po, mund të punoj remote ose në mënyrë hibride sipas nevojës së projektit.',
            'faq.q4': 'Si mund të kontaktoj me ty?',
            'faq.a4': 'Mund të më kontaktosh me email, PEC, telefon ose WhatsApp duke përdorur të dhënat te seksioni i kontaktit.',

            'contact.form.title': 'Dërgo një mesazh',
            'contact.form.name': 'Emër dhe mbiemër',
            'contact.form.email': 'Email',
            'contact.form.message': 'Mesazh',
            'contact.form.submit': 'Dërgo me Email',
            'contact.form.note': 'Formulari hap klientin e emailit me mesazhin të plotësuar. Dërgimi automatik kërkon një endpoint server.',

            'exp.tag': '&lt;experience&gt;',
            'exp.title.1': 'Rrugëtimi ',
            'exp.title.2': 'Profesional',
            'exp.current': 'Aktuale',
            'exp.previous': 'E mëparshme',

            'exp.1.title': 'Arkitekturë Angular & Web 3D Enterprise',
            'exp.1.role': 'Senior Front-End Developer',
            'exp.1.desc': 'Udhëheqje teknike në projekte enterprise në sektorët e hapësirës dhe mbrojtjes. Arkitekturë Angular e avancuar me module të shkallëzueshme, vizualizim 3D gjeohapësinor me Cesium.js, mentorim i ekipit front-end dhe përcaktim i standardeve të zhvillimit.',
            'exp.2.title': 'Platforma Dixhitale & Vizualizim të Dhënash',
            'exp.2.role': 'Front-End Developer · Specialist Data Viz',
            'exp.2.desc': 'Zhvillim i platformave dixhitale inovative në sektorët telekomunikacion dhe media. Dashboard analitike me Looker Embedded, virtual tour imersivë me Photo Sphere Viewer, integrim API komplekse dhe fokus në performancë dhe UX.',
            'exp.3.title': 'Konsulencë Enterprise & Ekosistemi Microsoft',
            'exp.3.role': 'Front-End Developer · Konsulent Angular',
            'exp.3.desc': 'Konsulencë enterprise në projekte Microsoft-based për klientë bankarë. Zhvillim i portaleve web komplekse, integrim me ekosistemin Azure dhe tranzicion nga arkitekturat legacy në zgjidhje moderne Angular.',
            'exp.4.title': 'Zhvillim Full-Stack & Arkitekturë Software',
            'exp.4.role': 'Full-Stack Developer',
            'exp.4.desc': 'Zhvillim full-stack me teknologji .NET dhe Angular. Projektim i arkitekturave software, zhvillim i API RESTful dhe ndërfaqeve web për klientë të sektorit financiar dhe sigurimeve.',
            'exp.5.title': 'Bazat e Software & Metodologjitë Agile',
            'exp.5.role': 'Junior Developer',
            'exp.5.desc': 'Fillimi i rrugëtimit profesional në botën e zhvillimit software. Mësimi i bazave të .NET, përvojat e para me Angular dhe trajnim mbi metodologjitë Agile dhe best practice të zhvillimit.',

            'skills.tag': '&lt;soft-skills&gt;',
            'skills.title.1': 'Aftësitë ',
            'skills.title.2': 'e mia',
            'skills.leadership.title': 'Lidershipi Teknik',
            'skills.leadership.desc': 'Udhëheqje e ekipeve front-end me përcaktimin e arkitekturave, standardeve të zhvillimit dhe proceseve të code review. Aftësi për të harmonizuar zgjedhjet teknike me objektivat e biznesit.',
            'skills.mentoring.title': 'Mentorimi',
            'skills.mentoring.desc': 'Trajnim aktiv i zhvilluesve junior dhe mid-level. Sesione pair programming, ndarje e strukturuar e njohurive dhe ndërtim i rrugëve të rritjes së personalizuara.',
            'skills.problem.title': 'Zgjidhja e Problemeve',
            'skills.problem.desc': 'Qasje analitike dhe e strukturuar për zgjidhjen e problemeve komplekse. Aftësi për të zbërthyer sfidat teknike në zgjidhje incrementale dhe pragmatike.',
            'skills.comm.title': 'Komunikimi',
            'skills.comm.desc': 'Komunikim efektiv me stakeholder teknikë dhe jo-teknikë. Aftësi për të përkthyer koncepte komplekse në gjuhë të aksesueshme për vendimmarrësit.',

            'contact.tag': '&lt;contact&gt;',
            'contact.title.1': 'Le të flasim për ',
            'contact.title.2': 'Projektin tënd',
            'contact.subtitle': '....',

            // Services
            'services.tag': '&lt;services&gt;',
            'services.title': 'Shërbime zhvillimi web dhe API',
            'services.lead': 'Projektim dhe zhvillim zgjidhjesh enterprise për banking, telco, aerospace dhe insurance.',
            'services.web.title': 'Zhvillim Web Enterprise',
            'services.web.desc': 'Arkitektura frontend të shkallëzueshme, UI moderne, komponentë të ripërdorshëm dhe fokus i vazhdueshëm në performancë dhe mirëmbajtje të kodit.',
            'services.api.title': 'Zhvillim API',
            'services.api.desc': 'Projektim dhe integrim API REST për aplikacione enterprise, me fokus në siguri, qartësi kontraktesh dhe besueshmëri.',
            'services.dataviz.title': 'Data Visualization',
            'services.dataviz.desc': 'Dashboard, KPI dhe vizualizime komplekse për të kthyer të dhënat në mjete operacionale për vendimmarrësit.',
            'services.threed.title': '3D Web & UI Interaktive',
            'services.threed.desc': 'Eksperienca web imersive me Cesium.js, WebGL dhe ndërfaqe interaktive të optimizuara për mobile dhe desktop.',
                'services.cta.contact': 'Kontakt',
                'services.cta.projects': 'Case Study',

            'footer.text': 'Projektuar & Zhvilluar nga',
            'footer.highlight': 'Gent Sallaku',
                // Projects page CTA (sq)
                'projects.cta.ask.title': 'Doni të flasim?',
                'projects.cta.ask.desc': 'Nëse po kërkoni zhvillim web enterprise ose konsultim për API, Angular, .NET ose Django, mund të më kontaktoni drejtpërdrejt nga faqja kryesore.',
        }
    },

    /**
     * Get translation for key
     */
    t(key) {
        return this.translations[this.currentLang]?.[key] 
            || this.translations['it']?.[key] 
            || key;
    },

    /**
     * Set language and update all DOM elements
     */
    setLanguage(lang) {
        if (!this.translations[lang]) return;
        this.currentLang = lang;
        localStorage.setItem('gs-portfolio-lang', lang);
        document.documentElement.lang = lang === 'sq' ? 'sq' : lang;
        this.updateDOM();
        this.updateLangSwitcher();
    },

    /**
     * Update all DOM elements with data-i18n attribute
     */
    updateDOM() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
                const translation = this.t(key);

                // If translation missing, this.t returns the key itself — don't overwrite
                if (!translation || translation === key) return;

                if (el.hasAttribute('data-i18n-html')) {
                    el.innerHTML = translation;
                } else {
                    el.textContent = translation;
                }
        });

        // Update placeholders (inputs / textarea)
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            if (translation) el.setAttribute('placeholder', translation);
        });

        // Update arbitrary attributes via data-i18n-attr="attr:key,attr2:key2"
        document.querySelectorAll('[data-i18n-attr]').forEach(el => {
            const raw = el.getAttribute('data-i18n-attr');
            // pairs like "aria-label:cta.review,title:some.key"
            raw.split(',').forEach(pair => {
                const [attr, k] = pair.split(':').map(s => s && s.trim());
                if (!attr || !k) return;
                const translation = this.t(k);
                if (translation && translation !== k) el.setAttribute(attr, translation);
            });
        });

        // Update section titles with gradient spans
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const part1 = this.t(key + '.1');
            const part2 = this.t(key + '.2');
            el.innerHTML = `${part1}<span class="text-gradient">${part2}</span>`;
        });
    },

    /**
     * Update language switcher active state
     */
    updateLangSwitcher() {
        document.querySelectorAll('.lang-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
        });
    },

    /**
     * Initialize i18n system
     */
    init() {
        const saved = localStorage.getItem('gs-portfolio-lang');
        if (saved && this.translations[saved]) {
            this.currentLang = saved;
        }
        document.documentElement.lang = this.currentLang === 'sq' ? 'sq' : this.currentLang;
        this.updateDOM();
        this.updateLangSwitcher();
    }
};

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    i18n.init();
});