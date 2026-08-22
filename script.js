// =========================================
// REPOSITORIO: web (US OPEN)
// ARCHIVO: script.js
// NUEVO: web pública gemela a la de Roland Garros (web-main), adaptada a la carta y a los
// rangos de ID reales de US Open (restaurante002). Diferencias clave respecto a la web de
// Roland Garros:
//  - CSV_URL / LIVE_CSV_ENDPOINT / APP_SCRIPT_URL apuntan a la hoja y al Apps Script de
//    US Open (restaurante002 en config.js del Web Editor Pro).
//  - categoriesList ya NO se basa en "el ID empieza por tal dígito" (isItemInCategory por
//    prefijo), porque en la carta de US Open varias pestañas comparten el mismo primer
//    dígito pero son pestañas DISTINTAS (p.ej. Ensaladas 2001-2099, Pokes 2101-2199 y
//    Tacos 2201-2299 son 3 pestañas separadas, todas empezando por "2"). En su lugar, cada
//    categoría lleva un array `ranges` de [inicio, fin] explícitos, y un plato pertenece a
//    una pestaña si su ID cae dentro de alguno de esos rangos.
//  - La pestaña "Principales" agrupa Pescados+Carnes+Hamburguesas y añade además la
//    Guarnición como subsección aparte (mismo patrón que usa Roland Garros para colgar
//    "Guarniciones" de su pestaña "Principales").
//  - Sugerencias del Chef se agrupa en los mismos 4 bloques que en Roland Garros
//    (Entrantes / Principales / Postres / Vino) pero con los rangos numéricos reales de
//    US Open (ver seccion de id usopen.txt).
//  - Los Vinos (13100-13459) usan EXACTAMENTE la misma estructura y traducciones que
//    Roland Garros, tal y como se pidió.
//  - No se incluye el "vino especial con foto fija" tipo "El Tenista" de Roland Garros: en
//    US Open el rango de vino de Sugerencias (12991-12999) admite varios vinos, no uno solo
//    con imagen fija dedicada. Si en el futuro se quiere un vino destacado con foto propia,
//    se puede añadir siguiendo el mismo patrón que usaba "El Tenista" en web-main.
// =========================================

// NUEVO: reemplazar por la URL de "Publicar en la web" (CSV) de la hoja de US Open si
// cambiara. De momento es la misma que ya usa el Web Editor Pro (CSV_URL_RESTAURANTE002).
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSOWewZgqWZEFYiIMh8DTUX5tr6EEXBwvUJGr7hrpkCG91UhE5xU8fDJ12qcRVrT69xfZ5NGGGyhNCE/pub?output=csv';
// NUEVO: endpoint en vivo (Código.gs, ?accion=csv) para la carga por etapas/idioma. OJO: el
// Apps Script desplegado en esta URL debe tener la versión de Código.gs con LockService y el
// endpoint ?accion=csv (la que se ha preparado en Codigo_gs_US_OPEN.gs) — la versión que
// había desplegada antes en US Open era distinta/antigua y NO soporta esta carga por etapas.
const LIVE_CSV_ENDPOINT = 'https://script.google.com/macros/s/AKfycbypT6mBTNzHG1TbpHfNIAD4yNV_6JAr3VM-nKtAuWep1FFpzpvrMQq-7K4IFUC4WdLn/exec';
// NUEVO: idiomas que se precargan en segundo plano justo después del primer render (además
// del idioma del cliente, que siempre va primero). El resto de los 26 solo se piden bajo
// demanda, cuando alguien los elige en el selector "Más...".
const ESSENTIAL_LANGS = ['ES', 'EN', 'DE', 'FR', 'IT'];
// NUEVO: URL del App Script para las peticiones de sincronización del sistema (US Open)
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbypT6mBTNzHG1TbpHfNIAD4yNV_6JAr3VM-nKtAuWep1FFpzpvrMQq-7K4IFUC4WdLn/exec';
const APP_VERSION = 'v1.1.0-usopen';

const IDIOMAS = {
    ES: "🇪🇸 Español", EN: "🇬🇧 English", DE: "🇩🇪 Deutsch", FR: "🇫🇷 Français", IT: "🇮🇹 Italiano",
    RU: "🇷🇺 Русский", NL: "🇳🇱 Nederlands", PL: "🇵🇱 Polski", SV: "🇸🇪 Svenska", NO: "🇳🇴 Norsk",
    DA: "🇩🇰 Dansk", FI: "🇫🇮 Suomi", PT: "🇵🇹 Português", RO: "🇷🇴 Română", HU: "🇭🇺 Magyar",
    CS: "🇨🇿 Čeština", EL: "🇬🇷 Ελληνικά", TR: "🇹🇷 Türkçe", AR: "🇸🇪 العربية", ZH: "🇨🇳 中文", JA: "🇯🇵 日本語",
    KO: "🇰🇷 한국어",
    CA: "🏰 Català",
    EU: "🌳 Euskara",
    GL: "🐙 Galego",
    VA: "🥘 Valencià"
};

const MENU_TEXTS = {
    ES: "Menú", EN: "Menu", DE: "Menü", FR: "Menu", IT: "Menu",
    RU: "Меню", NL: "Menu", PL: "Menu", SV: "Meny", NO: "Meny",
    DA: "Menu", FI: "Menu", PT: "Menu", RO: "Meniu", HU: "Menü",
    CS: "Menu", EL: "Μενού", TR: "Menü", AR: "قائمة", ZH: "菜单", JA: "メニュー",
    KO: "메뉴", CA: "Menú", EU: "Menu", GL: "Menú", VA: "Menú"
};

let allData = [];

// NUEVO: además de pestañas completas, la hoja "Categorias" del backend también puede traer
// dos interruptores GLOBALES para toda la web (no por sección): id "fotos" (icono 📸 de
// galería) e id "info" (icono ℹ️ de descripción/preguntas). Se leen y guardan con el mismo
// mecanismo que las pestañas (fetchCategoriasDeshabilitadas), solo que generateItemHtml()
// los consulta directamente por su id fijo en vez de por pestanaId.
let idsGlobalesDesactivados = new Set();
let currentLang = 'ES', currentCat = 'sugerencias';
let currentGalleryPath = '', currentPhotoIndex = 1, maxPhotosFound = 1;
let verifiedImages = {};
let preloadQueue = [];
let isPreloading = false;
let currentPreloadSession = 0;

