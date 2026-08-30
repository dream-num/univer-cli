export const STRUCTURAL_ENTITY_CATEGORIES = [
  "paragraph",
  "text-style",
  "section",
  "block-range",
  "custom-range",
  "table-range",
  "custom-block",
  "column-group",
  "table",
  "drawing",
  "header",
  "footer",
  "document-style",
  "document-setting",
  "custom-decoration",
  "doc-hyperlink",
  "doc-callout",
  "doc-quote",
  "doc-chart",
  "doc-chart-data",
  "doc-code",
  "doc-latex",
  "doc-shape-resource",
  "doc-table-resource",
  "slide",
  "slide-element",
  "slide-transition",
  "slide-transition-ref",
  "slide-master",
  "slide-layout",
  "slide-theme",
  "slide-chart",
  "slide-chart-data",
  "slide-table",
  "base",
  "field",
  "record",
  "view",
  "cell",
  "board-page",
  "board-element",
  "board-theme",
  "board-chart",
  "board-chart-data",
  "board-table"
] as const;

export type VocabularyLocale = keyof typeof LABELS;

type EntityTerm =
  | "paragraph"
  | "section"
  | "range"
  | "block"
  | "documentItem"
  | "slide"
  | "slideElement"
  | "transition"
  | "theme"
  | "base"
  | "field"
  | "record"
  | "view"
  | "boardPage"
  | "boardElement";

const LABELS = {
  "ca-ES": ["Paràgraf", "Secció", "Interval", "Bloc", "Contingut del document", "Diapositiva", "Element de diapositiva", "Transició", "Tema", "Base de dades", "Camp", "Registre", "Vista", "Pàgina de pissarra", "Element de pissarra"],
  "de-DE": ["Absatz", "Abschnitt", "Bereich", "Block", "Dokumentinhalt", "Folie", "Folienelement", "Übergang", "Design", "Datenbank", "Feld", "Datensatz", "Ansicht", "Board-Seite", "Board-Element"],
  "es-ES": ["Párrafo", "Sección", "Rango", "Bloque", "Contenido del documento", "Diapositiva", "Elemento de diapositiva", "Transición", "Tema", "Base de datos", "Campo", "Registro", "Vista", "Página de pizarra", "Elemento de pizarra"],
  "fr-FR": ["Paragraphe", "Section", "Plage", "Bloc", "Contenu du document", "Diapositive", "Élément de diapositive", "Transition", "Thème", "Base de données", "Champ", "Enregistrement", "Vue", "Page de tableau", "Élément de tableau"],
  "id-ID": ["Paragraf", "Bagian", "Rentang", "Blok", "Konten dokumen", "Slide", "Elemen slide", "Transisi", "Tema", "Basis data", "Bidang", "Rekaman", "Tampilan", "Halaman papan", "Elemen papan"],
  "it-IT": ["Paragrafo", "Sezione", "Intervallo", "Blocco", "Contenuto del documento", "Diapositiva", "Elemento diapositiva", "Transizione", "Tema", "Database", "Campo", "Record", "Vista", "Pagina lavagna", "Elemento lavagna"],
  "ja-JP": ["段落", "セクション", "範囲", "ブロック", "ドキュメント内容", "スライド", "スライド要素", "画面切り替え", "テーマ", "データベース", "フィールド", "レコード", "ビュー", "ボードページ", "ボード要素"],
  "ko-KR": ["단락", "구역", "범위", "블록", "문서 콘텐츠", "슬라이드", "슬라이드 요소", "전환", "테마", "데이터베이스", "필드", "레코드", "보기", "보드 페이지", "보드 요소"],
  "pl-PL": ["Akapit", "Sekcja", "Zakres", "Blok", "Zawartość dokumentu", "Slajd", "Element slajdu", "Przejście", "Motyw", "Baza danych", "Pole", "Rekord", "Widok", "Strona tablicy", "Element tablicy"],
  "pt-BR": ["Parágrafo", "Seção", "Intervalo", "Bloco", "Conteúdo do documento", "Slide", "Elemento do slide", "Transição", "Tema", "Base de dados", "Campo", "Registro", "Visualização", "Página do quadro", "Elemento do quadro"],
  "ru-RU": ["Абзац", "Раздел", "Диапазон", "Блок", "Содержимое документа", "Слайд", "Элемент слайда", "Переход", "Тема", "База данных", "Поле", "Запись", "Представление", "Страница доски", "Элемент доски"],
  "sk-SK": ["Odsek", "Sekcia", "Rozsah", "Blok", "Obsah dokumentu", "Snímka", "Prvok snímky", "Prechod", "Motív", "Databáza", "Pole", "Záznam", "Zobrazenie", "Strana tabule", "Prvok tabule"],
  "vi-VN": ["Đoạn văn", "Phần", "Phạm vi", "Khối", "Nội dung tài liệu", "Trang chiếu", "Phần tử trang chiếu", "Chuyển tiếp", "Chủ đề", "Cơ sở dữ liệu", "Trường", "Bản ghi", "Chế độ xem", "Trang bảng", "Phần tử bảng"],
  "zh-HK": ["段落", "分節", "範圍", "區塊", "文件內容", "投影片", "投影片元素", "轉場", "主題", "資料庫", "欄位", "記錄", "檢視", "畫板頁", "畫板元素"],
  "zh-TW": ["段落", "區段", "範圍", "區塊", "文件內容", "投影片", "投影片元素", "轉場", "主題", "資料庫", "欄位", "記錄", "檢視", "畫板頁", "畫板元素"]
} as const;

