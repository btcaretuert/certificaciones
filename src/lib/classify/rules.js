/**
 * Tabla de reglas del clasificador.
 *
 * Cada regla lleva `priority` EXPLICITA. El clasificador ordena por prioridad
 * antes de evaluar, de modo que el orden en que estan escritas aqui es
 * semanticamente inerte: reordenar el array no puede cambiar ninguna salida.
 * Sin esto, mover una linea alteraba decenas de clasificaciones en silencio.
 *
 * Prioridad menor = se evalua antes = gana. Los rangos dejan hueco a proposito
 * para poder insertar sin renumerar.
 */

export const DOMAIN_RULES = [
  // ── 100s: senales inequivocas y especificas ──────────────────────────────
  { domain: 'gobierno-datos', priority: 100,
    re: /gobierno de datos|data governance|\bdama\b|\bcmdp\b|calidad de datos|linaje de datos|metadato/ },

  { domain: 'ofimatica-colaboracion', priority: 110,
    re: /office ?365|microsoft 365|\bexcel\b|powerpoint|outlook|sharepoint|onedrive|one drive|yammer|delve|planner|power automate|microsoft forms|\bteams\b|ofimatic|hoja de calculo/ },

  { domain: 'devops', priority: 120,
    re: /\bdevops\b|ci\/cd|integracion continua|entrega continua|terraform|gitlab|jenkins|ansible|infraestructura como codigo|control de versiones/ },

  { domain: 'sistemas-linux', priority: 130,
    re: /\blinux\b|\bunix\b|\brhce\b|grep, awk|\bsplunk\b|administracion de sistemas|observabilidad/ },

  { domain: 'seguridad', priority: 140,
    re: /segurid|hacking|ciberseg|proteccion de datos|riesgos informaticos|\bethical\b|\bgdpr\b/ },

  // ── 200s: bloque de datos ────────────────────────────────────────────────
  { domain: 'ingenieria-datos', priority: 200,
    re: /ingenieria de datos|data engineer|\betl\b|\bspark\b|hadoop|kafka|\bdbt\b|dataflow|apache beam|big data|data warehouse|data lake|bigquery|almacen de datos|streaming|pipeline de datos/ },

  { domain: 'ml-ia', priority: 210,
    re: /machine learning|deep learning|aprendizaje automatico|redes neuronales|inteligencia artificial|generative ai|\bia\b|claude|antigravity|vibe coding|superminds|interfaces conversacionales|\bnlp\b/ },

  { domain: 'analitica-bi', priority: 220,
    re: /analisis de (informacion|datos)|analitica|visualizacion de datos|power bi|tableau|looker|estadistic|detectar patrones|ciencia de datos|data scien|dashboard/ },

  { domain: 'bases-datos', priority: 230,
    re: /mongodb|nosql|\bsql\b|base de datos|firebase|postgres|mysql|oracle/ },

  // ── 300s: cloud y desarrollo ─────────────────────────────────────────────
  { domain: 'cloud-plataforma', priority: 300,
    re: /google cloud|\bgcp\b|\bcloud\b|\bnube\b|kubernetes|docker|contenedor|serverless|associate cloud engineer|digital leader/ },

  { domain: 'programacion', priority: 310,
    re: /\bpython\b|django|\bjson\b|\bapi\b|postman|desarrollo web|programacion|javascript|\bjava\b|internet de las cosas|\biot\b|\bgit\b/ },

  // ── 400s: gestion ────────────────────────────────────────────────────────
  { domain: 'agile-proyectos', priority: 400,
    re: /\bagile\b|\bagil\b|scrum|kanban|six sigma|\blean\b|gestion de proyecto|\bpmi\b|\bpmp\b|metodologia|\bsprint\b|\bitil\b/ },

  { domain: 'gestion-personas', priority: 410,
    re: /contrataci|reclutamiento|seleccion de personal|onboarding|integrar a nuevos|retener|alto potencial|recursos humanos|evaluacion de desempeno|diversidad|inclusion|\btalento\b|acoso laboral|intimidacion|clima laboral/ },

  { domain: 'creatividad-innovacion', priority: 420,
    re: /design thinking|creativ|innovaci|ideacion|prototip|bloqueo creativo/ },

  // ── 500s: comunicacion antes que negocio: "ingles de negocios" es un
  //    curso de idioma, no de estrategia. ──────────────────────────────────
  { domain: 'comunicacion', priority: 500,
    re: /\bingles\b|idioma|comunicaci|comunicar|presentaci|hablar en publico|escribir|redacci|negociaci|persuasi|storytelling|reunion|toma de notas|escucha|elevator pitch|feedback|retroalimentacion|conversacion|gente dificil/ },

  { domain: 'transformacion-digital', priority: 510,
    re: /transformacion digital|economia naranja|cuarta revolucion|digitaliza|blockchain|fintech|aprovechar la tecnologia|comprender .{0,12}tecnologia/ },

  { domain: 'estrategia-negocio', priority: 520,
    re: /estrategi|\bokr\b|planificacion|toma de decisiones|\bnegocio\b|finanzas|\bventa\b|\bcliente\b|emprend|modelo de negocio|competir|innove/ },

  // ── 600s: liderazgo es amplio; va tarde para no absorber lo especifico ──
  { domain: 'liderazgo-equipos', priority: 600,
    re: /liderazgo|liderar|\blider\b|\bequipos?\b|coaching|mentor|delegar|motivar|empoderar|gestion de personas|dirigir|supervisor|gerent|\bjefe\b|gestiona los cambios|navegar el cambio/ },

  // ── 700s: cajon de habilidades personales, el ultimo en evaluarse ───────
  { domain: 'efectividad-personal', priority: 700,
    re: /productividad|gestion del tiempo|concentracion|habito|bienestar|estres|resiliencia|teletrabajo|trabajo remoto|oficina movil|desarrollo personal|felicidad|habilidades para la vida|carrera profesional|curriculum|entrevista|\bempleo\b|linkedin|pensamiento critico|aprendizaje|memoria|atmosfera de trabajo|tiempos dificiles|zona de confort|confianza|procrastinacion|burnout|sesgos|resolver problemas|resolucion de problemas|vida social|vida personal/ },
];