// NUEVO: cada categoría lleva su propio array `ranges` de [inicio, fin] de ID — ver nota de
// cabecera sobre por qué ya no se puede usar "prefijo del ID" como en Roland Garros.
// NUEVO (22 agosto): "let" en vez de "const" — init() reasigna esta lista tras filtrar las
// pestañas que el Web Editor Pro haya desactivado (ver fetchCategoriasDeshabilitadas()).
let categoriesList = [
    {
        id: 'sugerencias', ranges: [[12100, 12999]],
        ES: 'Sugerencias', EN: 'Suggestions', DE: 'Vorschläge', FR: 'Suggestions', IT: 'Suggerimenti',
        RU: 'Предложения', NL: 'Suggesties', PL: 'Sugestie', SV: 'Förslag', NO: 'Forslag',
        DA: 'Forslag', FI: 'Suositukset', PT: 'Sugestões', RO: 'Sugestii', HU: 'Ajánlatok',
        CS: 'Doporučení', EL: 'Προτάσεις', TR: 'Öneriler', AR: 'اقتراحات', ZH: '推荐', JA: 'おすすめ',
        KO: '추천 메뉴', CA: 'Suggeriments', EU: 'Gomendioak', GL: 'Suxestións', VA: 'Suggeriments'
    },
    {
        id: 'entrantes', ranges: [[1001, 1099], [1101, 1199]],
        ES: 'Entrantes', EN: 'Starters', DE: 'Vorspeisen', FR: 'Entrées', IT: 'Antipasti',
        RU: 'Закуски', NL: 'Voorgerechten', PL: 'Przystawki', SV: 'Förrätter', NO: 'Forretter',
        DA: 'Forretter', FI: 'Alkuruoat', PT: 'Entradas', RO: 'Gustări', HU: 'Előételek',
        CS: 'Předkrmy', EL: 'Ορεκτικά', TR: 'Başlangıçlar', AR: 'مقبلات', ZH: '前菜', JA: '前菜',
        KO: '에피타이저', CA: 'Entrants', EU: 'Hastekoak', GL: 'Entrantes', VA: 'Entrants'
    },
    {
        id: 'ensaladas', ranges: [[2001, 2099]],
        ES: 'Ensaladas', EN: 'Salads', DE: 'Salate', FR: 'Salades', IT: 'Insalate',
        RU: 'Салаты', NL: 'Salades', PL: 'Sałatki', SV: 'Sallader', NO: 'Salater',
        DA: 'Salater', FI: 'Salaatit', PT: 'Saladas', RO: 'Salate', HU: 'Saláták',
        CS: 'Saláty', EL: 'Σαλάτες', TR: 'Salatalar', AR: 'سلطات', ZH: '沙拉', JA: 'サラダ',
        KO: '샐러드', CA: 'Amanides', EU: 'Entsaladak', GL: 'Ensaladas', VA: 'Amanides'
    },
    {
        id: 'pokes', ranges: [[2101, 2199]],
        ES: 'Pokes', EN: 'Pokes', DE: 'Pokes', FR: 'Poke Bowls', IT: 'Poke',
        RU: 'Поке', NL: 'Pokébowls', PL: 'Poke', SV: 'Pokebowl', NO: 'Pokebowl',
        DA: 'Pokebowl', FI: 'Poke', PT: 'Poke', RO: 'Poke', HU: 'Poke',
        CS: 'Poke', EL: 'Πόκε', TR: 'Poke', AR: 'بوكي', ZH: '波奇碗', JA: 'ポキ',
        KO: '포케', CA: 'Pokes', EU: 'Pokeak', GL: 'Pokes', VA: 'Pokes'
    },
    {
        id: 'tacos', ranges: [[2201, 2299]],
        ES: 'Tacos', EN: 'Tacos', DE: 'Tacos', FR: 'Tacos', IT: 'Tacos',
        RU: 'Тако', NL: "Taco's", PL: 'Tacos', SV: 'Tacos', NO: 'Tacos',
        DA: 'Tacos', FI: 'Tacot', PT: 'Tacos', RO: 'Tacos', HU: 'Tacók',
        CS: 'Taco', EL: 'Τάκος', TR: 'Tacos', AR: 'تاكو', ZH: '塔可', JA: 'タコス',
        KO: '타코', CA: 'Tacos', EU: 'Tacoak', GL: 'Tacos', VA: 'Tacos'
    },
    {
        id: 'pastas', ranges: [[3001, 3049], [3051, 3099]],
        ES: 'Pastas', EN: 'Pasta', DE: 'Pasta', FR: 'Pâtes', IT: 'Pasta',
        RU: 'Паста', NL: 'Pasta', PL: 'Makaron', SV: 'Pasta', NO: 'Pasta',
        DA: 'Pasta', FI: 'Pasta', PT: 'Massas', RO: 'Paste', HU: 'Tészták',
        CS: 'Těstoviny', EL: 'Ζυμαρικά', TR: 'Makarna', AR: 'باستا', ZH: '意面', JA: 'パスタ',
        KO: '파스타', CA: 'Pastes', EU: 'Pastak', GL: 'Pastas', VA: 'Pastes'
    },
    {
        id: 'pizzas', ranges: [[3101, 3199]],
        ES: 'Pizzas', EN: 'Pizzas', DE: 'Pizzen', FR: 'Pizzas', IT: 'Pizze',
        RU: 'Пицца', NL: "Pizza's", PL: 'Pizze', SV: 'Pizzor', NO: 'Pizzaer',
        DA: 'Pizzaer', FI: 'Pizzat', PT: 'Pizzas', RO: 'Pizza', HU: 'Pizzák',
        CS: 'Pizzy', EL: 'Πίτσες', TR: 'Pizzalar', AR: 'بيتزا', ZH: '披萨', JA: 'ピザ',
        KO: '피자', CA: 'Pizzes', EU: 'Pizzak', GL: 'Pizzas', VA: 'Pizzes'
    },
    {
        // NUEVO: Pescados + Carnes + Hamburguesas. La Guarnición (5001-5099) se añade aparte
        // como subsección al final, igual que hace Roland Garros con sus "Guarniciones" — ver
        // el bloque final de renderMenu().
        id: 'principales', ranges: [[4001, 4099], [4101, 4199], [4201, 4299]],
        ES: 'Principales', EN: 'Mains', DE: 'Hauptspeisen', FR: 'Plats', IT: 'Piatti',
        RU: 'Основные блюда', NL: 'Hoofdgerechten', PL: 'Dania główne', SV: 'Huvudrätter', NO: 'Hovedrätter',
        DA: 'Hovedretter', FI: 'Pääruoat', PT: 'Pratos principais', RO: 'Feluri principale', HU: 'Főételek',
        CS: 'Hlavní jídla', EL: 'Κυρίως Πιάτα', TR: 'Ana Yemekler', AR: 'أطباق رئيسية', ZH: '主菜', JA: 'メインディッシュ',
        KO: '메인 요리', CA: 'Principals', EU: 'Plater Nagusiak', GL: 'Principais', VA: 'Principals'
    },
    {
        id: 'ninos', ranges: [[6001, 6099]],
        ES: 'Niños', EN: 'Kids', DE: 'Kinder', FR: 'Enfants', IT: 'Bambini',
        RU: 'Детское меню', NL: 'Kinderen', PL: 'Dla dzieci', SV: 'Barn', NO: 'Barn',
        DA: 'Børn', FI: 'Lapset', PT: 'Crianças', RO: 'Copii', HU: 'Gyerekeknek',
        CS: 'Pro děti', EL: 'Παιδικά', TR: 'Çocuklar', AR: 'أطفال', ZH: '儿童餐', JA: 'キッズメニュー',
        KO: '어린이 메뉴', CA: 'Nens', EU: 'Umeak', GL: 'Nenos', VA: 'Xiquets'
    },
    {
        id: 'postres', ranges: [[7001, 7099]],
        ES: 'Postres', EN: 'Desserts', DE: 'Desserts', FR: 'Desserts', IT: 'Dolci',
        RU: 'Десерты', NL: 'Desserts', PL: 'Desery', SV: 'Efterrätter', NO: 'Desserter',
        DA: 'Desserter', FI: 'Jälkiruoat', PT: 'Sobremesas', RO: 'Deserturi', HU: 'Desszertek',
        CS: 'Dezerty', EL: 'Επιδόρπια', TR: 'Tatlılar', AR: 'حلويات', ZH: '甜点', JA: 'デザート',
        KO: '디저트', CA: 'Postres', EU: 'Postreak', GL: 'Postres', VA: 'Postres'
    },
    {
        id: 'cafe', ranges: [[9001, 9099]],
        ES: 'Café', EN: 'Coffee', DE: 'Kaffee', FR: 'Café', IT: 'Caffè',
        RU: 'Кофе', NL: 'Koffie', PL: 'Kawa', SV: 'Kaffe', NO: 'Kaffe',
        DA: 'Kaffe', FI: 'Kahvi', PT: 'Café', RO: 'Cafea', HU: 'Kávé',
        CS: 'Káva', EL: 'Καφές', TR: 'Kahve', AR: 'قهوة', ZH: '咖啡', JA: 'コーヒー',
        KO: '커피', CA: 'Cafè', EU: 'Kafea', GL: 'Café', VA: 'Cafè'
    },
    {
        id: 'refrescos', ranges: [[10001, 10299]],
        ES: 'Refrescos', EN: 'Soft Drinks', DE: 'Softdrinks', FR: 'Boissons sans alcool', IT: 'Bibite',
        RU: 'Безалкогольные напитки', NL: 'Frisdranken', PL: 'Napoje bezalkoholowe', SV: 'Läsk', NO: 'Brus',
        DA: 'Sodavand', FI: 'Virvoitusjuomat', PT: 'Refrigerantes', RO: 'Băuturi răcoritoare', HU: 'Üdítők',
        CS: 'Nealkoholické nápoje', EL: 'Αναψυκτικά', TR: 'Meşrubatlar', AR: 'مشروبات غازية', ZH: '软饮料', JA: 'ソフトドリンク',
        KO: '청량음료', CA: 'Refrescos', EU: 'Freskagarriak', GL: 'Refrescos', VA: 'Refrescs'
    },
    {
        id: 'cervezas', ranges: [[11001, 11099]],
        ES: 'Cervezas', EN: 'Beers', DE: 'Biere', FR: 'Bières', IT: 'Birre',
        RU: 'Пиво', NL: 'Bieren', PL: 'Piwa', SV: 'Öl', NO: 'Øl',
        DA: 'Øl', FI: 'Olutta', PT: 'Cervejas', RO: 'Beri', HU: 'Sörök',
        CS: 'Piva', EL: 'Μπύρες', TR: 'Biralar', AR: 'بيرة', ZH: '啤酒', JA: 'ビール',
        KO: '맥주', CA: 'Cerveses', EU: 'Garagardoak', GL: 'Cerveses', VA: 'Cerveses'
    },
    {
        // NUEVO: Vinos — misma estructura, IDs y traducciones que Roland Garros (tal cual se pidió).
        id: '131', ranges: [[13100, 13199]],
        ES: 'Vinos Blancos', EN: 'White Wines', DE: 'Weissweine', FR: 'Vins Blancs', IT: 'Vini Bianchi',
        RU: 'Белые вина', NL: 'Witte wijnen', PL: 'Białe wina', SV: 'Vita viner', NO: 'Hvite viner',
        DA: 'Hvidvine', FI: 'Valkoviinit', PT: 'Vinhos brancos', RO: 'Vinuri albe', HU: 'Fehérborok',
        CS: 'Bílá vína', EL: 'Λευκά Κρασιά', TR: 'Beyaz Şaraplar', AR: 'نبيذ أبيض', ZH: '白葡萄酒', JA: '白ワイン',
        KO: '화이트 와인', CA: 'Vins Blancs', EU: 'Ardo Zuriak', GL: 'Viños Brancos', VA: 'Vins Blancs'
    },
    {
        id: '132', ranges: [[13200, 13299]],
        ES: 'Vinos Rosados', EN: 'Rosé Wines', DE: 'Roséweine', FR: 'Vins Rosés', IT: 'Vini Rosati',
        RU: 'Розовые вина', NL: 'Rosé wijnen', PL: 'Wina różowe', SV: 'Roséviner', NO: 'Roséviner',
        DA: 'Rosévine', FI: 'Roséviinit', PT: 'Vinhos rosés', RO: 'Vinuri roze', HU: 'Rozé borok',
        CS: 'Růžová vína', EL: 'Ροζέ Κρασιά', TR: 'Roze Şaraplar', AR: 'نبيذ روزيه', ZH: '桃红葡萄酒', JA: 'ロゼワイン',
        KO: '로제 와인', CA: 'Vins Rosats', EU: 'Ardo Arrosak', GL: 'Viños Rosados', VA: 'Vins Rosats'
    },
    {
        id: '133', ranges: [[13300, 13399]],
        ES: 'Vinos Tintos', EN: 'Red Wines', DE: 'Rotweine', FR: 'Vins Rouges', IT: 'Vini Rossi',
        RU: 'Красные вина', NL: 'Rode wijnen', PL: 'Czerwone wina', SV: 'Röda viner', NO: 'Røde viner',
        DA: 'Rødvine', FI: 'Punaviinit', PT: 'Vinhos tintos', RO: 'Vinuri roșii', HU: 'Vörösborok',
        CS: 'Červená vína', EL: 'Κόκκινα Κρασιά', TR: 'Kırmızı Şaraplar', AR: 'نبيذ أحمر', ZH: '红葡萄酒', JA: '赤ワイン',
        KO: '레드 와인', CA: 'Vins Negres', EU: 'Ardo Beltzak', GL: 'Viños Tintos', VA: 'Vins Negres'
    },
    {
        id: '134', ranges: [[13400, 13459]],
        ES: 'Cavas & Champagne', EN: 'Cava & Champagne', DE: 'Cava & Champagne', FR: 'Cava & Champagne', IT: 'Cava & Champagne',
        RU: 'Кава и Шампанское', NL: 'Cava & Champagne', PL: 'Cava i Szampan', SV: 'Cava & Champagne', NO: 'Cava og champagne',
        DA: 'Cava & Champagne', FI: 'Cava & Samppanja', PT: 'Cavas e Champagne', RO: 'Cava & Șampanie', HU: 'Cava és pezsgők',
        CS: 'Cava a Šampaňské', EL: 'Cava & Σαμπάνια', TR: 'Kava & Şampanya', AR: 'كافا وشامبانيا', ZH: '卡瓦与香槟', JA: 'カヴァ＆シャンパン',
        KO: '카바 & 샴페인', CA: 'Caves i Xampany', EU: 'Cabak eta Xanpaina', GL: 'Cavas e Champán', VA: 'Caves i Xampany'
    }
];