const TERM_INDEX: Readonly<Record<EntityTerm, number>> = {
  paragraph: 0,
  section: 1,
  range: 2,
  block: 3,
  documentItem: 4,
  slide: 5,
  slideElement: 6,
  transition: 7,
  theme: 8,
  base: 9,
  field: 10,
  record: 11,
  view: 12,
  boardPage: 13,
  boardElement: 14
};

const CATEGORY_TERM: Readonly<Partial<Record<(typeof STRUCTURAL_ENTITY_CATEGORIES)[number], EntityTerm>>> = {
  paragraph: "paragraph",
  section: "section",
  "block-range": "range",
  "custom-range": "range",
  "table-range": "range",
  "custom-block": "block",
  "column-group": "documentItem",
  drawing: "documentItem",
  header: "documentItem",
  footer: "documentItem",
  "document-setting": "documentItem",
  "custom-decoration": "documentItem",
  "doc-hyperlink": "documentItem",
  "doc-callout": "documentItem",
  "doc-quote": "block",
  "doc-code": "block",
  slide: "slide",
  "slide-element": "slideElement",
  "slide-transition": "transition",
  "slide-transition-ref": "transition",
  "slide-master": "slide",
  "slide-layout": "slide",
  "slide-theme": "theme",
  base: "base",
  field: "field",
  record: "record",
  view: "view",
  "board-page": "boardPage",
  "board-element": "boardElement",
  "board-theme": "theme"
};

export function localizedStructuralEntity(
  locale: VocabularyLocale,
  category: string,
  shared: {
    readonly content: string;
    readonly styles: string;
    readonly chart: string;
    readonly table: string;
    readonly cell: string;
    readonly formula: string;
    readonly shape: string;
  }
): string {
  const entity = category.split(":")[0] ?? "";
  if (entity === "text-style" || entity === "document-style") return shared.styles;
  if (entity === "cell") return shared.cell;
  if (entity.includes("chart-data")) return `${shared.chart} · ${shared.content}`;
  if (entity.includes("chart")) return shared.chart;
  if (entity.includes("table")) return shared.table;
  if (entity === "doc-latex") return shared.formula;
  if (entity === "doc-shape-resource") return shared.shape;
  const term = CATEGORY_TERM[entity as (typeof STRUCTURAL_ENTITY_CATEGORIES)[number]];
  return term === undefined ? shared.content : (LABELS[locale][TERM_INDEX[term]] ?? shared.content);
}