/**
 * Tecnologias. Faceta multiple: una entrada puede activar varias.
 * Docker separado de Kubernetes: son productos distintos y un reclutador
 * que filtra por uno no espera encontrar el otro.
 */
export const TECH_RULES = [
  { tech: 'gcp', re: /\bgcp\b|google cloud|bigquery|dataflow|looker|cloud digital leader|associate cloud engineer|\bgke\b/ },
  { tech: 'kubernetes', re: /kubernetes|\bgke\b/ },
  { tech: 'docker', re: /docker|contenedor/ },
  { tech: 'spark', re: /\bspark\b|pyspark/ },
  { tech: 'hadoop', re: /hadoop/ },
  { tech: 'kafka', re: /kafka/ },
  { tech: 'dbt', re: /\bdbt\b/ },
  { tech: 'apache-beam', re: /apache beam|dataflow/ },
  { tech: 'python', re: /\bpython\b|django|pandas|pyspark/ },
  { tech: 'sql', re: /\bsql\b/ },
  { tech: 'mongodb', re: /mongodb|nosql/ },
  { tech: 'firebase', re: /firebase/ },
  { tech: 'terraform', re: /terraform/ },
  { tech: 'gitlab', re: /gitlab/ },
  { tech: 'git', re: /\bgit\b(?!lab)|control de versiones/ },
  { tech: 'linux', re: /\blinux\b|\bunix\b|\brhce\b|grep, awk|\bshell\b/ },
  { tech: 'splunk', re: /\bsplunk\b/ },
  { tech: 'postman', re: /postman/ },
  { tech: 'office-365', re: /office ?365|microsoft 365|\bexcel\b|outlook|sharepoint|onedrive|one drive|yammer|delve|planner|power automate|microsoft forms/ },
  { tech: 'power-bi', re: /power bi/ },
  { tech: 'tableau', re: /tableau/ },
  { tech: 'llm-genai', re: /generative ai|\bclaude\b|\bgpt\b|\bllm\b|antigravity|vibe coding|ia generativa/ },
  { tech: 'scrum', re: /scrum/ },
  { tech: 'six-sigma', re: /six sigma|\blean\b/ },
  { tech: 'json', re: /\bjson\b/ },
];