// NUEVO: subcategorías de vino — copiadas tal cual de Roland Garros (misma estructura de
// vinos, tal y como se pidió).
const subCatsLang = {
    mallorca: {
        ES: 'Vinos de Mallorca', EN: 'Majorcan Wines', DE: 'Weine aus Mallorca', FR: 'Vins de Majorque', IT: 'Vini di Maiorca',
        RU: 'Мальорканские вина', NL: 'Mallorquijnse wijnen', PL: 'Wina z Majorki', SV: 'Mallorkinska viner', NO: 'Mallorcanske viner',
        DA: 'Mallorcanske vine', FI: 'Mallorcalaiset viinit', PT: 'Vinhos de Maiorca', RO: 'Vinuri de Mallorca', HU: 'Mallorcai borok',
        CS: 'Mallorská vína', EL: 'Κρασιά της Μαγιόρκα', TR: 'Mallorca Şarapları', AR: 'نبيذ مايوركا', ZH: '马略卡葡萄酒', JA: 'マヨルカワイン',
        KO: '마요르카 와인', CA: 'Vins de Mallorca', EU: 'Mallorcako Ardoak', GL: 'Viños de Mallorca', VA: 'Vins de Mallorca'
    },
    copas: {
        ES: 'Copas', EN: 'By the Glass', DE: 'Glasweise', FR: 'Au Verre', IT: 'Al Calice',
        RU: 'По бокалам', NL: 'Per glas', PL: 'Na kieliszki', SV: 'Glasvis', NO: 'Glassvis',
        DA: 'Pr. glas', FI: 'Laseittain', PT: 'A copo', RO: 'La pahar', HU: 'Pohárral',
        CS: 'Rozlévaná vína', EL: 'Σε Πoτήρι', TR: 'Kadehte', AR: 'بأقداح الكأس', ZH: '杯装酒', JA: 'グラスワイン',
        KO: '글라스 와인', CA: 'Copes', EU: 'Kopak', GL: 'Copas', VA: 'Copes'
    },
    otras: {
        ES: 'Otras D.O.', EN: 'Other D.O.', DE: 'Andere D.O.', FR: 'Autres D.O.', IT: 'Altre D.O.',
        RU: 'Другие D.O.', NL: 'Overige D.O.', PL: 'Inne D.O.', SV: 'Andra D.O.', NO: 'Andre D.O.',
        DA: 'Andre D.O.', FI: 'Muut D.O.', PT: 'Outras D.O.', RO: 'Alte D.O.', HU: 'Egyéb D.O.',
        CS: 'Ostatní D.O.', EL: 'Άλλες D.O.', TR: 'Diğer D.O.', AR: 'تسميات منشأ أخرى', ZH: '其他D.O.产区', JA: 'その他のD.O.',
        KO: '기타 D.O. 원산지', CA: 'Altres D.O.', EU: 'Beste J.I.', GL: 'Outras D.O.', VA: 'Altres D.O.'
    },
    galicia: {
        ES: 'Galicia', EN: 'Galicia', DE: 'Galicien', FR: 'Galice', IT: 'Galizia',
        RU: 'Галисия', NL: 'Galicië', PL: 'Galcja', SV: 'Galicien', NO: 'Galicia',
        DA: 'Galicien', FI: 'Galicia', PT: 'Galiza', RO: 'Galicia', HU: 'Galícia',
        CS: 'Galicie', EL: 'Γαλικία', TR: 'Galiçya', AR: 'غاليسيا', ZH: '加利西亚', JA: 'ガリシア',
        KO: '갈리시아', CA: 'Galícia', EU: 'Galizia', GL: 'Galicia', VA: 'Galícia'
    },
    rueda: {
        ES: 'Rueda', EN: 'Rueda', DE: 'Rueda', FR: 'Rueda', IT: 'Rueda',
        RU: 'Руэда', NL: 'Rueda', PL: 'Rueda', SV: 'Rueda', NO: 'Rueda',
        DA: 'Rueda', FI: 'Rueda', PT: 'Rueda', RO: 'Rueda', HU: 'Rueda',
        CS: 'Rueda', EL: 'Ρουέδα', TR: 'Rueda', AR: 'رويدا', ZH: '卢埃达', JA: 'ルエダ',
        KO: '루에다', CA: 'Rueda', EU: 'Rueda', GL: 'Rueda', VA: 'Rueda'
    },
    rioja: {
        ES: 'Rioja', EN: 'Rioja', DE: 'Rioja', FR: 'Rioja', IT: 'Rioja',
        RU: 'Риоха', NL: 'Rioja', PL: 'Rioja', SV: 'Rioja', NO: 'Rioja',
        DA: 'Rioja', FI: 'Rioja', PT: 'Rioja', RO: 'Rioja', HU: 'Rioja',
        CS: 'Rioja', EL: 'Ριόχα', TR: 'Rioja', AR: 'ريوخا', ZH: '里奥哈', JA: 'リオハ',
        KO: '리오하', CA: 'Rioja', EU: 'Errioxa', GL: 'Rioja', VA: 'Rioja'
    },
    ribera: {
        ES: 'Ribera', EN: 'Ribera', DE: 'Ribera', FR: 'Ribera', IT: 'Ribera',
        RU: 'Рибера', NL: 'Ribera', PL: 'Ribera', SV: 'Ribera', NO: 'Ribera',
        DA: 'Ribera', FI: 'Ribera', PT: 'Ribera', RO: 'Ribera', HU: 'Ribera',
        CS: 'Ribera', EL: 'Ριμπέρα', TR: 'Ribera', AR: 'ريبيرا', ZH: '杜埃罗河岸', JA: 'リベラ',
        KO: '리베라', CA: 'Ribera', EU: 'Erribera', GL: 'Ribera', VA: 'Ribera'
    }
};

