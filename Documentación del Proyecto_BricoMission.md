# **Documentación del Proyecto: BricoMission**

| Atributo | Detalle |
| :---- | :---- |
| **Curso** | AI Expert (DevExpert.io) |
| **Autor** | HardwareMission |
| **Plataforma** | Aplicación Web Responsiva Mobile-First (PWA) \+ Backend API REST |
| **Fecha límite** | 22 de noviembre |
| **Entorno de desarrollo** | Linux CachyOS 7.3.3-1 · AMD Ryzen 9 5950X · 64 GB RAM · AMD Radeon RX 9070 XT 16 GB |
| **Infraestructura** | Contenedores Docker orquestados con Docker Compose v2 |
| **Última Modificación** | 2026-11-15 |

## **📑 Índice de Contenidos**

> 0. [Alcance del MVP (actualizado el 2026-11-15)](#alcance-del-mvp-actualizado-el-2026-11-15)  
> 1. [1\. Definición del Proyecto: Cuestionario y Conclusiones Extensas](#bookmark=id.w0o1qpdf5feo)  
   * 1.1. [El Problema, la Solución, Roles y Estrategia](#bookmark=id.7cj7ubdjsws)  
   * 1.2. [Flujo de Usuario y Experiencia Visual (UX/UI)](#bookmark=id.4zocsm5qxi7i)  
   * 1.3. [Lógica de Negocio: IA, Presupuestos y Marketplace B2B](#bookmark=id.uwqlcn9em3dc)  
   * 1.4. [Decisiones de Arquitectura Técnica](#bookmark=id.oxh8nbs5ea49)  
   * 1.5. [Fuera del alcance del MVP (Fase 2: marketplace, administración, App Nativa iOS y LiDAR)](#bookmark=id.fh57v5ns3m7m)  
> 2. [2\. El Entorno de Trabajo: HARNESS de DevExpert](#bookmark=id.2pr8kb9tqtxk)  
   * [¿Qué es el Harness Starter Evolucionado?](#bookmark=id.69s02dv1cch2)  
   * [Flujo Completo del Arnés y Subagentes](#bookmark=id.8tkwa7opaooj)  
   * [Las 7 Skills del Ecosistema DevExpert](#bookmark=id.fkl1p9axwmoz)  
> 3. [3\. Product Requirements Document (PRD)](#bookmark=id.70mo2wrrm9sy)  
> 4. [4\. Ejecución de Skills del Harness (Registro de Progreso)](#bookmark=id.o9lxd56d7nx9)  
   * 4.1. [Pasos para Invocar las Skills en la Terminal](#bookmark=id.jt4vnv8odkhi)  
   * 4.2. [Flujo de Trabajo del Harness Avanzado y Registro de Estado](#bookmark=id.5qm4m2qbyaxb)  
   * 4.3. Decisiones del Cuestionario de Descubrimiento (build-brief)  
   * 4.4. Resumen de la Fase 2: Harness del Repositorio (harness-starter)  
> 5. [5\. Creación de la Presentación (Vídeo Demo de 15 minutos)](#5-creación-de-la-presentación-vídeo-demo-de-15-minutos)  
   * 5.1. Guion  
   * 5.2. Narración con voz propia  
   * 5.3. Transcripción con marcas de tiempo  
   * 5.4. Capturas de pantalla sincronizadas con la narración  
   * 5.5. Montaje con HyperFrames (1080p horizontal)  
   * 5.6. Validación visual y exportación a MP4  
   * 5.7. Versionado del proyecto de presentación

## **Alcance del MVP (actualizado el 2026-11-15)**

> **Decisión del desarrollador (2026-11-15).** El MVP que se entrega a los tutores de DevExpert (fecha límite 2026-11-22, vídeo demo de 15 minutos) queda **cerrado** con una feature nueva, `diagnostics-dashboard`. Todo lo demás pasa a la **Fase 2** (la siguiente fase, fuera del proyecto presentado a los tutores). El resto de este documento conserva el alcance original como historia: cada requisito que pertenece a la Fase 2 lleva la etiqueta **[Fase 2]** (en el PRD en inglés, **[Phase 2]**).

**MVP entregado = las 16 features ya `accepted` en `feature_list.json` más `diagnostics-dashboard`:**

* Núcleo de infraestructura y servicios de IA (Docker Compose, llama.cpp, ComfyUI), esqueleto de la API y PWA web.
* Realm de Keycloak con los tres roles y el login con marca propia con código por email.
* Marca y pantalla de bienvenida (splash).
* Captura (fotos y medidas en cm) y Moodboard con Style Gallery.
* Login Gate (reclamación del borrador al iniciar sesión).
* Cola de trabajos de GPU (GPU job broker) y renders con ControlNet.
* Ingesta RAG del catálogo.
* Cuatro niveles de presupuesto verificados (Budget Tiers).
* Simulaciones que mezclan un estilo calculado con cada foto de la cocina, con «Mis simulaciones» y un presupuesto por simulación.
* **`diagnostics-dashboard` (nueva, cierra el MVP):** una web de escritorio independiente (URL y puerto propios, solo localhost, perfil de Compose, sin login) que muestra toda la arquitectura como un grafo en vivo con estilo *blueprint* (al estilo de los Blueprints de Unreal Engine). Cada componente de frontend y backend es un nodo (los contenedores y los módulos internos de la API); los nodos de IA indican su modelo; las conexiones entre los módulos que están trabajando se iluminan y se animan en tiempo real; un panel de registro plegable junto al grafo narra línea a línea qué nodo habla con cuál y qué envía o recibe (por ejemplo, el *prompt* del presupuesto o el *prompt* de estilo visual construido a partir de varias imágenes); cada módulo tiene un widget con CPU %, RAM, VRAM y GPU %, y hay una leyenda global. Es solo diagnóstico y explica la arquitectura por sí mismo. En la presentación se muestra la app en un navegador en vertical junto al panel en un navegador de escritorio.

**Fase 2 (22 features con `"phase": "phase-2"` en `feature_list.json`; una feature sin campo `phase` pertenece al MVP):** `budget-chat-personas`, `budget-prompt-macros`, `diy-shopping-list-pdf`, `dossier-publication`, `professional-registration`, `admin-company-validation`, `admin-marketplace-settings`, `b2b-dossier-feed`, `bid-submission-revision`, `homeowner-bid-acceptance`, `bid-live-notifications`, `contract-pdf-generation`, `contract-electronic-acceptance`, `commission-simulated-checkout`, `commission-paypal-sandbox`, `daily-quota-enforcement`, `admin-quota-controls`, `admin-user-management`, `admin-service-endpoints`, `google-sso-login`, `language-preference-account`, `render-declutter`. Es decir: chat de presupuesto con personas y *prompt macros*, lista de la compra DIY en PDF, marketplace (dossier, pujas, notificaciones, contrato, comisión y pagos), registro y validación de profesionales, cuotas y todo el panel de administración, Google SSO y la preferencia de idioma por cuenta, además de la limpieza de objetos en los renders.

**Decisión sobre los roles (2026-11-15).** Los tres roles (Usuario, Profesional y Administrador) siguen **definidos y sembrados** en el realm de Keycloak, y el Administrador ya puede leer la API de ajustes de plataforma de solo administrador. La regla original que los llamaba obligatorios se entiende ahora como decisión de alcance: **los roles existen; su funcionalidad es Fase 2**. Las funciones de Profesional y Administrador (marketplace, pujas, validación de CIF, cuotas, panel de administración, CRUD de usuarios, modo de pago, contratos) **no están construidas** en el MVP.

## **1\. Definición del Proyecto: Cuestionario y Conclusiones Extensas**

Para superar el bloqueo de análisis y definir un MVP (Producto Mínimo Viable) sólido que cumpliera con todos los requisitos del curso (cero código manual, uso de IA, integración de NotebookLM y OpenPencil), se realizó un cuestionario interactivo de 25 preguntas.  
A continuación, se detallan exhaustivamente las conclusiones, decisiones estratégicas y razonamientos técnicos extraídos de esa conversación, sin omitir ningún detalle:

### **1.1. El Problema, la Solución, Roles y Estrategia**

> * **Sector:** Reformas del hogar, específicamente centrado en **cocinas** como MVP (con la arquitectura de base de datos preparada para escalar a toda la vivienda en el futuro).  
> * **El Problema:** El usuario final se frustra ante el desconocimiento de los costes reales y la dificultad extrema para visualizar cómo quedará la reforma. Por otro lado, los profesionales pierden muchísimo tiempo y dinero con clientes indecisos ("mareantes") que piden presupuestos sin intención real de compra o sin ideas claras.  
> * **La Solución (BricoMission):** Una plataforma B2C/B2B integral donde el usuario introduce las medidas de su cocina y sube fotos, genera alternativas fotorrealistas con IA (respetando la geometría de su casa), y ajusta presupuestos exactos charlando con un LLM. Finalmente, el usuario elige entre dos caminos: obtener una lista de la compra al céntimo (hazlo tú mismo / DIY) o lanzar el proyecto empaquetado a un marketplace de profesionales para cerrar un contrato digital vinculante.  
> * **Roles de Usuario (Regla Estricta del Sistema; [Fase 2] para la funcionalidad de Profesional y Administrador, ver «Alcance del MVP», 2026-11-15: los tres roles existen y están sembrados en Keycloak, sus funciones son Fase 2):**  
>   Aunque el *harness* pueda sugerir otros roles en su fase de descubrimiento, el sistema debe implementar y respetar obligatoriamente un mínimo de 3 perfiles:  
  1. **Usuario (B2C):** El consumidor final o particular que utiliza la aplicación para planificar y visualizar su reforma.  
  2. **Profesional (B2B):** Empresa o autónomo que ofrece servicios de obra, fabricación y montaje (escalable a reformas integrales en el futuro).  
     * *Agrupación Empresarial:* Al registrarse, deben indicar obligatoriamente correo corporativo, nombre de la empresa y CIF. Sus cuentas quedan en estado "pendiente" hasta ser validadas. Una vez validados, su panel (dashboard) les mostrará no solo las obras que gestionan ellos directamente (con permisos totales), sino también las obras que gestionan sus compañeros de la misma empresa (en modo solo lectura).  
  3. **Administrador:** El gestor interno de la plataforma. Este rol **debe tener acceso a un panel de control 100% visual**. A través de esta interfaz web, el administrador:  
     * Recibirá notificaciones de alta de nuevos perfiles "Profesional", revisará sus datos (CIF, Empresa) y validará su creación, agrupándolos bajo la misma entidad corporativa si coinciden.  
     * Gestionará todos los usuarios.  
     * Visualizará el consumo de tokens de LLM y de generación de imágenes (por usuario y por servicio).  
     * **Gestión de Energía/Tokens:** Podrá modificar los límites globales diarios, así como **sobreescribir el límite para usuarios específicos** (dar más tokens) o **resetear manualmente el consumo diario** de un usuario en particular (ideal para demostraciones de producto o casos de soporte).  
     * Podrá reconfigurar visualmente los *endpoints* de las diferentes IAs (cambiar de Ollama a OpenAI, ajustar URLs, etc.) y **las credenciales/rutas del almacenamiento de archivos (MinIO/S3)** sin necesidad de tocar código fuente ni variables de entorno.  
     * **Pasarela de Pagos Dual:** Podrá alternar visualmente entre un modo de cobro simulado offline y la integración real con PayPal Sandbox.  
> * **Estrategia de Demo (Vídeo de 15 minutos para el 22 de noviembre; actualizada el 2026-11-15, ver el final de esta viñeta):**  
  * **Minutos 0-5 (Storytelling / Caso Real):** Narración ágil desde la perspectiva del usuario final (B2C) subiendo fotos de su cocina, interactuando con la IA y viendo cómo llegan las pujas en tiempo real [Fase 2: pujas y panel B2B del profesional]. Breve muestra del panel B2B del profesional [Fase 2].  
  * **Minutos 5-15 (Pitch de Arquitectura Técnica):** Demostración del dominio del curso explicando el *behind the scenes*: el uso del HARNESS, las fuentes en NotebookLM, la capa de abstracción con LiteLLM ejecutando Ollama en la GPU local, el pipeline de ControlNet, la automatización en GitHub vía MCP, las directrices dadas en OpenPencil y la infraestructura en contenedores Docker.  
  * **Producción del vídeo:** Se realizará como último paso, una vez terminado el MVP, siguiendo el proceso descrito en la sección 5 (guion propuesto por el agente, narración con voz propia, transcripción con marcas de tiempo, capturas mediante el MCP del navegador y montaje en HyperFrames).  
  * **Actualización 2026-11-15:** la demo muestra la app (PWA en un navegador en vertical) junto al panel `diagnostics-dashboard` (navegador de escritorio). Las escenas de pujas en tiempo real y del panel B2B quedan fuera (Fase 2) y se sustituyen por la narración del panel de diagnóstico. Guion actualizado en las secciones 5.1 y PRD §8.

### **1.2. Flujo de Usuario y Experiencia Visual (UX/UI)**

> * **Internacionalización (i18n):** La plataforma debe nacer con soporte multiidioma (la preferencia de idioma guardada por cuenta es [Fase 2]: `language-preference-account`). Para el MVP, la aplicación estará traducida explícitamente a los siguientes idiomas: **Inglés, Español, Francés, Alemán, Italiano, Portugués, Holandés, Sueco, Noruego, Danés y Finlandés**. Detectará automáticamente el idioma del dispositivo/navegador. Si el idioma está en esta lista de soportados, el usuario entra directo al flujo principal. Si no lo está, se mostrará una pantalla inicial explícita para seleccionar idioma (con un desplegable donde el inglés es la opción por defecto). Este idioma se guardará en la cuenta del usuario para recordarlo en futuros accesos web.  
> * **Diseño Minimalista (OpenPencil):** Estilo limpio, estructurado y con mucho espacio en blanco (inspirado en Apple e IKEA). La premisa es ocultar la enorme complejidad técnica (LLMs, RAG, ControlNet, Bases de Datos) detrás de una interfaz extremadamente sencilla e intuitiva.  
> * **Flujo de Diseño Dirigido por MCP (Model Context Protocol):**  
  * Cuando el agente necesite una nueva vista, ordenará al desarrollador crear/abrir un archivo .fig en la ruta /design/openpencil/ (por ejemplo, dividiendo por dominios: bricomission\_B2C\_app.fig o bricomission\_B2B\_dashboard.fig).  
  * El agente se quedará en estado de "espera" hasta que el desarrollador confirme por el chat que ha abierto OpenPencil y el servidor MCP está conectado.  
  * Una vez confirmado, **el propio agente de IA realizará o modificará el diseño visual directamente en OpenPencil a través de MCP**.  
  * El desarrollador actuará como supervisor. Si hay que hacer cambios visuales, se los pedirá al agente conversando por el chat, y este los aplicará vía MCP.  
  * **Extracción e Implementación:** Una vez el desarrollador confirme los diseños como válidos, el agente utilizará el MCP de OpenPencil para "leer" la estructura, propiedades visuales y layout del diseño definitivo. Basándose strictly en esta lectura directa, el agente procederá a implementar el código frontend de las ventanas, reanudando así la ejecución de la skill del *harness*.  
> * **Onboarding y "Lazy Login":** Para maximizar el *engagement*, el usuario puede entrar a la app, subir sus fotos, seleccionar su estilo y ver cómo funciona el sistema de forma anónima. El registro (Paywall lógico) se exige de forma estricta justo en el paso previo a realizar llamadas costosas a la API de IA (generación de imágenes finales o presupuestos).  
> * **Registro Seguro [Fase 2: Google SSO; en el MVP, usuario y contraseña de Keycloak con código por email]:** Se utilizarán inicios de sesión de un clic (Google/Apple SSO) o mediante número de teléfono (OTP) para asegurar a los profesionales del marketplace que hay personas reales y verificadas detrás de las peticiones.  
> * **Generación Fotorrealista (ControlNet):** Se descartó el uso de renderizado 3D puro o *inpainting* por zonas para el MVP. Se optó por **ControlNet (Depth Map / Canny)**. La IA analiza la foto subida por el usuario, extrae la geometría global (dónde está la ventana, la puerta, las tomas de agua) y genera una imagen completamente nueva en un solo paso aplicando el estilo deseado, respetando la estructura original milimétricamente.

### **1.3. Lógica de Negocio: IA, Presupuestos y Marketplace B2B**

> *Nota 2026-11-15: el chat con personas, las macros, el marketplace B2B, la monetización con pasarela dual y las cuotas de energía de este apartado son **[Fase 2]**. El MVP entregado incluye los cuatro niveles de presupuesto verificados (el LLM extrae, el código calcula) y las simulaciones con presupuesto por simulación.*

> * **Motor de Presupuestos Conversacional (LLM Chat; el chat y las macros son [Fase 2], los cuatro niveles son MVP):** El sistema calcula inicialmente 4 niveles de presupuesto (Lujo, Alto, Medio, Bajo). A partir de ahí, el usuario refina los materiales charlando de forma natural con un LLM. Los botones clásicos de la interfaz (ej. cambiar un desplegable de material) actuarán en la sombra inyectando *prompts* estructurados al chat para recalcular los costes.  
> * **Perfiles de Personalidad de la IA [Fase 2]:** El usuario podrá cambiar la actitud del asistente virtual en tiempo real mediante un desplegable, alterando el *system prompt* del agente:  
  1. *El Jefe de Obra Estricto:* Directo. Avisa de complicaciones técnicas ("Picar el suelo sube un 15% la albañilería").  
  2. *El Diseñador Empático:* Inspirador. Si te pasas de presupuesto, sugiere alternativas estéticas (porcelánico en lugar de mármol).  
  3. *El Amigo Ahorrador:* Enfocado en recortar gastos innecesarios de la lista de la compra.  
  4. *El Asistente Neutro:* Frío y rápido. Escupe números exactos sin emitir juicios ni florituras.  
> * **Conocimiento Basado en RAG (NotebookLM):** La IA no debe alucinar precios. Se subirán catálogos reales de *partners* (IKEA, BricoDepot, Leroy Merlin) a NotebookLM para que el agente extraiga los precios exactos (al céntimo) y genere listas de la compra reales y ejecutables.  
> * **Marketplace B2B (Anti-Mareantes y Anti-Bypass) [Fase 2]:** Los profesionales reciben un dossier hermético y cerrado con todo especificado (fotos, medidas, calidades). Tienen 15 días para enviar, ajustar y cerrar sus presupuestos. **No hay chat habilitado** entre cliente y profesional en esta fase. Para asegurar el modelo de negocio, **las pujas que recibe el usuario son completamente anónimas** (se muestra el precio, plazos y valoraciones de calidad, pero NO el nombre ni contacto de la empresa). Esto evita que el usuario se salte la plataforma para contratar al profesional directamente.  
> * **Modelo de Monetización B2B y Pasarela Dual [Fase 2]:** Al aceptar un presupuesto, BricoMission se asegura el cobro de una comisión por éxito. En el plan original del MVP (ahora Fase 2), el Administrador dispondrá de un interruptor para alternar entre dos modos de pago:  
  1. **Cobro Simulado (Offline):** Genera el contrato PDF y guarda un registro interno de "Comisión Pendiente" sin necesidad de internet (ideal para demostraciones seguras).  
  2. **Integración con PayPal (Test Mode):** Conecta con la pasarela de PayPal en entorno Sandbox para demostrar un flujo de checkout completo y real.  
> * **Monetización Adicional (Energía / Tokens y Feature Flag) [Fase 2]:** El plan original del MVP (ahora Fase 2) operaba en modelo *Freemium* para B2C. Se dejará programada una "Feature Flag" (palanca en base de datos) para habilitar un modelo de "Energía/Tokens Diarios".  
  * Este modelo define globalmente cuántas llamadas de LLM y cuántas generaciones de imagen puede realizar un usuario cada día.  
  * A través del panel de Administración, esta configuración puede **sobreescribirse a nivel de usuario individual** (para aumentar su límite) o **resetearse a cero manualmente** bajo demanda, una funcionalidad crítica para poder realizar demostraciones continuas del producto sin bloqueos.

### **1.4. Decisiones de Arquitectura Técnica**

> * **Idioma del Código:** Todo el código fuente, variables, nombres de funciones, *commits* y documentación técnica generada por el agente será **estrictamente en inglés**. Esto prepara el proyecto para escalar con equipos de desarrollo internacionales.  
> * **Control de Versiones y Automatización (GitHub MCP):** Como pilar fundamental de la arquitectura, se delega toda la gestión del código fuente, automatización de *Pull Requests* y creación de *Issues* al agente de IA mediante el **servidor MCP de GitHub** (https\://github.com/github/github-mcp-server). Se exige una inicialización local y aislada de Git para proteger las credenciales globales del entorno de desarrollo.  
> * **Autenticación y Gestión de Identidad (IAM):** Uso de **Keycloak** como proveedor de identidad. Se creará y configurará un *realm* (reino) específico llamado "BricoMission" que manejará de forma centralizada todos los roles (Usuario, Profesional, Administrador), el SSO (Google/Apple) y el flujo B2B (OTP), delegando esta complejidad fuera del código de la aplicación.  
> * **Frontend (MVP):** Aplicación Web Responsiva Mobile-First (PWA) construida idealmente con Next.js \+ Tailwind o ecosistemas similares que los agentes dominen.  
> * **Sistema Operativo y Scripts:** La máquina de desarrollo principal funciona con **Linux CachyOS 7.3.3-1** (base Arch). Todos los scripts de automatización y verificación que se generen (empezando por `init.sh`) serán **scripts bash (`.sh`)**; no se generarán versiones PowerShell (`.ps1`).  
> * **Infraestructura en Contenedores (Docker Compose v2):** Todos los programas que el proyecto necesita como requisito (PostgreSQL, Keycloak, MinIO, el servidor de modelos LLM y el servicio de generación de imágenes con ControlNet) se ejecutarán en **contenedores Docker** siempre que sea posible, en lugar de instalarse de forma nativa en el host. El entorno completo se levanta con un único `compose.yaml` en la raíz del repositorio (`docker compose up -d`), con imágenes en versiones fijas, volúmenes nombrados persistentes y *healthchecks*. Tras la primera descarga de imágenes y modelos, todo funciona 100% *offline*. Solo se instalará de forma nativa aquello que no pueda contenerizarse razonablemente, y esa excepción deberá quedar justificada por escrito.  
> * **Backend y Base de Datos Local:** **PostgreSQL** se ejecuta en un contenedor dentro del stack de Docker Compose. Esto garantiza que la demostración en vídeo será 100% *offline*, sin latencias de red ni caídas de servidores externos, y que el entorno se puede reproducir en cualquier máquina. El backend expondrá una **API REST robusta y agnóstica**, diseñada para servir a la web ahora y a la app móvil en el futuro.  
> * **Almacenamiento de Archivos (Object Storage):** Uso de una instancia local de **MinIO** configurada para simular un bucket de AWS S3. Esto asegura un almacenamiento robusto de las fotos subidas, imágenes generadas por IA y PDFs generados manteniéndose 100% offline para la demo, pero dejando la arquitectura lista para dar el salto directo a S3 o Supabase Storage en producción. La configuración y credenciales de MinIO serán accesibles y modificables visualmente desde el panel de Administración [Fase 2].  
> * **Capa de Abstracción de IA (LiteLLM/AI SDK):** Se utilizará una librería que unifique el formato de los *prompts*. Esto permitirá conectar la app tanto a APIs comerciales (OpenAI) como a modelos locales servidos mediante **Ollama** o **lemonade-server.ai** aprovechando la GPU **AMD Radeon 9070 XT (16GB)**. Esto ahorra costes durante las iteraciones de desarrollo y permite una demo totalmente gratuita y local. La GPU se expone a los contenedores mediante **ROCm** (dispositivos `/dev/kfd` y `/dev/dri`); si el rendimiento o la compatibilidad de RDNA4 lo exigieran, se permite ejecutar la inferencia de forma nativa o mediante el backend Vulkan, y esta decisión se validará durante `/build-brief`.  
> * **Hardware de Desarrollo y Límites de los Modelos Locales:** Inventario medido en la máquina de desarrollo (2026-11-12):

| Componente | Detalle |
| :---- | :---- |
| Sistema operativo | CachyOS (Arch Linux), kernel 7.3.3-1-cachyos |
| CPU | AMD Ryzen 9 5950X: 16 núcleos / 32 hilos, hasta ~5,1 GHz, 64 MiB de caché L3, AVX2 (sin AVX-512) |
| RAM | 64 GB DDR4 (62 GiB útiles) + 62,7 GB de swap comprimida en zram (zstd) |
| GPU | AMD Radeon RX 9070 XT (Navi 48, RDNA4, gfx1201): **16 GB de VRAM** (~1,3 GB ocupados por el escritorio, unos **14,5 GB libres**), PCIe 5.0 x16, 32 GB de GTT (memoria del sistema accesible por la GPU), Vulkan 1.4 con el driver RADV |
| Disco del sistema | NVMe KIOXIA Exceria Plus de 465 GB (452 GB libres) |
| Discos adicionales (sin montar) | NVMe Corsair MP600 PRO LPX de 1,8 TB, NVMe Crucial P3 Plus de 4 TB, SSD OCZ Trion 150 de 960 GB, HDD Seagate de 4 TB |
| Software de partida | python3, ffmpeg, Node.js 26 + npm y el driver `amdgpu` del kernel. **Pendientes de instalar:** Docker Engine + Compose v2 (y todo lo demás irá en contenedores) |

>   **Restricciones derivadas para los modelos locales:**  
  * **La VRAM es el cuello de botella.** Todos los modelos que estén cargados en la GPU a la vez deben caber en unos 14,5 GB.  
  * **Consumo orientativo de VRAM** (a validar con una prueba técnica durante `/build-brief`):
    * LLM de 7-8B cuantizado a Q4: ~5-6 GB con contexto de 8k.
    * LLM de 14B en Q4: ~9-10 GB.
    * Stable Diffusion 1.5 + ControlNet: ~4-5 GB.
    * SDXL + ControlNet en fp16: ~8-10 GB.
    * Whisper large-v3: ~3-4 GB; puede ejecutarse en CPU.
  * **Convivencia simultánea:**
    * **Sí cabe:** un LLM de 7-8B en Q4 junto con SD 1.5 + ControlNet.
    * **No cabe:** un LLM de 14B junto con SDXL + ControlNet, ni ningún LLM de 30B o más.  
  * **Regla de convivencia:**
    * La aplicación nunca dará por hecho que el LLM y el generador de imágenes pueden estar cargados a la vez.
    * La capa de IA carga los modelos uno tras otro: el servidor de LLM usa un `keep_alive` corto o descarga el modelo antes de generar una imagen, y las imágenes pasan por una cola que procesa un solo trabajo cada vez.
    * Desde el panel de Administración se pueden elegir modelos más ligeros o cambiar al *endpoint* en la nube.  
  * **CPU como respaldo:** el 5950X con 64 GB de RAM puede ejecutar en CPU, aunque más despacio, LLMs pequeños, *embeddings* y Whisper. Un modelo de 7-8B en Q4 genera del orden de unos pocos tokens por segundo y como mucho ~10. Desbordar la VRAM hacia la GTT o el swap se considera inviable para la demo.  
  * **Pila de GPU en contenedores:**
    * RDNA4 (gfx1201) necesita ROCm 6.4 o superior dentro de las imágenes (por ejemplo, `ollama/ollama:rocm` y una imagen de ComfyUI para ROCm). El host solo necesita el driver `amdgpu`, que ya está presente.
    * Si ROCm falla, la alternativa es llama.cpp con backend Vulkan (RADV ya funciona en el host).  
  * **Almacenamiento:** los pesos de los modelos y los volúmenes de Docker ocuparán decenas de GB. Se recomienda montar uno de los NVMe de datos (1,8 TB o 4 TB) para modelos y volúmenes, sin llenar el disco del sistema.  

> * **Notificaciones en Tiempo Real ([Fase 2] desde el 2026-11-15, `bid-live-notifications`; originalmente MVP):** Implementación estricta mediante **Server-Sent Events (SSE)**. Esta tecnología nativa de los navegadores permite un flujo ligero y unidireccional del servidor al cliente web para alertar sobre nuevas pujas, manteniendo la infraestructura 100% local y evitando dependencias de la nube como FCM o Pusher durante la demo offline.

### **1.5. Fuera del alcance del MVP (Fase 2: marketplace, administración, App Nativa iOS y LiDAR)**

**Actualización 2026-11-15:** la Fase 2 contiene ahora, además de lo que sigue (app nativa iOS, LiDAR y notificaciones push nativas), el marketplace B2B completo (dossier, registro y validación de profesionales, pujas, aceptación, notificaciones en vivo, contrato, comisión y pagos), el panel de Administración (cuotas, usuarios, endpoints de servicios, ajustes del marketplace), el chat de presupuesto con personas y las macros, la lista de la compra DIY en PDF, Google SSO, la preferencia de idioma por cuenta y la limpieza de objetos en los renders (las 22 features listadas en «Alcance del MVP»). Lo que sigue se conserva como estaba.

Aunque el MVP pivota hacia una arquitectura web PWA para asegurar la viabilidad técnica antes del 22 de noviembre (sorteando limitaciones de compilación en macOS), la visión final del producto incluye un desarrollo nativo avanzado. Esta información se preserva strictly como "Fase 2":

> * **Aplicación iOS Nativa (SwiftUI):** Desarrollo centrado exclusivamente en el ecosistema Apple, optimizado específicamente para el **iPhone 15 Pro Max**.  
> * **Captura Espacial 3D (LiDAR y ARKit):** En la Fase 2, la introducción manual de medidas (Largo x Ancho x Alto) será reemplazada por el uso del sensor LiDAR nativo. El usuario escaneará la habitación moviendo el teléfono, y la aplicación extraerá instantáneamente la planimetría, metros cuadrados, metros lineales de encimera y volúmenes exactos, conectando esta biometría espacial directamente con el motor de ControlNet y el LLM.  
> * **Notificaciones Push Nativas:** Transición de la arquitectura web SSE del MVP hacia una infraestructura de notificaciones push nativas reales (ej. APNs para ecosistema Apple, FCM para Android) para soportar las futuras aplicaciones nativas en iOS, Android y sistemas de escritorio (Windows/Mac/Linux).

## **2\. El Entorno de Trabajo: HARNESS de DevExpert**

Para garantizar el requisito de "cero código escrito a mano", el desarrollo del proyecto BricoMission será orquestado por agentes de IA (Claude Code, Codex u OpenCode) utilizando la arquitectura evolucionada de *skills* y subagentes del repositorio oficial ai-expert-project proporcionado por los tutores del curso AI Expert de DevExpert.io.

### **¿Qué es el Harness Starter Evolucionado?**

El *Harness* (arnés) es el ecosistema metodológico y técnico que rodea al agente de IA. Su objetivo fundamental es eliminar el desarrollo caótico por *prompts* interminables mediante el enfoque **Spec-Driven Development (SDD)**. Aísla al agente en contextos hiperespecíficos, divide el backlog del producto en piezas microscópicas llamadas *features* que se completan en una sola sesión, y delega la verificación en subagentes independientes para garantizar que ningún código sin auditar llegue a producción.

### **Flujo Completo del Arnés y Subagentes**

El flujo global de desarrollo integra el descubrimiento inicial, la preparación del repo, la triada de subagentes por feature y la entrega continua en GitHub:  
\[Descubrimiento\]     build-brief ─▶ Genera CONTEXT.md, build-brief.md, DESIGN.md  
                           │  
\[Preparación Repo\]   harness-starter ─▶ Genera AGENTS.md, init.sh, PROGRESS.md, feature\_list.json  
                           │  
\[Orquestación local\] feature-flow ─┐  
                           ├── 1\. planner             (invoca feature-spec ─▶ docs/specs/\<id\>.md)  
                           ├── 2\. implementer         (invoca feature-implementer ─▶ Código \+ init.sh)  
                           └── 3\. validator           (invoca feature-validator ─▶ Veredicto accept/revise)  
                           │  
\[Entrega GitHub\]     github-flow ─▶ Worktrees aislados ─▶ Commits convencionales ─▶ Pull Requests

### **Las 7 Skills del Ecosistema DevExpert**

A continuación se detalla exhaustivamente el propósito, reglas, entradas y artefactos de cada una de las 7 *skills* proporcionadas por el curso:

#### **1\. build-brief (Descubrimiento y Contexto de Producto)**

> * **Propósito:** Entrevista guiada paso a paso para transformar una idea vaga en un conjunto duradero de documentos de producto. *Regla estricta: No escribe ni una sola línea de código.*  
> * **Comportamiento:** Realiza una pregunta a la vez recomendando la mejor opción. Define el lenguaje del dominio, roles de usuario, flujos, restricciones técnicas y alcance del MVP. Si la app tiene interfaz visual, descubre los activos existentes o invoca la skill imagegen para crear conceptos visuales.  
> * **Artefactos generados:**  
  * CONTEXT.md: Glosario estricto y lenguaje canónico del dominio.  
  * docs/build-brief.md: Problema, usuarios, objetivos, no-objetivos y criterios de éxito.  
  * docs/domain-model.md: Entidades, relaciones y estados del ciclo de vida.  
  * docs/risks-and-open-questions.md: Decisiones pendientes, riesgos y suposiciones.  
  * DESIGN.md: Ficha técnica de diseño UI, tokens visuales e instrucciones para agentes.

#### **2\. harness-starter (Inicialización del Repositorio para Agentes)**

> * **Propósito:** Lee la documentación de descubrimiento y prepara el repositorio para que los agentes de codificación puedan trabajar con autonomía total sin reabrir debates de producto.  
> * **Criterio de Corte de Features:** Divide el proyecto en *features* ejecutables en una sola sesión de agente (para un MVP complejo exige entre 12 y 30 features acotadas). Rechaza épicas amplias como "autenticación y pagos".  
> * **Artefactos generados:**  
  * AGENTS.md: Página de aterrizaje con las reglas operativas para cualquier agente que entre al repo.  
  * init.sh: Script bash ejecutable de arranque y verificación no bloqueante del entorno (Linux; levanta y comprueba el stack de Docker Compose).  
  * PROGRESS.md: Bitácora y registro de estado verificado del repositorio.  
  * feature\_list.json: Matriz JSON ejecutable de features con dependencias (depends\_on), estados (not\_started, in\_progress, passing, accepted) y evidencias.

#### **3\. feature-spec (Diseño por Contrato / Subagente Planner)**

> * **Propósito:** Actúa como el rol de **Planner**. Crea una especificación técnica de implementación para una única funcionalidad de feature\_list.json antes de tocar código.  
> * **Contenido de la Spec:** Define la historia de usuario, los escenarios de aceptación en formato *Given/When/Then*, archivos a crear/modificar, impacto en documentación duradera, plan de verificación e instrucciones para el validador.  
> * **Artefacto generado:** docs/specs/\<feature-id\>.md.

#### **4\. feature-implementer (Ejecutor de Código / Subagente Implementer)**

> * **Propósito:** Actúa como el rol de **Implementer**. Toma el contrato de docs/specs/\<feature-id\>.md y escribe el código fuente estrictamente necesario sin salirse del alcance (*WIP=1*).  
> * **Auto-verificación:** Al terminar de codificar, ejecuta las pruebas estáticas, unitarias y scripts de verificación (init.sh). Registra las evidencias en PROGRESS.md y cambia el estado de la feature en feature\_list.json a passing.  
> * **Regla estricta:** passing significa "implementado y autoverificado", pero NUNCA significa aceptado. El implementer jamás puede marcar una feature como accepted.

#### **5\. feature-validator (Auditoría Independiente / Subagente Validator)**

> * **Propósito:** Actúa como el rol de **Validator**. Audita la implementación en una sesión totalmente limpia e independiente. No confía en lo que dice el implementer: re-ejecuta los test, revisa la seguridad y contrasta el diff contra la spec.  
> * **Veredictos posibles:**  
  * accept: La funcionalidad cumple al 100% con la spec y la arquitectura.  
  * revise: La funcionalidad necesita ajustes. Emite un *Implementation Repair Brief* ejecutable paso a paso para devolvérselo al implementer.  
  * block: Existe un impedimento grave o riesgo de seguridad que bloquea el proyecto.

#### **6\. feature-flow (Orquestador de la Triada de Subagentes)**

> * **Propósito:** Es la skill orquestadora que ejecuta la triada completa para una funcionalidad: planner (feature-spec) ─▶ implementer (feature-implementer) ─▶ validator (feature-validator).  
> * **Bucle de Reparación:** Si el validador emite un revise, feature-flow pasa el informe de reparación directamente al implementer y vuelve a invocar al validador hasta lograr el accept.  
> * **Commit y Persistencia:** Tras recibir el accept del validador independiente, la skill cambia el estado en feature\_list.json a accepted, registra la evidencia final y realiza un commit convencional en Git (feat: complete \<feature-id\>) automatizado por MCP.

#### **7\. github-flow (Entrega Multi-Feature en GitHub con Git Worktrees)**

> * **Propósito:** Permite la ejecución paralela o secuencial de múltiples features en un repositorio de GitHub utilizando entornos completamente aislados mediante git worktrees (../\<repo\>-worktrees/\<feature-id\>).  
> * **Modos de Operación:**  
  * plan: Modo lectura (read-only). Analiza dependencias y muestra el plan de ejecución sin tocar Git ni GitHub.  
  * execute: Crea las ramas feature/\<feature-id\>, levanta los worktrees aislados y lanza sesiones independientes de opencode invocando feature-flow en cada entorno.  
  * publish: Exige que la feature esté en estado accepted. Hace push a GitHub y abre el Pull Request (PR) vinculado a la Issue.  
> * **Regla de Oro:** *Merge fuera de alcance.* Nunca realiza fusiones de PRs automáticamente para mantener el control total en manos del desarrollador.

## **3\. Product Requirements Document (PRD)**

El siguiente documento es el texto fundacional que se pasará a la skill build-brief del *harness*. Está redactado exhaustivamente en inglés para maximizar la comprensión y precisión del agente de IA, incorporando todas las restricciones arquitectónicas y visuales discutidas.  
\# Comprehensive Product Requirements Document (PRD)  
\*\*Project Name:\*\* BricoMission  
\*\*Target Platform:\*\* Mobile-First Responsive Web Application (PWA) \+ REST API Backend  
\*\*Repository Target:\*\* DevExpert \`harness-starter\`   
\*\*Last Modified:\*\* 2026-11-15

\*\*MVP Scope Update (2026-11-15):\*\* The MVP delivered to the course tutors is closed by one new feature, \`diagnostics-dashboard\` (new requirement in Section 9). Every requirement, priority and user story below that belongs to a feature carrying \`"phase": "phase-2"\` in \`feature_list.json\` is tagged \*\*\[Phase 2\]\*\*; the text is kept as the original plan and is NOT part of the delivered MVP. \*\*Updated MVP priority order:\*\* (1) Docker Compose core stack and local AI services, (2) API skeleton and web PWA shell, (3) Keycloak realm with the three roles and branded email-code login, (4) brand and splash, (5) Capture (photos and measurements in cm) and Moodboard with Style Gallery, (6) Login Gate claim, (7) GPU job broker and ControlNet Renders, (8) catalog RAG ingestion, (9) four verified Budget Tiers, (10) Simulations (calculated style across every kitchen photo, My simulations, Budget per simulation), (11) \`diagnostics-dashboard\`. Everything else is \[Phase 2\] (next phase, outside the project presented to the tutors).  

\*\*Documentation Strategy for Harness:\*\* The agent must split these requirements into a modular architecture (e.g., \`01\_ui\_spec.md\`, \`02\_ai\_pipeline.md\`, \`03\_marketplace\_logic.md\`, \`04\_database\_schema.md\`) rather than a single monolithic file during development.

\#\# 1\. Executive Summary & Demo Strategy  
BricoMission is an AI-powered platform designed to disrupt the kitchen renovation sector. It bridges the gap between home DIYers and professional contractors, solving the problem of hidden costs for users and time-wasting ("tire-kickers") for professionals.   
\*\*Demo Context (15-Minute Video Pitch Target for Nov 22nd):\*\*  
\*   \*\*Part 1 (5 mins):\*\* Real-case storytelling demonstrating the B2C homeowner web flow (photo uploads, AI persona chat \[Phase 2\], visual generation) and a brief look at the B2B contractor dashboard receiving real-time bids \[Phase 2\].  
\*   \*\*Part 2 (10 mins):\*\* Technical architecture pitch showcasing the integration of the DevExpert harness, NotebookLM (RAG with IKEA catalogs), LiteLLM abstraction running Ollama on a local AMD Radeon 9070 XT GPU, OpenPencil UX workflows via MCP, strict prompt engineering, GitHub MCP automation, and the containerized Docker Compose infrastructure.  
\*\*Demo Update (2026-11-15):\*\* the demo shows the app in a portrait browser next to the \`diagnostics-dashboard\` in a desktop browser; scenes that depend on Phase 2 features (bids, B2B dashboard, Admin dashboard, persona chat) are dropped and replaced by the diagnostics narration (see Sections 8 and 9).  
\*\*Video Production:\*\* The demo video is the final deliverable, produced only after the MVP is complete, following the pipeline defined in Section 8.

\#\# 2\. Technical Architecture & Infrastructure  
\*   \*\*Codebase & Documentation Language:\*\* All source code, variable names, function names, git commits, and internal technical documentation must be written strictly in English to support future international development teams.  
\*   \*\*Version Control & GitHub MCP (STRICT PREREQUISITE):\*\*   
    \*   The agent MUST use the GitHub MCP server (\`https\://github.com/github/github-mcp-server\`) for automatic git management, Issue tracking, and PR Automation for all generated code.  
    \*   \*\*Git Configuration Rule (Step 0):\*\* The absolute first task, BEFORE generating any code, documentation, or versioned files, is to configure the git repository within the coding agent. This git configuration MUST be repository-specific (local config). The agent must NOT read or use the host machine's global user credentials unless explicitly authorized by the developer in the chat.  
    \*   The agent is required to actively guide the developer through setting up the local GitHub repository configuration to ensure the MCP is fully authenticated, secured, and ready for versioning from day one.  
\*   \*\*Development OS (Linux):\*\* The primary development machine runs Linux CachyOS 7.3.3-1 (Arch-based). All automation and verification scripts generated by the harness and agents MUST be bash scripts (\`.sh\`), with \`init.sh\` as the single entry point. Do NOT generate PowerShell (\`.ps1\`) scripts.  
\*   \*\*Containerized Infrastructure (Docker Compose v2):\*\* Every prerequisite service (PostgreSQL, Keycloak, MinIO, the LLM server, and the ControlNet image-generation service) MUST run in Docker containers whenever possible instead of being installed natively on the host. The full stack is defined in a single \`compose.yaml\` at the repository root and started with \`docker compose up -d\`. Requirements: pinned image versions (no \`latest\`), named persistent volumes, healthchecks, and fully offline operation after the first image/model pull. The AMD GPU is passed into the AI containers through the ROCm devices (\`/dev/kfd\`, \`/dev/dri\`). Any component left native on the host requires a written justification.  
\*   \*\*Development Hardware & Local AI Constraints:\*\*  
    \*   \*\*Measured host (2026-11-12):\*\* AMD Ryzen 9 5950X (16C/32T, AVX2, no AVX-512); 64 GB DDR4 RAM + 62.7 GB zram swap; AMD Radeon RX 9070 XT (RDNA4, gfx1201) with 16 GB VRAM (~14.5 GB free with the desktop running), PCIe 5.0 x16, Vulkan 1.4 (RADV); 465 GB NVMe system disk plus unmounted 1.8 TB and 4 TB NVMe data drives. Docker Engine + Compose v2 must be installed first; everything else runs in containers.  
    \*   \*\*VRAM is the bottleneck:\*\* All models resident on the GPU at the same time must fit in ~14.5 GB. Indicative footprints (to be validated by a technical spike during discovery): 7-8B LLM at Q4 ≈ 5-6 GB (8k context); 14B LLM at Q4 ≈ 9-10 GB; SD 1.5 + ControlNet ≈ 4-5 GB; SDXL + ControlNet (fp16) ≈ 8-10 GB; Whisper large-v3 ≈ 3-4 GB (can run on CPU).  
    \*   \*\*Co-residency rule:\*\* A 7-8B Q4 LLM and SD 1.5 + ControlNet can stay loaded together; a 14B LLM plus SDXL + ControlNet, or any 30B+ LLM, cannot. The application MUST NOT assume the LLM and the image generator are loaded simultaneously: the AI layer serializes GPU loads (short \`keep\_alive\` or explicit unload of the LLM before image generation, single-worker image queue), and the Admin can switch to smaller models or to the cloud endpoint from the dashboard.  
    \*   \*\*CPU fallback:\*\* Small LLMs, embeddings and Whisper may run on the CPU at reduced speed (roughly a few to ~10 tokens/s for a 7-8B Q4 model). Spilling VRAM into GTT/system memory or swap is not acceptable for the demo.  
    \*   \*\*GPU stack:\*\* RDNA4 requires ROCm ≥ 6.4 inside the container images (e.g., \`ollama/ollama:rocm\`, a ROCm build of ComfyUI); the host only needs the in-kernel \`amdgpu\` driver. Fallback: llama.cpp with the Vulkan backend.  
    \*   \*\*Storage:\*\* Model weights and Docker volumes may live on a dedicated data NVMe (optional Docker data-root move); by default they use the system disk.  
\*   \*\*Identity & Access Management (IAM):\*\* Keycloak. A dedicated "BricoMission" realm will be configured to handle all user authentication, role-based access control (RBAC), SSO integrations (Google/Apple \[Phase 2: \`google-sso-login\`\]), and B2B OTP validation, keeping auth logic cleanly separated from the core application.  
\*   \*\*Frontend / Client:\*\* Mobile-First Responsive Web Application (PWA) optimized for mobile browser viewports.  
\*   \*\*Backend & API:\*\* Local PostgreSQL running as a container in the Docker Compose stack to guarantee zero external latency, reproducibility, and full offline capability during the presentation. The backend must expose a robust, framework-agnostic REST API. This API will serve the MVP web frontend but is fundamentally structured to support a future Native iOS mobile application without major refactoring.  
\*   \*\*File Storage (Object Storage):\*\* A local instance of \*\*MinIO\*\* acting as an AWS S3-compatible storage bucket. This guarantees robust offline file handling for user-uploaded photos, AI-generated images, and PDF contracts for the MVP while keeping the codebase strictly cloud-ready (S3/Supabase Storage API) for production. The connection strings and credentials for this MinIO bucket MUST be visually configurable via the Administrator dashboard without needing code changes \[Phase 2: \`admin-service-endpoints\`\].  
\*   \*\*Internationalization (i18n):\*\* The application must be built with multi-language support from day one. For the MVP, the supported language list is explicitly: \*\*English, Spanish, French, German, Italian, Portuguese, Dutch, Swedish, Norwegian, Danish, and Finnish\*\*. It must detect browser/device language automatically and persist the user's choice in the database \[Phase 2: \`language-preference-account\`\].  
\*   \*\*AI Abstraction Layer:\*\* Implementation of an AI SDK (like Vercel AI SDK or LiteLLM) to allow hot-swapping between models. The primary development and demo environment will use local endpoints (Ollama or lemonade-server.ai) running on an AMD Radeon 9070 XT (16GB) to avoid API costs, with cloud API fallbacks ready.  
\*   \*\*Image Generation AI:\*\* ControlNet (Depth/Canny maps) to generate full photorealistic images in a single pass while strictly preserving the room's global structural geometry (walls, windows, doors, water inputs) extracted from user-uploaded standard 2D photos.  
\*   \*\*RAG / Knowledge Base (NotebookLM):\*\* The LLM logic must be grounded strictly on commercial catalogs (e.g., IKEA, Leroy Merlin) uploaded to NotebookLM. This ensures exact pricing, standard furniture dimensions, and executable DIY shopping lists without LLM hallucinations.

\#\# 3\. User Roles & Access Model (STRICT REQUIREMENT)  
\*Scope decision (2026-11-15):\* the three roles remain DEFINED and seeded in the Keycloak realm, and the Administrator can already read the admin-only platform setting API. The Professional and Administrator functions below (marketplace, bidding, CIF validation, quotas, admin panel, user CRUD, payment mode, contracts) are \*\*\[Phase 2\]\*\* and are not built in the delivered MVP: the roles exist, their functionality is Phase 2.  
While the DevExpert harness might propose various generic roles during discovery, this system MUST implement at least the following three specific and distinct roles:  
1\.  \*\*User (Homeowner / B2C):\*\* The end consumer utilizing the application to plan, visualize, and budget their kitchen renovation.  
2\.  \*\*Professional (Contractor / B2B) \[Phase 2 functionality\]:\*\* The company or independent contractor offering services.   
    \*   \*\*Registration & Grouping:\*\* Professionals must register using a Corporate Email, Company Name, and CIF (Tax ID). Their account remains in a "Pending Validation" state until an Administrator verifies them.  
    \*   \*\*Multi-tenant Visibility:\*\* Once approved, Professionals are grouped under their verified Company entity. In their B2B dashboard, they have full edit/management rights over the projects they personally manage, but they can also view (in read-only mode for tracking) the projects managed by other co-workers within the same Company.  
3\.  \*\*Administrator (Platform Manager) \[Phase 2 functionality\]:\*\* The internal platform administrator. This role requires a dedicated, 100% visual administration dashboard on the web platform. Through this UI, the Admin must be able to:  
    \*   Receive alerts for new Professional registrations, manually validate the provided CIF/Company Name, and link them to new or existing Company entities.  
    \*   Manage all platform users (CRUD operations).  
    \*   \*\*Token & Energy Quota Management:\*\* Monitor LLM and image generation token usage per user. The Admin MUST have the ability to override global daily token limits for specific users (granting them a higher allowance) and manually reset any user's daily consumption counter to zero on-demand (critical for product demos and VIP support).  
    \*   Visually configure and hot-swap AI API endpoints, as well as the \*\*credentials and connection strings for the MinIO/S3 object storage\*\*.  
    \*   \*\*Payment Gateway Toggle:\*\* Visually toggle the platform's payment gateway mode between 'Offline Simulated Payment' (database only, for offline demos) and 'PayPal Test/Sandbox Mode' (real checkout flow).  
    \*   Manage global system parameters entirely through the graphical interface without touching source code or \`.env\` files.

\#\# 4\. UI/UX Design System (OpenPencil Specs)  
\*   \*\*Aesthetic:\*\* Minimalist, clean, and highly structured (Apple/IKEA style). Generous white space, large typography, with a focus on high-quality imagery. The extreme technical complexity (LLMs, DBs, Image Generation) must be completely hidden behind simple interactions.  
\*   \*\*OpenPencil MCP-Driven UI Workflow (STRICT AGENT RULES):\*\*  
    \*   \*\*No UI Guessing:\*\* The AI coding agent is strictly prohibited from auto-generating UI views/screens without developer oversight.  
    \*   \*\*MCP Initialization Command:\*\* When a feature requires a new or modified visual element, the agent must instruct the human developer to create or open a specific \`.fig\` file logically named according to the feature domain (e.g., \`/design/openpencil/bricomission\_B2C\_app.fig\` or \`bricomission\_B2B\_dashboard.fig\`). The developer must then open this file in the OpenPencil application to launch the Model Context Protocol (MCP) server.  
    \*   \*\*Agent Wait State:\*\* The agent MUST PAUSE its execution and wait for explicit confirmation from the human developer in the chat that the OpenPencil MCP is active and connected.  
    \*   \*\*AI-Driven Design:\*\* Once the MCP connection is confirmed, the \*agent itself\* will push the UI designs, layouts, and modifications directly into the OpenPencil \`.fig\` file via MCP.  
    \*   \*\*Human Supervision & Iteration:\*\* After generating the design via MCP, the agent will ask the developer to review the visual result in OpenPencil. If modifications are required, the developer will request them conversationally in the chat, and the agent will apply the adjustments in real-time via MCP.  
    \*   \*\*MCP Extraction & Frontend Implementation:\*\* Upon receiving explicit approval from the human developer, the agent will use the MCP connection to "read" and extract the finalized visual properties, layout, and structure directly from the OpenPencil \`.fig\` file. The agent will then generate the precise frontend code (components/views) strictly based on this extracted MCP data, and proceed with the execution of the current harness skill.  
\*   \*\*Wireframes Scope (10+ Screens for B2C, B2B & Admin):\*\*  
    1\.  Language Selection Screen (Conditional).  
    2\.  Data Input / Photo Upload Screen (Manual measurements).  
    3\.  Moodboard/Style Selection.  
    4\.  AI Results & Chat Interface (The Core Engine with Persona dropdown \[Phase 2\]; the MVP ships Results and Simulations without chat).  
    5\.  Budget Tier Overview (4 levels).  
    6\.  DIY Partner Selection (e.g., IKEA PDF generation). \[Phase 2\]  
    7\.  Marketplace Bidding Dashboard (B2C view). \[Phase 2\]  
    8\.  Digital Contract / PDF View (With mathematical penalty clauses). \[Phase 2\]  
    9\.  B2B Contractor Dashboard (Incoming anonymized locked dossiers & peer tracking). \[Phase 2\]  
    10\. B2B Bid Submission & Contract Signing. \[Phase 2\]  
    11\. \*\*Admin Dashboard:\*\* Visual configuration (AI endpoints, MinIO/S3 credentials), token override/reset controls, payment gateway toggles, and user management. \[Phase 2\]  
    12\. \*\*Diagnostics Dashboard (desktop, MVP, added 2026-11-15):\*\* the live blueprint-style architecture graph of Section 9, designed in \`design/openpencil/bricomission_diagnostics.fig\`.

\#\# 5\. Detailed End-to-End User Flow (B2C Homeowner)

\#\#\# Phase 0: App Launch & Language Detection (Pre-Login)  
\*   Upon the first launch, the web app detects the device/browser's native language.   
\*   If the language is supported (English, Spanish, French, German, Italian, Portuguese, Dutch, Swedish, Norwegian, Danish, Finnish), the app bypasses the language screen.  
\*   If the language is NOT supported, a Language Selection Screen appears (defaulting to English in the dropdown) to ensure accessibility.

\#\#\# Phase 1: Spatial Capture & Onboarding (Pre-Login \- Lazy Login Strategy)  
\*   The user can access the platform, upload photos, and select styles without an account to drive engagement.  
\*   \*\*Measurement Hierarchy (MVP):\*\*   
    \*   The exclusive spatial capture flow for this MVP is \*\*Manual Input\*\*.  
    \*   The user uploads standard 2D photographs of their kitchen directly through the web interface.  
    \*   The user manually inputs the dimensions (Length x Width x Height in meters/centimeters).  
    \*   \*Note: Importing 3D scans from third-party applications is out of scope to keep the user journey 100% contained within our platform.\*

\#\#\# Phase 2: Inspiration & Moodboard (Pre-Login)  
\*   Users define their style by:  
    1\.  Uploading their own reference photos.  
    2\.  Writing or dictating a prompt (e.g., "Industrial kitchen with an island"). The app fetches or generates stock reference images based on the prompt.  
\*   User selects their favorite images to create a specific "Moodboard".

\#\#\# Phase 3: Registration Gate & Paywall  
\*   \*\*Login Trigger:\*\* The moment the user requests any action requiring a costly API/LLM call (e.g., "Generate My Kitchen visuals" or "Calculate exact Budget"), a mandatory login gate appears.  
\*   \*\*Auth Methods:\*\* Google SSO \[Phase 2\], Apple SSO, or Phone Number (OTP for B2B trust validation). The MVP uses Keycloak password plus an email code.  
\*   \*\*B2B Registration Requirements \[Phase 2\]:\*\* Professionals attempting to bypass this gate must provide Corporate Email, Company Name, and CIF to proceed into the Admin validation queue.  
\*   \*\*Profile Data (language preference per account is \[Phase 2\]):\*\* Upon registration, the user's active language preference, role, and basic credentials are saved to the backend database to maintain state across web sessions.  
\*   \*\*Monetization / Quota Strategy \[Phase 2\]:\*\*   
    \*   \*\*Default:\*\* "Freemium" mode (Unlimited text chat, but image generation and Marketplace submission are locked behind a paywall).  
    \*   \*\*Global Quota Feature Flag:\*\* The backend must include a database toggle to globally enforce a "Daily Energy/Token" model. This defines a strict maximum number of LLM calls and Image Generations allowed per day, per user.  
    \*   \*\*Granular Overrides:\*\* The Admin dashboard must allow administrators to override this global quota for specific individual users (e.g., setting a custom, higher daily limit) and manually reset an individual's current individual consumption counter back to zero on-demand.

\#\#\# Phase 4: AI Visual Generation & Interactive Budgeting  
\*   \*\*Visuals:\*\* ControlNet outputs photorealistic variations fusing the original uploaded photo's layout with the moodboard style.  
\*   \*\*Budgeting Architecture (The Core LLM Engine):\*\*  
    \*   The LLM pre-calculates 4 generic budget tiers (Luxury, High, Medium, Low) based on the manual room dimensions and the RAG (IKEA catalogs).  
    \*   \*\*Interactive Chat \[Phase 2\]:\*\* The primary way to adjust the budget is through conversational natural language.  
    \*   \*\*Invisible Prompt Macros \[Phase 2\]:\*\* Any classic UI elements (like selecting the "Medium" budget button, or using dropdowns to change a material) do not run hardcoded math; they act as hidden shortcuts that inject structured text prompts into the LLM chat engine to recalculate the total.  
    \*   \*\*Dynamic AI Personas \[Phase 2\]:\*\* The user can change the AI's personality from a dropdown menu at any time. The system prompt swaps dynamically:  
        1\.  \*Strict Foreman (Jefe de Obra):\* Focuses on technical viability and structural costs.  
        2\.  \*Empathetic Designer (Diseñador):\* Focuses on aesthetics, suggests visual alternatives if over budget.  
        3\.  \*Frugal Friend (Amigo Ahorrador):\* Actively looks to cut costs.  
        4\.  \*Neutral/Fast (Crítico):\* Outputs bare numbers without any fluff.

\#\#\# Phase 5: Checkout & Execution  
\*   \*\*Path A (DIY) \[Phase 2\]:\*\* Generates a highly detailed, executable shopping list PDF (exact square meters of tiles, bags of cement, exact IKEA furniture SKUs) for the user to buy and install themselves.  
\*   \*\*Path B (Marketplace) \[Phase 2\]:\*\* Packages the final AI-generated images, user measurements, and chosen materials into a locked, highly specific professional dossier sent to the B2B side.

\#\# 6\. Detailed B2B Marketplace Flow & Smart Contracts \[Phase 2: every requirement in this section moved out of the delivered MVP on 2026-11-15\]  
\*   \*\*15-Day Anonymous Bidding Window (Anti-Bypass Strategy):\*\* Contractors receive the locked dossier and have 15 days to submit closed bids with a guaranteed installation date. To prevent users from bypassing the platform and contacting professionals directly, \*\*all bids presented to the homeowner are strictly anonymous\*\*. The user sees the price, estimated time, and platform ratings, but the contractor's identity and contact details remain hidden until the contract is officially accepted.  
\*   \*\*Zero-Chat Policy:\*\* To protect professionals from time-wasting, there is NO chat feature between the homeowner and the contractor prior to bid acceptance. The dossier is comprehensive enough.  
\*   \*\*Company-Wide Dashboard Visibility:\*\* Professionals logging into their dashboard can view all projects assigned to their validated Company. Projects they personally manage are fully editable/actionable, whereas projects managed by their peers (co-workers) are visible for tracking purposes only (read-only).  
\*   \*\*Real-Time Push Notifications (originally MVP, now \[Phase 2\]):\*\* Implemented strictly via Server-Sent Events (SSE) to maintain a fully local, 100% offline-capable backend without reliance on third-party cloud services like Firebase or Pusher. Homeowners receive live browser alerts as bids arrive or drop in price.  
\*   \*\*Digital Contract, Penalties & Platform Commission:\*\* Once the homeowner accepts a bid, the system auto-generates a binding PDF legal contract.   
    \*   \*\*Commission Model:\*\* The contract triggers a pre-agreed commission fee owed by the Professional to BricoMission for the successful lead/execution.  
    \*   \*\*Dynamic Payment Flow:\*\* The checkout behavior depends entirely on the Admin's configured payment toggle: either a simulated offline transaction (recording a "Pending Commission" in the local DB without internet) or a real checkout redirection using PayPal Sandbox.  
    \*   \*\*Penalties:\*\* This contract must include explicitly written, mathematically calculated delay penalties (e.g., "Discount of 50€ per day of delay beyond the agreed completion date") digitally signed by both parties.

\#\# 7\. Future Scope & Post-MVP (Native iOS & LiDAR)  
\*Update 2026-11-15:\* Phase 2 also contains the marketplace, the Admin dashboard and the other features tagged \[Phase 2\] in this document (see the scope section at the top).  
\*   \*\*Platform Pivot:\*\* Transitioning the web frontend into a 100% iOS Native mobile application using SwiftUI, heavily optimized for the iPhone 15 Pro Max.  
\*   \*\*Native Push Notifications:\*\* Transition from the MVP's SSE architecture to a full native push notification infrastructure (e.g., APNs, FCM) to support upcoming native applications across iOS, Android, Windows, Linux, and macOS.  
\*   \*\*Native Hardware Integration:\*\* Direct access to Apple's ARKit and the LiDAR scanner to replace manual measurement inputs. The app will instantly scan the room in 3D, extracting exact spatial planimetry, square meters, linear meters for countertops, and room volumes.  
\*   \*\*AI Geometry Sync:\*\* The LiDAR 3D mesh will be fed directly into the ControlNet pipeline for flawless architectural preservation during image generation.  
\*   \*\*Backend Readiness:\*\* The agnostic REST API built during the MVP phase is strictly designed to serve this future native client without requiring backend architectural changes.

\#\# 8\. Final Deliverable: Demo Video Production (Last Step After the MVP)  
This is the final step of the project, executed only once the MVP is complete (including \`diagnostics-dashboard\`). The goal is the 15-minute demo video (Section 1) built with a reproducible, versioned pipeline:  
1\.  \*\*Script:\*\* The agent proposes a two-part narration script: (a) app demonstration (\~5 min, updated 2026-11-15: the B2C flow in a portrait browser next to the \`diagnostics-dashboard\` in a desktop browser, with the live graph narrating each step: Capture, Moodboard, Login Gate, Renders, Budget Tiers, Simulations; the B2B and Admin dashboards and the bids scene are \[Phase 2\] and dropped); (b) how it was built with the course techniques (\~10 min: DevExpert harness and SDD, planner/implementer/validator subagents, GitHub MCP, OpenPencil MCP design workflow, NotebookLM grounding, local AI on the AMD GPU, Docker Compose infrastructure; the dashboard doubles as the architecture visual for this part). Each sentence gets a stable id. The developer reviews and approves it. Stored in \`presentation/script/\`.  
    \*   \*\*Two-window layout (2026-11-15, \`diagnostics-dashboard\` built):\*\* \`./launch-demo.sh\` starts the app and the dashboard and prints both URLs. The app runs in a narrow portrait window (about 480 x 1000, or a 390 x 844 device frame) at \`http://localhost:3100\`; the dashboard runs in a desktop window at \`http://localhost:3200\` (designed for 1920 x 1080, checked at 1440 x 1080 for the width left beside the portrait window, and at 1366 x 768). Rehearse the layout and the narration without the GPU with the recorded session \`http://localhost:3200/?source=replay\` (header chip \`REPLAY\`) or with \`./launch-demo.sh --fake\` (dashed \`simulated\` edges). The screenshots of step 4 capture both windows.  
2\.  \*\*Narration:\*\* The developer records the approved script with their own voice. Audio stored in \`presentation/audio/\`.  
3\.  \*\*Timed Transcript:\*\* A local speech-to-text model (Whisper / faster-whisper, natively or in Docker) transcribes the recording with per-sentence start/end timestamps, aligned to the script sentence ids. Output (JSON + SRT) stored in \`presentation/transcript/\`; this file is the single source of truth for the edit timing.  
4\.  \*\*Screenshots:\*\* Using the browser MCP connector (Claude in Chrome), the agent drives the locally running app and captures the screenshots that match each sentence or block of the narration. Stored in \`presentation/screenshots/\`, named after the sentence ids.  
5\.  \*\*Composition (HyperFrames):\*\* The video is assembled with HyperFrames (\`https://github.com/heygen-com/hyperframes\`, HTML-based, deterministic MP4 rendering; requires Node.js 22+ and FFmpeg), installed locally or run in Docker. The project lives in \`presentation/hyperframes/\` (created with \`npx hyperframes init\`), landscape 1920x1080 (1080p) set on the composition root (\`data-width\`/\`data-height\`). Each screenshot is a clip whose \`data-start\`/\`data-duration\` come from the timed transcript; the narration audio is the main track.  
6\.  \*\*Visual Validation:\*\* The developer reviews the composition with \`npx hyperframes preview\` and iterates with the agent until approved.  
7\.  \*\*Export:\*\* After approval, the agent guides the developer step by step through \`npx hyperframes render\` to MP4, flagging any manual action required.  
8\.  \*\*Versioning:\*\* The HyperFrames project, script, transcript, audio, and screenshots are committed to this repository. Rendered MP4 files go to \`presentation/out/\` and are git-ignored.

\#\# 9\. Diagnostics Dashboard (MVP, added 2026-11-15; closes the MVP)  
\*   \*\*Purpose:\*\* A separate, diagnostic-only desktop web app that explains the whole architecture by itself and is shown next to the portrait app in the demo video. It has its own URL and port, binds to localhost only, runs under its own Compose profile and has no login.  
\*   \*\*Requirements:\*\*  
    \*   \*\*DD-1 Blueprint graph:\*\* The architecture is drawn as a blueprint-style graph (Unreal Engine Blueprint look). Every frontend and backend component is a node: the containers and the API internal modules. AI nodes name their model.  
    \*   \*\*DD-2 Live connections:\*\* Connections between modules that are currently working light up and animate in real time; idle connections stay dim.  
    \*   \*\*DD-3 Narrated log:\*\* A collapsible log panel beside the graph narrates, line by line, which node talks to which node and what it sends or receives (for example the budget prompt, or the visual style prompt built from several images).  
    \*   \*\*DD-4 Metrics widgets:\*\* Each module has a widget with CPU %, RAM, VRAM and GPU %.  
    \*   \*\*DD-5 Legend:\*\* One global legend explains node types, connection states and metrics.  
    \*   \*\*DD-6 Isolation:\*\* Diagnostic only: it never changes application state, never calls a costly AI endpoint on its own, and works fully offline.  
    \*   \*\*DD-7 Design:\*\* Designed through the OpenPencil MCP in \`design/openpencil/bricomission_diagnostics.fig\` (desktop, dark blueprint look) before any implementation.  
\*   \*\*Acceptance criteria:\*\*  
    \*   Given the stack is running with the diagnostics profile, when the developer opens the dashboard URL on its own port, then the graph renders with a node for every container and every API module, with no login.  
    \*   Given a user runs a flow in the app (for example a Render, a Budget Tier calculation or a Simulation), when the request travels through the system, then the participating connections light up and animate while they work, and go idle afterwards.  
    \*   Given the same flow, when the log panel is open, then it shows one narrated line per hop (source node, target node, what is sent or received) and it can be collapsed without affecting the graph.  
    \*   Given any module, when the graph is visible, then its widget shows CPU %, RAM, VRAM and GPU % updating live.  
    \*   Given the app in a portrait browser and the dashboard in a desktop browser side by side, when a flow runs, then the dashboard alone is enough to explain which components took part.  
    \*   Given the dashboard port, when it is reached from another host, then it is not reachable (localhost only).  

## **4\. Ejecución de Skills del Harness (Registro de Progreso)**

Este apartado servirá como bitácora y registro de ejecución de cada una de las *skills* del *harness-starter* de DevExpert durante el desarrollo de BricoMission.

### **4.1. Pasos para Invocar las Skills en la Terminal**

Para cada fase del desarrollo, la invocación de las *skills* según el entorno CLI configurado (Claude Code, Codex u OpenCode) sigue las siguientes instrucciones:

| Agente | Comando para Invocar una Skill |
| :---- | :---- |
| **Claude Code** | /build-brief, /harness-starter, /feature-spec, /feature-implementer, /feature-validator, /feature-flow, /github-flow |
| **Codex** | \$build-brief, \$harness-starter, \$feature-spec, \$feature-implementer, \$feature-validator, \$feature-flow, \$github-flow |
| **OpenCode** | "Usa la skill build-brief", "Usa la skill feature-flow", etc. |

### **4.2. Flujo de Trabajo del Harness Avanzado y Registro de Estado**

El desarrollo se organiza en 6 grandes etapas secuenciales (Fases 0 a 5) según la arquitectura de subagentes. **Nota de corte (2026-11-15):** no confundir estas «Fases 0 a 5» del harness con la «Fase 2» del producto (la siguiente fase, fuera del proyecto presentado). El MVP se corta a las 16 features ya `accepted` más `diagnostics-dashboard`, que cierra la Fase 3 de este plan (ejecución por feature) y es el último trabajo antes de la Fase 5 (vídeo). Las 22 features con `"phase": "phase-2"` no se ejecutan antes del 2026-11-22; el arranque (`AGENTS.md`) elige solo features sin esa marca.

> 0. **Fase 0: Configuración Inicial (Git & GitHub MCP)**  
   * **Objetivo:** Preparar y blindar el control de versiones local antes de generar un solo archivo.  
   * **Responsabilidad del Agente:**  
     1. Guiar al desarrollador en la inicialización de Git con configuración estrictamente local (local config), protegiendo las credenciales globales de la máquina.  
     2. Conectar e inicializar el servidor GitHub MCP (github-mcp-server) para automatizar ramas, PRs e issues.  
   * **Estado:** ✅ *Finalizada (2026-11-12).* Git con identidad y *credential helper* locales (token desde `BRICOMISSION_GITHUB_PAT`), servidor GitHub MCP configurado en `.mcp.json`, push verificado.  
> 1. **Fase 1: Descubrimiento de Producto (build-brief)**  
   * **Objetivo:** Pasar el PRD (Sección 3\) al agente para que realice la entrevista interactiva y consolide los artefactos de descubrimiento.  
   * **Comando:** /build-brief (o el equivalente del agente).  
   * **Artefactos generados:** CONTEXT.md, docs/build-brief.md, docs/domain-model.md, docs/risks-and-open-questions.md, DESIGN.md.  
   * **Estado:** ✅ *Finalizada (2026-11-12).* Generados además docs/user-and-access-model.md, docs/technical-discovery.md y 3 ADR en docs/adr/ (LLM MoE con llama.cpp, cálculo determinista del presupuesto, monorepo Next.js + NestJS). Alcance: PRD completo, priorizado por el recorrido de la demo.  
> 2. **Fase 2: Preparación e Inicialización del Repositorio (harness-starter)**  
   * **Objetivo:** Convertir los documentos de descubrimiento en la matriz de funcionalidades acotadas y la infraestructura para los agentes de codificación.  
   * **Comando:** /harness-starter.  
   * **Artefactos generados:** AGENTS.md, init.sh, PROGRESS.md, feature\_list.json.  
   * **Verificación del Desarrollador:** *(Comprobar explícitamente que init.sh levanta y verifica el stack con `docker compose` en Linux).*  
   * **Estado:** ✅ *Finalizada (2026-11-12).*
     * Se han creado AGENTS.md, init.sh, PROGRESS.md y feature\_list.json.
     * feature\_list.json tiene **34 features**, cada una con sus dependencias (`depends_on`), ordenadas según el recorrido de la demo: infraestructura → captura → IA → resultados → marketplace → administración → amplitud. Son algo más de las 30 orientativas porque el alcance es el PRD completo.
     * init.sh está en versión previa al bootstrap: comprueba los requisitos del host y valida la lista de features. Pasará a levantar el stack con `docker compose` en las features `infra-compose-core` y `api-skeleton`.
     * Pendiente: instalar Docker Engine + Compose v2 antes de la primera feature.  
> 3. **Fase 3: Ejecución Orquestada por Feature (feature-flow)**  
   * **Objetivo:** Seleccionar una funcionalidad de feature\_list.json y ejecutar automáticamente el ciclo completo con los tres subagentes en bucle hasta su aceptación e integración.  
   * **Comando:** /feature-flow (o indicando un ID específico: /feature-flow \<feature-id\>).  
   * **Pipeline Interno Ejecutado por el Orquestador:**  
     1. **planner (feature-spec):** Genera la especificación del contrato en docs/specs/\<feature-id\>.md.  
     2. **implementer (feature-implementer):** Escribe el código, autoverifica ejecutando ./init.sh, actualiza PROGRESS.md y marca el estado como passing.  
     3. **validator (feature-validator):** Sesión independiente que audita el código.  
        * Si el resultado es revise: emite un *Implementation Repair Brief* y reenvía al implementer.  
        * Si el resultado es accept: confirma que cumple la especificación y los estándares de seguridad.  
     4. **Commit de Aceptación:** El orquestador cambia el estado en feature\_list.json a accepted, registra las evidencias, realiza un commit convencional (feat: complete \<feature-id\>) automatizado por MCP y entrega las instrucciones finales de prueba local (Cómo probarlo).  
   * **Estado:** *(En curso; actualizado el 2026-11-15: 16 features `accepted`, falta `diagnostics-dashboard` para cerrar el MVP.)*  
> 4. **Fase 4: Despliegue Multi-Feature y Gestión de Repositorio (github-flow)**  
   * **Objetivo:** Coordinar la ejecución paralela o entrega continua en GitHub utilizando git worktrees aislados, aprovechando el servidor GitHub MCP para todo el manejo remoto.  
   * **Modos de Invocación:**  
     * plan: Inspección en modo lectura para planificar ramas y sesiones sin alterar Git.  
     * execute: Crea los worktrees aislados (../\<repo\>-worktrees/\<feature-id\>) y lanza sesiones autónomas de feature-flow.  
     * publish: Verifica que la feature esté en estado accepted, sube la rama a GitHub y el agente abre automáticamente el Pull Request (PR) vinculado a la Issue usando el MCP de GitHub.  
   * **Estado:** *(Pendiente de ejecución)*  
> 5. **Fase 5: Producción del Vídeo de Presentación (último paso, con el MVP terminado)**  
   * **Objetivo:** Producir el vídeo demo de 15 minutos siguiendo el proceso de la sección 5: guion, narración con voz propia, transcripción con marcas de tiempo, capturas con el MCP del navegador, montaje en HyperFrames a 1080p y exportación a MP4.  
   * **Artefactos generados:** `presentation/` (guion, audio, transcripción, capturas y proyecto HyperFrames), versionado en el repositorio. El MP4 final queda fuera de git.  
   * **Estado:** *(Pendiente de ejecución)*

### **4.3. Decisiones del Cuestionario de Descubrimiento (build-brief, 2026-11-12)**

Resumen de las respuestas dadas durante la entrevista de `/build-brief`. El detalle está en los documentos generados (CONTEXT.md, docs/build-brief.md, docs/domain-model.md, docs/user-and-access-model.md, docs/technical-discovery.md, docs/risks-and-open-questions.md, DESIGN.md y docs/adr/).

| # | Pregunta | Decisión | Motivo / consecuencia |
| :---- | :---- | :---- | :---- |
| 1 | Idioma de los documentos | **Inglés** | Coherente con la regla de código y documentación técnica en inglés. La conversación sigue en español. |
| 2 | Alcance del MVP con 10 días de plazo | **PRD completo** (histórico; recortado el 2026-11-15, ver «Alcance del MVP») | Es el riesgo principal. `/harness-starter` ordenará las features siguiendo el recorrido de la demo: primero infraestructura, captura, IA, resultados y marketplace; después el panel de administración; y al final la amplitud (11 idiomas, Google SSO, pulido). |
| 3 | Origen de los precios (NotebookLM no tiene API) | **RAG local sobre los catálogos en PDF** | Los PDF, curados por el desarrollador con NotebookLM fuera de la app, se indexan con *embeddings* en PostgreSQL (pgvector). NotebookLM no forma parte del sistema en ejecución. |
| 4 | Quién calcula los importes | **El LLM extrae, el código calcula** (ADR 0002) | El LLM devuelve partidas en JSON citando la fuente. El backend comprueba que el precio aparece en el fragmento recuperado y calcula subtotales, niveles, IVA, penalizaciones y comisión con aritmética decimal. Totales reproducibles. |
| 5 | Demo con o sin internet | **Online, con modo offline** | Con red: Google SSO y PayPal Sandbox reales (ambos [Fase 2] desde el 2026-11-15). Sin red: login con usuario y contraseña de Keycloak, OTP por email a un buzón local (Mailpit en Docker) y pago simulado. Apple SSO y OTP por SMS quedan fuera del MVP. |
| 6 | Servidor LLM y modelos | **llama.cpp con un modelo MoE y los expertos en RAM** (ADR 0001) | `llama-server` en Docker (ROCm o Vulkan) con un MoE mediano (objetivo: Qwen3-30B-A3B Q4), usando `--n-cpu-moe`. Ocupa poca VRAM y deja sitio a **SDXL + ControlNet** en ComfyUI. Se descartó **Avalon** como motor principal: es un fork para un solo modelo de 125B, no está medido en RDNA4, exige ROCm nativo y ocupa ~98 GiB. Queda como posible experimento, intercambiable desde el panel. |
| 7 | Arquitectura frontend/backend | **Monorepo TypeScript: Next.js PWA + API NestJS** (ADR 0003) | Monorepo con pnpm: `apps/web` (Next.js + Tailwind) y `apps/api` (NestJS REST + OpenAPI, Prisma, SSE). Un solo lenguaje, tipos compartidos y una API reutilizable por la futura app iOS. |
| 8 | Qué profesionales reciben un dossier [Fase 2] | **Todas las empresas validadas** | Una sola puja por empresa. La gestiona el profesional que la crea; sus compañeros la ven en solo lectura. Sin filtro por zona en el MVP. |
| 9 | Ciclo de vida de la ventana de pujas [Fase 2] | **Pujas editables y aceptables en cualquier momento** | Cada cambio de una puja avisa al usuario por SSE. Aceptar una puja cierra el dossier, y si en 15 días no se acepta ninguna, caduca. La duración de la ventana la configura el administrador, para poder enseñar el ciclo completo en el vídeo. |
| 10 | Recursos visuales previos | **Ninguno: dirección inicial definida por el agente** | DESIGN.md recoge tokens y dirección minimalista estilo Apple/IKEA (azul profundo, neutros cálidos, acento naranja, Inter). Cada pantalla se diseña en OpenPencil vía MCP, y una vez aprobada es la fuente de verdad. |
| 11 | Alta de autónomos (no tienen CIF) [Fase 2] | **Empresa de un solo miembro con NIF** | El campo pasa a ser "Tax ID" (CIF o NIF) y se valida su formato. Cada profesional pertenece a una única empresa. |
| 12 | Firma del contrato [Fase 2] | **Aceptación electrónica registrada** | Cada parte se vuelve a autenticar en Keycloak y se guarda quién, cuándo, la IP y el hash SHA-256 del PDF. Se añade una página de evidencias al PDF. Funciona sin red. |

**Supuestos adoptados sin pregunta explícita** (todos configurables por el administrador o revisables):
- Comisión de plataforma del 5 %.
- Penalización mínima de 50 €/día de retraso; cada profesional propone la suya en la puja.
- Ventana de pujas de 15 días por defecto.
- Interfaz traducida a los 11 idiomas, con el inglés como idioma canónico; el chat responde en el idioma del usuario.
- Los borradores anónimos que no se reclaman se borran a los 7 días.
- Las valoraciones de las empresas son datos de demostración precargados.

**Nota de actualización (2026-11-15):** la decisión 2 («PRD completo») se mantiene como historia, pero el MVP entregado a los tutores se recorta: lo que depende del marketplace, la administración, el chat de presupuesto y otras 22 features pasa a la Fase 2, y `diagnostics-dashboard` cierra el MVP. Las decisiones marcadas [Fase 2] siguen vigentes como diseño para esa fase. Ver «Alcance del MVP (actualizado el 2026-11-15)».

**Primera tarea técnica:** una prueba en la máquina de desarrollo el primer día, antes de la primera feature con IA. Consiste en ejecutar llama.cpp MoE y ComfyUI SDXL + ControlNet en Docker sobre la RX 9070 XT y medir VRAM, tokens/s y segundos por render.

### **4.4. Resumen de la Fase 2: Harness del Repositorio (harness-starter, 2026-11-12)**

La skill `/harness-starter` ha convertido los documentos de descubrimiento de la Fase 1 en la infraestructura mínima que los agentes necesitan para trabajar solos. No ha escrito código de producto, no ha inicializado frameworks ni ha instalado dependencias.

**Artefactos generados:**

| Archivo | Función |
| :---- | :---- |
| `AGENTS.md` | Punto de entrada de cualquier agente: qué documentos leer, cómo arrancar, reglas de trabajo, criterio de terminado y cierre de sesión. `CLAUDE.md` lo importa (`@AGENTS.md`) y pasa a ser la fuente de verdad operativa. |
| `init.sh` | Ruta estándar de arranque y verificación, en bash. Ahora es una versión previa al bootstrap: comprueba los requisitos del host (git, node, pnpm, docker, docker compose, python3, ffmpeg y los dispositivos de GPU `/dev/kfd` y `/dev/dri`) y valida `feature_list.json`. En las features `infra-compose-core` y `api-skeleton` pasará a levantar el stack con `docker compose` y a ejecutar lint y tests. |
| `PROGRESS.md` | Estado verificado actual (siguiente feature, bloqueos, última verificación) y registro de cada sesión. |
| `feature_list.json` | Lista de features en JSON que leen las máquinas. Cada feature tiene `id`, `area`, `title`, `user_visible_behavior`, `depends_on`, `status`, `verification`, `evidence` y `notes`. |

**Las 34 features, por bloques y en orden de ejecución:**

| Bloque | Features (`id`) |
| :---- | :---- |
| Infraestructura | `infra-compose-core`, `local-ai-gpu-spike`, `api-skeleton`, `web-pwa-shell`, `keycloak-realm-roles` |
| Identidad y captura | `homeowner-password-login`, `kitchen-capture-draft`, `moodboard-selection`, `login-gate-claim` |
| IA (imagen y presupuesto) | `gpu-job-broker`, `controlnet-render`, `catalog-rag-ingestion`, `budget-tier-computation`, `budget-chat-personas`, `budget-prompt-macros` |
| Resultados | `diy-shopping-list-pdf`, `dossier-publication` |
| B2B y marketplace | `professional-registration`, `admin-company-validation`, `admin-marketplace-settings`, `b2b-dossier-feed`, `bid-submission-revision`, `homeowner-bid-acceptance`, `bid-live-notifications` |
| Contratos y pagos | `contract-pdf-generation`, `contract-electronic-acceptance`, `commission-simulated-checkout`, `commission-paypal-sandbox` |
| Cuotas y administración | `daily-quota-enforcement`, `admin-quota-controls`, `admin-user-management`, `admin-service-endpoints` |
| Amplitud | `google-sso-login`, `language-preference-account` |

**Criterios de corte aplicados:**
- Cada feature es una porción vertical que se completa y se verifica en una sola sesión de agente.
- Las épicas se han partido. Por ejemplo, "Admin" queda en 6 features y "Contrato" en 2: generación del PDF y aceptación electrónica.
- Se han separado los títulos que unían varios dominios con "y".
- Son algo más de las 12-30 orientativas porque el alcance es el PRD completo.
- El orden sigue el recorrido de la demo. Lo más arriesgado va primero (la prueba de GPU es la segunda feature) y lo prescindible si falta tiempo va al final (Google SSO y los 11 idiomas).
- Las dependencias (`depends_on`) deciden cuándo una feature está lista para empezar. El orden de la lista solo desempata.
- Toda feature con pantallas lleva en `notes` que hay que diseñarla antes en OpenPencil vía MCP.

**Verificación realizada:**
- Un script de validación ha comprobado campos obligatorios, ids únicos y dependencias existentes, sin referencias a sí mismas y sin dependencias hacia features posteriores (por tanto, sin ciclos). Resultado: `features: 34 OK, deps acyclic and ordered`.
- `chmod +x init.sh` y `./init.sh` terminan con código 0. En el host faltan **pnpm, docker y docker compose**.

**Siguiente paso (Fase 3):**
1. El desarrollador instala Docker Engine + Compose v2.
2. Se ejecuta `/feature-flow infra-compose-core`.
3. Justo después, `/feature-flow local-ai-gpu-spike`.

**Nota de actualización (2026-11-15):** el recuento original de 34 features era el del PRD completo. Hoy `feature_list.json` tiene 16 features `accepted` del MVP, la feature nueva `diagnostics-dashboard` (cierra el MVP) y 22 features con `"phase": "phase-2"` (Fase 2, fuera del proyecto presentado a los tutores). Las listas de bloques de arriba se conservan como historia.

## **5\. Creación de la Presentación (Vídeo Demo de 15 minutos)**

La presentación es el **último punto del proyecto**: se aborda únicamente cuando el MVP esté terminado (es decir, con `diagnostics-dashboard` incluido; actualizado el 2026-11-15). El objetivo es que el vídeo se pueda reproducir y modificar fácilmente, por lo que todo el material fuente se versiona en este repositorio, en la carpeta `presentation/`.

### **5.1. Guion**

> * El agente propondrá un guion dividido en dos bloques, coherente con la estrategia de demo de la sección 1.1:  
  1. **Presentación de la app (~5 min), actualizada el 2026-11-15:** la app se muestra en un navegador en vertical junto al panel `diagnostics-dashboard` en un navegador de escritorio. Recorrido narrado del flujo B2C (fotos y medidas en cm, moodboard con Style Gallery, Login Gate, renders con ControlNet, cuatro niveles de presupuesto, simulaciones con «Mis simulaciones» y presupuesto por simulación), con el grafo en vivo iluminando los módulos que trabajan y el registro narrando qué prompt se envía. Las escenas de chat con personas, marketplace con pujas anónimas y paneles B2B y de Administración se eliminan por ser [Fase 2] y se sustituyen por la narración del panel de diagnóstico.  
  2. **Cómo lo hemos hecho (~10 min):** explicación del proceso aplicando lo aprendido en el curso: el *harness* de DevExpert y el *Spec-Driven Development*, la tríada planner/implementer/validator, el MCP de GitHub, el diseño con OpenPencil vía MCP, NotebookLM para basar los precios en catálogos reales, la IA local en la GPU AMD y la infraestructura en Docker Compose. El panel de diagnóstico sirve de apoyo visual de la arquitectura en este bloque; el corte del alcance y la Fase 2 se mencionan al final.  
> * Cada frase del guion tendrá un identificador estable (por ejemplo `s01-03`) para enlazarla con su audio, su marca de tiempo y su captura.  
> * El desarrollador revisa y aprueba el guion antes de grabar. Se guarda en `presentation/script/`.

### **5.2. Narración con voz propia**

> * El desarrollador graba el guion aprobado con su propia voz. El audio se guarda en `presentation/audio/`.

### **5.3. Transcripción con marcas de tiempo**

> * El agente transcribe la grabación con un modelo local de **voz a texto** (Whisper / faster-whisper, nativo o en Docker; puede ejecutarse en CPU para no competir por la VRAM).  
> * El resultado incluye el inicio y el fin exactos de cada frase, alineados con los identificadores del guion, y se guarda en `presentation/transcript/` en formato JSON y SRT.  
> * Este documento de tiempos es la **única referencia temporal** para el montaje final.

### **5.4. Capturas de pantalla sincronizadas con la narración**

> * Con la app (en vertical) y el panel de diagnóstico (en escritorio) funcionando en local, el agente usará el **conector MCP del navegador web** (Claude in Chrome) para recorrer las pantallas y hacer las capturas que correspondan a cada frase o bloque de la narración.  
> * Las capturas se guardan en `presentation/screenshots/`, nombradas con el identificador de la frase a la que acompañan.

### **5.5. Montaje con HyperFrames (1080p horizontal)**

> * El vídeo se monta con **HyperFrames** (https://github.com/heygen-com/hyperframes), un framework *open source* de HeyGen que convierte composiciones HTML/CSS en vídeos MP4 deterministas. Requiere Node.js 22+ y FFmpeg y se instalará en local o se ejecutará en Docker.  
> * El proyecto se crea en `presentation/hyperframes/` (`npx hyperframes init`) en **formato horizontal 1920×1080 (1080p)**, definido en la raíz de la composición (`data-width` / `data-height`).  
> * Cada captura es un *clip* cuyo `data-start` y `data-duration` salen del documento de tiempos de la transcripción. El audio de la narración es la pista principal, de modo que imagen y voz quedan sincronizadas.

### **5.6. Validación visual y exportación a MP4**

> * El desarrollador revisa el montaje con la previsualización en el navegador (`npx hyperframes preview`) y pide los ajustes al agente por el chat hasta darlo por bueno.  
> * Una vez validado, el agente guía al desarrollador **paso a paso** en la exportación a MP4 (`npx hyperframes render`), indicando cualquier acción manual necesaria.

### **5.7. Versionado del proyecto de presentación**

> * Se suben al repositorio el proyecto HyperFrames, el guion, el audio, la transcripción con tiempos y las capturas.  
> * Los MP4 renderizados se generan en `presentation/out/` y quedan excluidos de git (`.gitignore`).