const wineSubCats = [
    { start: 13100, end: 13129, ...subCatsLang.mallorca },
    { start: 13130, end: 13139, ...subCatsLang.galicia },
    { start: 13140, end: 13149, ...subCatsLang.rueda },
    { start: 13150, end: 13189, ...subCatsLang.otras },
    { start: 13190, end: 13199, ...subCatsLang.copas },
    { start: 13200, end: 13249, ...subCatsLang.mallorca },
    { start: 13250, end: 13259, ...subCatsLang.copas },
    { start: 13300, end: 13329, ...subCatsLang.mallorca },
    { start: 13330, end: 13349, ...subCatsLang.rioja },
    { start: 13350, end: 13369, ...subCatsLang.ribera },
    { start: 13370, end: 13389, ...subCatsLang.otras },
    { start: 13390, end: 13399, ...subCatsLang.copas },
    { start: 13450, end: 13459, ...subCatsLang.copas }
];

// NUEVO: títulos de los 4 grupos reales de "Sugerencias del Chef" en US Open (ver
// ESTRUCTURA_RESTAURANTE002 en estructuras.js): Entrantes (12101-12199), Principales
// (12201-12899, agrupa ensaladas/pokes/tacos/ramen/pastas/pizzas/pescados/carnes/
// hamburguesas), Postres (12901-12949) y Vino (12991-12999).
const sugerenciasGroupTitles = {
    entrantes: {
        ES: 'Entrantes', EN: 'Starters', DE: 'Vorspeisen', FR: 'Entrées', IT: 'Antipasti',
        RU: 'Закуски', NL: 'Voorgerechten', PL: 'Przystawki', SV: 'Förrätter', NO: 'Forretter',
        DA: 'Forretter', FI: 'Alkuruoat', PT: 'Entradas', RO: 'Gustări', HU: 'Előételek',
        CS: 'Předkrmy', EL: 'Ορεκτικά', TR: 'Başlangıçlar', AR: 'مقبلات', ZH: '前菜', JA: '前菜',
        KO: '에피타이저', CA: 'Entrants', EU: 'Hastekoak', GL: 'Entrantes', VA: 'Entrants'
    },
    principales: {
        ES: 'Principales', EN: 'Mains', DE: 'Hauptspeisen', FR: 'Plats', IT: 'Piatti',
        RU: 'Основные блюда', NL: 'Hoofdgerechten', PL: 'Dania główne', SV: 'Huvudrätter', NO: 'Hovedrätter',
        DA: 'Hovedretter', FI: 'Pääruoat', PT: 'Pratos principais', RO: 'Feluri principale', HU: 'Főételek',
        CS: 'Hlavní jídla', EL: 'Κυρίως Πιάτα', TR: 'Ana Yemekler', AR: 'أطباق رئيسية', ZH: '主菜', JA: 'メインディッシュ',
        KO: '메인 요리', CA: 'Principals', EU: 'Plater Nagusiak', GL: 'Principais', VA: 'Principals'
    },
    postres: {
        ES: 'Postres', EN: 'Desserts', DE: 'Desserts', FR: 'Desserts', IT: 'Dolci',
        RU: 'Десерты', NL: 'Desserts', PL: 'Desery', SV: 'Efterrätter', NO: 'Desserter',
        DA: 'Desserter', FI: 'Jälkiruoat', PT: 'Sobremesas', RO: 'Deserturi', HU: 'Desszertek',
        CS: 'Dezerty', EL: 'Επιδόρπια', TR: 'Tatlılar', AR: 'حلويات', ZH: '甜点', JA: 'デザート',
        KO: '디저트', CA: 'Postres', EU: 'Postreak', GL: 'Postres', VA: 'Postres'
    },
    vinos: {
        ES: 'Vino', EN: 'Wine', DE: 'Wein', FR: 'Vin', IT: 'Vino',
        RU: 'Вино', NL: 'Wijn', PL: 'Wino', SV: 'Vin', NO: 'Vin',
        DA: 'Vin', FI: 'Viini', PT: 'Vinho', RO: 'Vin', HU: 'Bor',
        CS: 'Víno', EL: 'Κρασί', TR: 'Şarap', AR: 'نبيذ', ZH: '葡萄酒', JA: 'ワイン',
        KO: '와인', CA: 'Vi', EU: 'Ardoa', GL: 'Viño', VA: 'Vi'
    }
};

// NUEVO: título de la subsección "Guarnición" que cuelga de la pestaña "Principales" (mismo
// patrón que usa Roland Garros con sus "Guarniciones"). Conjunto parcial de idiomas, igual
// que en web-main — cae a EN/ES si el idioma actual no está en la lista.
const guarniTitles = {
    ES: 'Guarnición', EN: 'Side Dishes', DE: 'Beilagen', FR: 'Garnitures', IT: 'Contorni',
    KO: '사이드 메뉴', CA: 'Guarnició', EU: 'Garnizioa', GL: 'Guarnición', VA: 'Guarnició'
};

// NUEVO: lee la hoja "Categorias" del backend (Código.gs, ?accion=categorias) y devuelve el
// Set de ids de pestaña que están desactivadas (activa=NO). Si algo falla (red, endpoint aún
// no actualizado, etc.) devuelve un Set vacío — es decir, se muestran TODAS las pestañas, el
// mismo comportamiento de siempre. Nunca debe poder romper la carga del menú.
async function fetchCategoriasDeshabilitadas() {
    try {
        const url = `${LIVE_CSV_ENDPOINT}?accion=categorias&zx=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const text = await response.text();
        const filas = text.split(/\r?\n/).filter(f => f.trim() !== '');
        const deshabilitadas = new Set();
        filas.forEach((f, i) => {
            if (i === 0) return; // cabecera "ID,Activa"
            const c = f.split(',');
            const id = (c[0] || '').trim();
            const activa = (c[1] || '').trim().toUpperCase();
            if (id && activa === 'NO') deshabilitadas.add(id);
        });
        return deshabilitadas;
    } catch (e) {
        console.warn('[Pestañas] No se pudo comprobar qué secciones están desactivadas, se muestran todas:', e.message);
        return new Set();
    }
}

async function init() {
    try {
        injectVisualIndicatorStyles();
        populateLanguageSelect();

        const userLang = (navigator.language || navigator.userLanguage).split('-')[0].toUpperCase();
        currentLang = IDIOMAS[userLang] ? userLang : 'EN';

        const idiomasEtapa1 = Array.from(new Set([currentLang, 'ES']));

        // NUEVO: se pide en paralelo con la carga de platos (no depende de ella) para no
        // añadir latencia al primer render.
        const categoriasPromise = fetchCategoriasDeshabilitadas();

        try {
            allData = await fetchAndParseCsv(idiomasEtapa1);
        } catch (e) {
            console.warn('[Carga por etapas] Fallo en el endpoint en vivo, usando CSV completo de reserva:', e.message);
            const response = await fetch(CSV_URL);
            const csvText = await response.text();
            allData = parseCSV(csvText);
        }

        // NUEVO: aplicar las pestañas desactivadas ANTES del primer renderCategories(), para
        // que el botón de una pestaña oculta no llegue a pintarse ni un instante. Si currentCat
        // (por defecto 'sugerencias', o lo que haya dejado un checkUrlHash muy tempranero)
        // apuntara justo a la que se acaba de ocultar, se cae a la primera pestaña que quede.
        const categoriasDeshabilitadas = await categoriasPromise;
        idsGlobalesDesactivados = categoriasDeshabilitadas; // NUEVO: fotos/info conviven en el mismo Set
        if (categoriasDeshabilitadas.size > 0) {
            categoriesList = categoriesList.filter(c => !categoriasDeshabilitadas.has(c.id));
            if (!categoriesList.some(c => c.id === currentCat)) {
                currentCat = categoriesList.length > 0 ? categoriesList[0].id : currentCat;
            }
        }

        if (allData.length > 0) {
            renderCategories();
            renderMenu();
            updateLanguageUI();
            managePreload();
            setupScrollListener();
        }

        const idiomasPendientesEsenciales = ESSENTIAL_LANGS.filter(l => !idiomasEtapa1.includes(l));
        const etapa2 = idiomasPendientesEsenciales.length > 0
            ? fetchAndParseCsv(idiomasPendientesEsenciales).then(items => mergeIntoAllData(items)).catch(e => console.warn('[Carga por etapas] No se pudieron precargar los idiomas esenciales restantes:', e.message))
            : Promise.resolve();

        etapa2.then(() => {
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (conn && (conn.saveData || /2g|3g/.test(conn.effectiveType || ''))) return;

            const idiomasRestantes = Object.keys(IDIOMAS).filter(l => !idiomasEtapa1.includes(l) && !ESSENTIAL_LANGS.includes(l));
            if (idiomasRestantes.length === 0) return;
            fetchAndParseCsv(idiomasRestantes)
                .then(items => mergeIntoAllData(items))
                .catch(e => console.warn('[Carga por etapas] No se pudo precargar el resto de idiomas:', e.message));
        });
    } catch (e) { console.error("Error en la inicialización:", e); }
}

function injectVisualIndicatorStyles() {
    if (document.getElementById('indicator-styles')) return;
    const style = document.createElement('style');
    style.id = 'indicator-styles';
    style.textContent = `
        .nav-container-interactive {
            position: relative;
            width: 100%;
            margin-bottom: 5px;
        }
        #category-selector {
            display: flex;
            overflow-x: auto;
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            white-space: nowrap;
            padding-right: 50px !important;
        }
        #category-selector::-webkit-scrollbar {
            display: none;
        }
        .scroll-hint-hand {
            position: absolute;
            right: 25px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 24px;
            pointer-events: none;
            z-index: 100;
            opacity: 0.85;
            background: rgba(255,255,255,0.9);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 10px rgba(0,0,0,0.25);
            animation: swipeHand 1.6s ease-in-out infinite;
            transition: opacity 0.4s ease, transform 0.4s ease;
        }
        @keyframes swipeHand {
            0% { transform: translateY(-50%) translateX(10px); opacity: 0; }
            30% { opacity: 0.9; }
            70% { transform: translateY(-50%) translateX(-35px); opacity: 0.9; }
            100% { transform: translateY(-50%) translateX(-45px); opacity: 0; }
        }
        .nav-container-interactive::after {
            content: '';
            position: absolute;
            top: 0;
            right: 0;
            width: 45px;
            height: 100%;
            background: linear-gradient(to right, rgba(255,255,255,0), rgba(255, 255, 255, 0.95));
            pointer-events: none;
            z-index: 5;
        }
    `;
    document.head.appendChild(style);
}

function setupScrollListener() {
    const selector = document.getElementById('category-selector');
    if (!selector) return;

    const hideHint = () => {
        const hint = document.querySelector('.scroll-hint-hand');
        if (hint) {
            hint.style.opacity = '0';
            hint.style.transform = 'translateY(-50%) scale(0.5)';
            setTimeout(() => hint.remove(), 400);
        }
        selector.removeEventListener('scroll', hideHint);
        selector.removeEventListener('touchstart', hideHint);
    };

    selector.addEventListener('scroll', hideHint);
    selector.addEventListener('touchstart', hideHint);
}

function populateLanguageSelect() {
    const select = document.getElementById('more-langs');
    if (!select) return;

    select.innerHTML = '<option value="">🌐 Más...</option>';

    const ordenPrioritario = ['CA', 'EU', 'VA', 'GL'];

    ordenPrioritario.forEach(code => {
        if (IDIOMAS[code]) {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = IDIOMAS[code];
            select.appendChild(opt);
        }
    });

    Object.entries(IDIOMAS).forEach(([code, name]) => {
        if (!['ES','EN','DE','FR','IT'].includes(code) && !ordenPrioritario.includes(code)) {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = name;
            select.appendChild(opt);
        }
    });
}

function updateLanguageUI() {
    const menuTitleEl = document.getElementById('header-menu-title');
    if (menuTitleEl) {
        menuTitleEl.textContent = MENU_TEXTS[currentLang] || MENU_TEXTS['ES'];
    }

    document.querySelectorAll('#language-selector button').forEach(b => {
        b.classList.remove('active');
        const code = b.id.replace('btn-', '');
        if (IDIOMAS[code]) {
            b.textContent = IDIOMAS[code];
        }
    });

    const btn = document.getElementById(`btn-${currentLang}`);
    const select = document.getElementById('more-langs');

    if (btn) {
        btn.classList.add('active');
        if (select) select.value = '';
    } else {
        if (select) select.value = currentLang;
    }
}

function parseCSV(text) {
    const rows = [];
    const lines = text.split(/\r?\n(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (lines.length < 2) return rows;

    const clean = (val) => val ? val.replace(/^"|"$/g, '').replace(/""/g, '"').trim() : "";

    const headerCols = lines[0].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => clean(h).toUpperCase());
    const idx = {};
    headerCols.forEach((h, i) => { if (h) idx[h] = i; });
    if (idx['ID'] === undefined) return rows;

    for (let i = 1; i < lines.length; i++) {
        const col = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        const get = (headerName) => {
            const colIdx = idx[headerName];
            return (colIdx !== undefined && col[colIdx] !== undefined) ? clean(col[colIdx]) : undefined;
        };

        const idVal = get('ID');
        if (!idVal) continue;

        const item = {
            id: idVal,
            precio: (get('PRECIO') || '0').replace(',', '.'),
            activa: (get('ACTIVA') || '').toUpperCase(),
            carpeta: get('CARPETA') || '',
            archivo: get('ARCHIVO_FOTO') || '',
            alergenos: (() => { const a = get('ALERGENOS_COD'); return a ? a.split(',').map(x => x.trim()).filter(x => x) : []; })(),
            // NUEVO: posiciones (1, 2, 3...) de las palabras entre "//.../ /" del nombre que
            // están desactivadas para este plato — p.ej. "2,5". Es la misma lista para todos
            // los idiomas (ver processName/generateItemHtml, que la aplican por posición).
            opcionesInactivas: (() => { const o = get('OPCIONES_INACTIVAS'); return o ? o.split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n)) : []; })()
        };

        Object.keys(idx).forEach(h => {
            if (h.indexOf('NOMBRE_') === 0) {
                item[`nombre_${h.replace('NOMBRE_', '').toLowerCase()}`] = get(h) || '';
            } else if (h.indexOf('INFO_') === 0) {
                item[`info_${h.replace('INFO_', '').toLowerCase()}`] = get(h) || '';
            }
        });

        rows.push(item);
    }
    return rows;
}

async function fetchAndParseCsv(langs) {
    const idiomasParam = langs.join(',');
    const url = `${LIVE_CSV_ENDPOINT}?accion=csv&idiomas=${encodeURIComponent(idiomasParam)}&zx=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.text();
    return parseCSV(text);
}

function mergeIntoAllData(newItems) {
    const byId = {};
    allData.forEach(it => { byId[it.id] = it; });
    newItems.forEach(ni => {
        const existente = byId[ni.id];
        if (existente) {
            Object.keys(ni).forEach(k => {
                if (k.startsWith('nombre_') || k.startsWith('info_')) existente[k] = ni[k];
            });
        } else {
            allData.push(ni);
            byId[ni.id] = ni;
        }
    });
}

function isLangLoaded(lang) {
    if (allData.length === 0) return false;
    return allData[0][`nombre_${lang.toLowerCase()}`] !== undefined;
}

// REESCRITO respecto a Roland Garros: aquí un plato pertenece a una pestaña si su ID cae
// dentro de alguno de los rangos [inicio, fin] declarados en `ranges` para esa categoría —
// ya no se deduce por la longitud/prefijo del ID (ver nota de cabecera del archivo).
function isItemInCategory(itemId, catId) {
    const idNum = parseInt(itemId, 10);
    if (isNaN(idNum)) return false;
    const cat = categoriesList.find(c => c.id === catId);
    if (!cat || !cat.ranges) return false;
    return cat.ranges.some(([start, end]) => idNum >= start && idNum <= end);
}

function renderCategories() {
    const nav = document.getElementById('category-selector');
    if (!nav) return;

    if (nav.parentNode && !nav.parentNode.classList.contains('nav-container-interactive')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'nav-container-interactive';
        nav.parentNode.insertBefore(wrapper, nav);
        wrapper.appendChild(nav);

        const handHint = document.createElement('div');
        handHint.className = 'scroll-hint-hand';
        handHint.innerHTML = '👉';
        wrapper.appendChild(handHint);
    }

    nav.innerHTML = categoriesList.map(c => {
        const catName = c[currentLang] || c['EN'] || c['ES'];
        const finalLabel = currentLang === 'ES' ? catName : `${catName} - ${c['ES']}`;
        return `<button onclick="filterCategory('${c.id}')" class="cat-btn ${currentCat === c.id ? 'active' : ''}">${finalLabel}</button>`;
    }).join('');
}

function renderMenu() {
    const grid = document.getElementById('items-list'), title = document.getElementById('current-category-name');
    const catObj = categoriesList.find(c => c.id === currentCat);

    const catName = catObj ? (catObj[currentLang] || catObj['EN'] || catObj['ES']) : "";
    const translatedTitle = currentLang === 'ES' ? catName : `${catName} - ${catObj['ES']}`;

    if (title) title.innerHTML = `${translatedTitle} <span style="font-size: 0.4em; opacity: 0.5; font-weight: normal; margin-left: 10px;">${APP_VERSION}</span>`;
    if (grid) grid.innerHTML = '';

    const filtered = allData.filter(item => {
        return isItemInCategory(item.id, currentCat) && item.activa === 'SI';
    });

    if (currentCat === 'sugerencias') {
        // NUEVO: Sugerencias se agrupa en 4 bloques fijos (rangos reales de US Open — ver
        // ESTRUCTURA_RESTAURANTE002 en estructuras.js), igual que hace Roland Garros pero con
        // sus propios límites numéricos: Vino (12991-12999) se comprueba ANTES que Postres
        // porque cae dentro del mismo millar que 12900-12999.
        let entrantes = [], principales = [], postres = [], vinosSug = [];
        filtered.forEach(item => {
            const idNum = parseInt(item.id, 10);
            if (idNum >= 12991 && idNum <= 12999) vinosSug.push(item);
            else if (idNum >= 12101 && idNum <= 12199) entrantes.push(item);
            else if (idNum >= 12201 && idNum <= 12899) principales.push(item);
            else if (idNum >= 12901 && idNum <= 12949) postres.push(item);
            else entrantes.push(item);
        });
        const renderSugGroup = (titleObj, lista) => {
            if (lista.length === 0 || !grid) return;
            const catName = titleObj[currentLang] || titleObj['EN'] || titleObj['ES'];
            const finalName = currentLang === 'ES' ? catName : `${catName} - ${titleObj['ES']}`;
            grid.innerHTML += `<h3 class="sub-category-title">${finalName}</h3>`;
            lista.forEach(p => { grid.innerHTML += generateItemHtml(p); });
        };
        renderSugGroup(sugerenciasGroupTitles.entrantes, entrantes);
        renderSugGroup(sugerenciasGroupTitles.principales, principales);
        renderSugGroup(sugerenciasGroupTitles.postres, postres);
        renderSugGroup(sugerenciasGroupTitles.vinos, vinosSug);
    } else {
        let currentActiveSubCatName = "";
        filtered.forEach(item => {
            const idNum = parseInt(item.id, 10);
            if (currentCat.startsWith('13')) {
                const foundSub = wineSubCats.find(s => idNum >= s.start && idNum <= s.end);
                if (foundSub && grid) {
                    const subCatName = foundSub[currentLang] || foundSub['EN'] || foundSub['ES'];
                    const finalSubName = currentLang === 'ES' ? subCatName : `${subCatName} - ${foundSub['ES']}`;
                    if (finalSubName !== currentActiveSubCatName) {
                        grid.innerHTML += `<h3 class="sub-category-title">${finalSubName}</h3>`;
                        currentActiveSubCatName = finalSubName;
                    }
                }
            }
            if (grid) grid.innerHTML += generateItemHtml(item);
        });
    }

    if (currentCat === 'principales') {
        // NUEVO: la Guarnición (5001-5099) cuelga de la pestaña "Principales" como subsección
        // aparte, igual que Roland Garros cuelga sus "Guarniciones" de su propia pestaña
        // "Principales".
        const guarnis = allData.filter(item => {
            const idNum = parseInt(item.id, 10);
            return idNum >= 5001 && idNum <= 5099 && item.activa === 'SI';
        });
        if (guarnis.length > 0 && grid) {
            const titleText = guarniTitles[currentLang] || guarniTitles['EN'] || guarniTitles['ES'];
            const finalGuarniTitle = currentLang === 'ES' ? titleText : `${titleText} - ${guarniTitles['ES']}`;
            grid.innerHTML += `<h3 class="sub-category-title">${finalGuarniTitle}</h3>`;
            guarnis.forEach(g => grid.innerHTML += generateItemHtml(g, true));
        }
    }
}

function utf8ToB64(str) { return btoa(unescape(encodeURIComponent(str))); }
function b64ToUtf8(str) { return decodeURIComponent(escape(atob(str))); }

function generateItemHtml(item, isGuarni = false) {
    // NUEVO: además del "Nombre // Detalle" de siempre (una sola pareja de "//", usado para
    // la uva de los vinos), ahora se admiten VARIAS palabras entre "//.../ /" seguidas — cada
    // una es una "opción" independiente (sabor, ingrediente...) que se puede activar/desactivar
    // por plato desde el editor (ver item.opcionesInactivas). OJO: a propósito NO se filtran
    // los trozos vacíos del split ANTES de separar nombre/opciones — si se hiciera, un
    // separador no vacío como " , " desplazaría la paridad par/impar y se romperían las
    // posiciones. Los índices IMPARES del split (1, 3, 5...) son siempre las opciones; los
    // PARES (0, 2, 4...) son el nombre y el texto de relleno entre opciones, que se descarta.
    const processName = (text) => {
        if (!text) return { name: '', uvas: '', opciones: [] };
        const parts = text.split('//');
        const name = (parts[0] || '').trim();
        const opciones = [];
        for (let i = 1; i < parts.length; i += 2) {
            const tok = (parts[i] || '').trim();
            if (tok !== '') opciones.push(tok);
        }
        return { name, uvas: opciones[0] || '', opciones };
    };

    // NUEVO: texto final de la segunda línea — solo las opciones ACTIVAS (por posición
    // 1-based, misma lista para todos los idiomas), unidas por comas.
    const opcionesActivasTexto = (data) => {
        if (!data.opciones || data.opciones.length === 0) return '';
        const inactivas = item.opcionesInactivas || [];
        return data.opciones.filter((_, idx) => !inactivas.includes(idx + 1)).join(', ');
    };

    const currentData = processName(item[`nombre_${currentLang.toLowerCase()}`] || item.nombre_es);
    const secondaryData = processName(item.nombre_es);
    const currentOpcionesTexto = opcionesActivasTexto(currentData);
    const secondaryOpcionesTexto = opcionesActivasTexto(secondaryData);

    // NOTA: a diferencia de Roland Garros, aquí NO se oculta el precio de la Guarnición por
    // defecto — en el documento de rangos de US Open no consta que la guarnición (5001-5099)
    // se sirva gratis con el plato principal. Si la carta real funciona así, basta con dejar
    // el precio a 0.00 en la hoja para esos platos (el precio ya se oculta automáticamente
    // cuando vale 0).
    const price = parseFloat(item.precio) > 0 ? `${parseFloat(item.precio).toFixed(2)}€` : '';
    const alergenosHtml = item.alergenos.map(a => `<img src="imagenes/alergenos/${a}.webp" loading="lazy" onerror="this.style.display='none'">`).join('');

    let photoIcon = '';
    let clickAction = '';
    let clickableStyle = '';

    if (!idsGlobalesDesactivados.has('fotos') && item.archivo && item.archivo.includes('01.webp')) {
        const base = `imagenes/${item.carpeta}/${item.archivo.split('01.webp')[0]}`;
        photoIcon = `<span class="emoji-photo">📸</span>`;
        clickAction = `onclick="openGallery('${base}')"`;
        clickableStyle = 'style="cursor: pointer;"';
    }

    let infoIconHtml = '';
    const infoKey = `info_${currentLang.toLowerCase()}`;
    const infoData = item[infoKey];
    if (!idsGlobalesDesactivados.has('info') && infoData && infoData.trim() !== '') {
        const b64Info = utf8ToB64(infoData);
        const infoClickHandler = `event.stopPropagation(); showInfoModal('${b64Info}')`;
        infoIconHtml = `<span class="emoji-info" onclick="${infoClickHandler}" title="Info">ℹ️</span>`;
    }

    const infoPlacement = `${currentData.name}${photoIcon ? ' ' + photoIcon : ''}${infoIconHtml ? ' ' + infoIconHtml : ''}`;

    return `
    <div class="item-row">
        <div class="item-content" ${clickAction} ${clickableStyle}>
            <span class="name-selected">
                ${infoPlacement}
                ${currentOpcionesTexto ? `<br><small style="font-size:0.85em; opacity:0.8; font-style:italic; display:block; margin-top:2px;">${currentOpcionesTexto}</small>` : ''}
            </span>
            ${currentLang !== 'ES' ? `
            <span class="name-secondary">
                ${secondaryData.name}
                ${secondaryOpcionesTexto ? `<br><small style="font-size:0.85em; opacity:0.8; font-style:italic;">${secondaryOpcionesTexto}</small>` : ''}
            </span>` : ''}
            <div class="alergenos-list">${alergenosHtml}</div>
        </div>
        <div class="price-box">${price}</div>
    </div>`;
}

function managePreload() {
    currentPreloadSession++;
    const mySession = currentPreloadSession;
    isPreloading = false;
    preloadQueue = [];

    const sortedData = [...allData].sort((a, b) => parseInt(a.id, 10) - parseInt(b.id, 10));

    const addCategoryByLevels = (items, maxNivel = 4) => {
        const bases = items.map(item => `imagenes/${item.carpeta}/${item.archivo.split('01.webp')[0]}`);
        for (let level = 1; level <= maxNivel; level++) {
            bases.forEach(base => { preloadQueue.push({ base, n: level }); });
        }
    };

    const currentItems = sortedData.filter(i => isItemInCategory(i.id, currentCat) && i.archivo && i.activa === 'SI');
    const esCategoriaVinos = currentCat && currentCat.toString().startsWith('13');
    addCategoryByLevels(currentItems, esCategoriaVinos ? 1 : 4);

    const otherFoodItems = sortedData.filter(i => !isItemInCategory(i.id, currentCat) && parseInt(i.id, 10) < 13000 && i.archivo && i.activa === 'SI');
    addCategoryByLevels(otherFoodItems);

    if (esCategoriaVinos) {
        const wineItems = sortedData.filter(i => !isItemInCategory(i.id, currentCat) && parseInt(i.id, 10) >= 13000 && i.archivo && i.activa === 'SI');
        addCategoryByLevels(wineItems, 1);
    }

    processPreloadQueue(mySession);
}

async function processPreloadQueue(session) {
    if (isPreloading) return;
    isPreloading = true;

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && (conn.saveData || /2g|3g/.test(conn.effectiveType || ''))) {
        isPreloading = false;
        return;
    }

    while (preloadQueue.length > 0) {
        if (session !== currentPreloadSession) { isPreloading = false; return; }
        const task = preloadQueue.shift();
        const url = `${task.base}0${task.n}.webp`;

        if (task.n > 1) {
            const prevUrl = `${task.base}0${task.n - 1}.webp`;
            if (verifiedImages[prevUrl] === false) { verifiedImages[url] = false; continue; }
        }

        if (verifiedImages[url] !== undefined) continue;

        await new Promise(resolve => setTimeout(resolve, 150));
        if (session !== currentPreloadSession) { isPreloading = false; return; }

        const success = await new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });

        verifiedImages[url] = success;
    }
    isPreloading = false;
}

async function openGallery(base) {
    currentPreloadSession++;
    currentGalleryPath = base;
    currentPhotoIndex = 1;
    maxPhotosFound = 1;

    updateModal();
    const modal = document.getElementById('photo-modal');
    if (modal) modal.style.display = 'flex';

    for (let i = 2; i <= 4; i++) {
        const url = `${base}0${i}.webp`;
        let exists = verifiedImages[url];

        if (exists === undefined) {
            exists = await new Promise(r => {
                const img = new Image();
                img.onload = () => r(true);
                img.onerror = () => r(false);
                img.src = url;
            });
            verifiedImages[url] = exists;
        }

        if (exists) {
            maxPhotosFound = i;
            updateModal();
        } else {
            break;
        }
    }
    processPreloadQueue(currentPreloadSession);
}

function updateModal() {
    const img = document.getElementById('modal-img');
    const prev = document.getElementById('prev-btn');
    const next = document.getElementById('next-btn');

    if (img) img.src = `${currentGalleryPath}0${currentPhotoIndex}.webp`;
    if (prev) prev.style.display = currentPhotoIndex > 1 ? 'block' : 'none';
    if (next) next.style.display = currentPhotoIndex < maxPhotosFound ? 'block' : 'none';
}

function changePhoto(n) { currentPhotoIndex += n; updateModal(); }
function closeModal() { const modal = document.getElementById('photo-modal'); if (modal) modal.style.display = 'none'; }

function showInfoModal(b64Str) {
    let data;
    try {
        const jsonStr = b64ToUtf8(b64Str);
        data = JSON.parse(jsonStr);
    } catch(e) {
        console.error("Error al parsear info:", e);
        return;
    }

    let modal = document.getElementById('info-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'info-modal';
        document.body.appendChild(modal);
    }

    let html = `<div class="info-modal-content">
        <span class="close-modal" onclick="closeInfoModal()">&times;</span>
        <div class="info-desc">${data.desc || ''}</div>`;

    if (data.q1 && data.r1) html += `<div class="info-qa"><b>Q: ${data.q1}</b><br><span class="info-a">A: ${data.r1}</span></div>`;
    if (data.q2 && data.r2) html += `<div class="info-qa"><b>Q: ${data.q2}</b><br><span class="info-a">A: ${data.r2}</span></div>`;
    if (data.q3 && data.r3) html += `<div class="info-qa"><b>Q: ${data.q3}</b><br><span class="info-a">A: ${data.r3}</span></div>`;

    html += `</div>`;
    modal.innerHTML = html;
    modal.style.display = 'flex';
}

function closeInfoModal() {
    const modal = document.getElementById('info-modal');
    if (modal) modal.style.display = 'none';
}

async function changeLanguage(l) {
    if (!l) return;

    if (!isLangLoaded(l)) {
        const select = document.getElementById('more-langs');
        if (select) select.disabled = true;
        try {
            const nuevosItems = await fetchAndParseCsv([l]);
            mergeIntoAllData(nuevosItems);
        } catch (e) {
            console.error('Error cargando idioma bajo demanda:', e);
            if (select) select.disabled = false;
            return;
        }
        if (select) select.disabled = false;
    }

    currentLang = l;
    updateLanguageUI();
    renderCategories();
    renderMenu();
    managePreload();
}

function filterCategory(id) {
    currentCat = id;
    renderCategories();
    renderMenu();
    window.scrollTo(0,0);
    managePreload();
}

init();

window.addEventListener('hashchange', checkUrlHash);
window.addEventListener('DOMContentLoaded', checkUrlHash);

function checkUrlHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash && categoriesList.some(c => c.id === hash)) { filterCategory(hash); }
}

document.addEventListener('click', function(e) {
    const modal = document.getElementById('info-modal');
    if (modal && e.target === modal) {
        closeInfoModal();
    }
});
