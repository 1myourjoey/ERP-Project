import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const A4_WIDTH = 11906;
const A4_HEIGHT = 16838;
const CONTENT_WIDTH_COMPACT = 9360;
const CONTENT_WIDTH_FORMAL = 9360;
const CONTENT_WIDTH_REPORT = 9360;
const DEFAULT_FONT = "Malgun Gothic";
const BORDER = { style: BorderStyle.SINGLE, size: 2, color: "BFC8D6" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const SECTION_LAYOUTS = {
  compact: { top: 1080, right: 1260, bottom: 1080, left: 1260 },
  formal: { top: 1260, right: 1260, bottom: 1260, left: 1260 },
  report: { top: 1080, right: 1260, bottom: 1080, left: 1260 },
};
const TITLE_PRESETS = {
  compact: { size: 30, after: 240, line: 320 },
  formal: { size: 30, after: 260, line: 320 },
  report: { size: 28, after: 180, line: 280 },
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function run(text, options = {}) {
  return new TextRun({
    text: text == null ? "" : String(text),
    font: DEFAULT_FONT,
    size: options.size ?? 20,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
    color: options.color,
    break: options.break ? 1 : undefined,
  });
}

function paragraph(text, options = {}) {
  const children = Array.isArray(text)
    ? text
    : [run(text, { size: options.size, bold: options.bold, italics: options.italics, color: options.color })];
  return new Paragraph({
    children,
    alignment: options.alignment ?? AlignmentType.LEFT,
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 100,
      line: options.line ?? 260,
    },
  });
}

function plainCell(text, width, options = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: options.borders ?? BORDERS,
    shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
    margins: options.margins ?? { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      paragraph(text, {
        size: options.size ?? 19,
        bold: options.bold,
        alignment: options.alignment ?? AlignmentType.LEFT,
        after: 0,
        line: options.line ?? 260,
      }),
    ],
  });
}

function makeTable(columnWidths, rowValues, options = {}) {
  return new Table({
    width: { size: options.width ?? columnWidths.reduce((acc, item) => acc + item, 0), type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    rows: rowValues.map((row, rowIndex) =>
      new TableRow({
        children: row.map((cell, cellIndex) => {
          const cellOptions = (options.cellOptions?.[rowIndex]?.[cellIndex]) || {};
          return plainCell(cell, columnWidths[cellIndex], cellOptions);
        }),
      }),
    ),
  });
}

function resolveLayout(layout = "report") {
  if (layout === true) return "compact";
  if (layout === false || layout == null) return "report";
  return SECTION_LAYOUTS[layout] ? layout : "report";
}

function compactSection(children, layout = "report") {
  const preset = SECTION_LAYOUTS[resolveLayout(layout)];
  return {
    properties: {
      page: {
        size: {
          width: A4_WIDTH,
          height: A4_HEIGHT,
          orientation: PageOrientation.PORTRAIT,
        },
        margin: preset,
      },
    },
    children,
  };
}

function createDocument(children, { compact = false, layout } = {}) {
  const resolvedLayout = layout ?? (compact ? "compact" : "report");
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: DEFAULT_FONT, size: 20 },
        },
      },
    },
    sections: [compactSection(children, resolvedLayout)],
  });
}

function docTitle(text, layout = "report") {
  const preset = TITLE_PRESETS[resolveLayout(layout)];
  return paragraph(text, {
    alignment: AlignmentType.CENTER,
    size: preset.size,
    bold: true,
    before: 0,
    after: preset.after,
    line: preset.line,
  });
}

function buildOfficialNotice(payload) {
  const meeting = payload.meeting || {};
  const agendas = payload.agendas || [];
  const attachments = payload.attachments || [];
  const rows = [
    ["날짜", payload.document_date || ""],
    ["문서번호", payload.document_number || ""],
    ["수신", (payload.recipients || []).join(", ")],
    ["제목", payload.subject || ""],
  ];
  const children = [
    docTitle(payload.sender_name || payload.fund_name || "총회 공문", true),
    makeTable([1900, CONTENT_WIDTH_COMPACT - 1900], rows, {
      width: CONTENT_WIDTH_COMPACT,
      cellOptions: rows.map(() => [{ fill: "EAF2FB", bold: true }, {}]),
    }),
    paragraph(payload.greeting || "귀 원(사)의 무궁한 발전을 기원합니다.", { size: 20, after: 140, line: 300 }),
    paragraph(payload.legal_basis || "", { size: 19, after: 140, line: 300 }),
    paragraph("- 다   음 -", { alignment: AlignmentType.CENTER, bold: true, size: 18, before: 40, after: 80 }),
    paragraph(`1) 일시 : ${meeting.date_label || ""} ${meeting.time || ""}`, { size: 18, after: 30 }),
    paragraph(`2) 개최방식 : ${meeting.method || ""}`, { size: 18, after: 30 }),
    meeting.location ? paragraph(`3) 개최장소 : ${meeting.location}`, { size: 18, after: 30 }) : undefined,
    paragraph("4) 회의목적사항", { size: 18, after: 30 }),
    paragraph(`가. 보고사항 : ${(payload.report_items || []).join(", ") || "-"}`, { size: 17, after: 30 }),
    paragraph("나. 부의안건", { size: 17, after: 20 }),
    ...agendas.map((agenda, index) =>
      paragraph(`제${index + 1}호 의안 : ${agenda.title || agenda.short_title || ""}`, { size: 17, after: 20 }),
    ),
    attachments.length
      ? paragraph("[별첨 자료]", { size: 17, bold: true, before: 30, after: 20 })
      : undefined,
    ...(attachments.length
      ? [
          makeTable(
            [1400, CONTENT_WIDTH_COMPACT - 1400],
            attachments.map((item, index) => [`별첨${index + 1}`, item.label || item]),
            {
              width: CONTENT_WIDTH_COMPACT,
              cellOptions: attachments.map(() => [{ fill: "F8FAFC", bold: true }, {}]),
            },
          ),
        ]
      : []),
    paragraph(payload.signoff_date || meeting.date_label || payload.document_date || "", {
      alignment: AlignmentType.CENTER,
      size: 19,
      before: 180,
      after: 70,
      line: 280,
    }),
    paragraph(payload.signoff_name || payload.sender_name || payload.fund_name || "", {
      alignment: AlignmentType.CENTER,
      size: 24,
      bold: true,
      after: 60,
      line: 300,
    }),
  ].filter(Boolean);
  return createDocument(children, { layout: "formal" });
}

function buildAgendaExplanation(payload) {
  const meeting = payload.meeting || {};
  const agendas = payload.agendas || [];
  const summaryRows = (payload.financial_summary || []).map((item) => [item.label || "", item.value || "", item.note || ""]);
  const children = [
    docTitle(payload.title || `${payload.fund_name || ""} 의안설명서`),
    makeTable(
      [2200, CONTENT_WIDTH_REPORT - 2200],
      [
        ["개최일자", `${meeting.date_label || ""} ${meeting.time || ""}`.trim()],
        ["개최방식", meeting.method || ""],
        ["개최장소", meeting.location || ""],
        ["의장", meeting.chair_name || ""],
      ],
      {
        width: CONTENT_WIDTH_REPORT,
        cellOptions: [
          [{ fill: "EAF2FB", bold: true }, {}],
          [{ fill: "EAF2FB", bold: true }, {}],
          [{ fill: "EAF2FB", bold: true }, {}],
          [{ fill: "EAF2FB", bold: true }, {}],
        ],
      },
    ),
    paragraph("보고 사항", { size: 20, bold: true, before: 120, after: 60 }),
    ...((payload.report_items || []).map((item, index) =>
      paragraph(`${index + 1}) ${item}`, { size: 18, after: 20 }),
    )),
    paragraph("부의 안건", { size: 20, bold: true, before: 120, after: 60 }),
  ];
  agendas.forEach((agenda, index) => {
    children.push(paragraph(`제${index + 1}호 의안. ${agenda.title || ""}`, { size: 19, bold: true, before: 80, after: 40 }));
    if (agenda.description) {
      children.push(paragraph(agenda.description, { size: 18, after: 50 }));
    }
  });
  if (summaryRows.length) {
    children.push(paragraph("요약 재무현황", { size: 20, bold: true, before: 120, after: 60 }));
    children.push(
      makeTable([2200, 2600, CONTENT_WIDTH_REPORT - 4800], [["항목", "값", "비고"], ...summaryRows], {
        width: CONTENT_WIDTH_REPORT,
        cellOptions: [
          [
            { fill: "EAF2FB", bold: true, alignment: AlignmentType.CENTER },
            { fill: "EAF2FB", bold: true, alignment: AlignmentType.CENTER },
            { fill: "EAF2FB", bold: true, alignment: AlignmentType.CENTER },
          ],
        ],
      }),
    );
  }
  return createDocument(children, { compact: false });
}

function buildVoteForm(payload, isProxy = false) {
  const agendas = payload.agendas || [];
  const recipient = payload.recipient_label || payload.fund_name || "";
  const children = [
    docTitle(isProxy ? "의결권 행사 통보서" : "서면의결서", true),
    paragraph(`${recipient} 귀중`, { size: 19, after: 100, line: 280 }),
    paragraph(payload.introduction || "", { size: 18, after: 120, line: 300 }),
    paragraph("다   음", { alignment: AlignmentType.CENTER, size: 18, bold: true, after: 50 }),
    makeTable(
      [CONTENT_WIDTH_COMPACT - 3000, 1500, 1500],
      [["부의안건", "찬성", "반대"], ...agendas.map((agenda) => [agenda.short_title || agenda.title || "", "", ""])],
      {
        width: CONTENT_WIDTH_COMPACT,
        cellOptions: [
          [
            { fill: "EAF2FB", bold: true, alignment: AlignmentType.CENTER, size: 18, line: 260 },
            { fill: "EAF2FB", bold: true, alignment: AlignmentType.CENTER, size: 18, line: 260 },
            { fill: "EAF2FB", bold: true, alignment: AlignmentType.CENTER, size: 18, line: 260 },
          ],
          ...agendas.map(() => [
            { size: 18, line: 340, margins: { top: 140, bottom: 140, left: 160, right: 160 } },
            { alignment: AlignmentType.CENTER, size: 18, line: 340, margins: { top: 140, bottom: 140, left: 160, right: 160 } },
            { alignment: AlignmentType.CENTER, size: 18, line: 340, margins: { top: 140, bottom: 140, left: 160, right: 160 } },
          ]),
        ],
      },
    ),
    paragraph(payload.vote_note || "* 찬성 또는 반대에 표시해 주시기 바랍니다.", { size: 17, before: 60, after: 160, line: 280 }),
    paragraph(payload.signoff_date || payload.meeting?.date_label || "", {
      alignment: AlignmentType.CENTER,
      size: 19,
      after: 100,
      line: 280,
    }),
    makeTable(
      [2400, CONTENT_WIDTH_COMPACT - 2400],
      [
        [payload.seat_label || "약정좌수", ""],
        [payload.name_label || "조합원명", "(인)"],
        [payload.id_label || "사업자등록번호", ""],
      ],
      {
        width: CONTENT_WIDTH_COMPACT,
        cellOptions: [
          [{ fill: "F8FAFC", bold: true }, {}],
          [{ fill: "F8FAFC", bold: true }, { alignment: AlignmentType.RIGHT }],
          [{ fill: "F8FAFC", bold: true }, {}],
        ],
      },
    ),
  ];
  return createDocument(children, { layout: "formal" });
}

function buildMinutes(payload) {
  const agendas = payload.agendas || [];
  const attendanceRows = payload.attendance_summary || [];
  const children = [
    docTitle(payload.title || "총회 의사록"),
    paragraph(payload.opening_text || "", { size: 18, after: 70 }),
  ];
  if (attendanceRows.length) {
    children.push(
      makeTable(
        [2600, CONTENT_WIDTH_REPORT - 2600],
        attendanceRows.map((item) => [item.label || "", item.value || ""]),
        {
          width: CONTENT_WIDTH_REPORT,
          cellOptions: attendanceRows.map(() => [{ fill: "F8FAFC", bold: true }, {}]),
        },
      ),
    );
  }
  agendas.forEach((agenda, index) => {
    children.push(paragraph(`제${index + 1}호 의안 : ${agenda.title || ""}`, { size: 19, bold: true, before: 100, after: 40 }));
    children.push(paragraph(agenda.resolution_text || agenda.description || "", { size: 18, after: 40 }));
    children.push(paragraph(`결의결과 : ${agenda.vote_result || "원안 가결"}`, { size: 18, after: 20 }));
  });
  children.push(paragraph(payload.closing_text || "", { size: 18, before: 100, after: 80 }));
  children.push(paragraph(payload.signoff_date || "", { alignment: AlignmentType.CENTER, size: 18, after: 50 }));
  children.push(paragraph(payload.signoff_name || payload.fund_name || "", { alignment: AlignmentType.CENTER, size: 20, bold: true }));
  return createDocument(children, { compact: false });
}

function buildBusinessReport(payload) {
  const sections = payload.sections || [];
  const children = [
    docTitle(payload.title || `${payload.fund_name || ""} 영업보고서`),
    paragraph(payload.subtitle || "", { alignment: AlignmentType.CENTER, size: 18, after: 120 }),
  ];
  sections.forEach((section) => {
    children.push(paragraph(section.title || "", { size: 20, bold: true, before: 120, after: 60 }));
    (section.paragraphs || []).forEach((item) => {
      children.push(paragraph(item, { size: 18, after: 40 }));
    });
    if (section.table?.rows?.length) {
      children.push(
        makeTable(section.table.widths, [section.table.headers || [], ...section.table.rows], {
          width: section.table.width || CONTENT_WIDTH_REPORT,
          cellOptions: [
            (section.table.headers || []).map(() => ({ fill: "EAF2FB", bold: true, alignment: AlignmentType.CENTER })),
          ],
        }),
      );
    }
  });
  return createDocument(children, { compact: false });
}

async function main() {
  const payloadPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!payloadPath || !outputPath) {
    throw new Error("Usage: node render.mjs <payload.json> <output.docx>");
  }

  const payload = readJson(payloadPath);
  let doc;
  switch (payload.kind) {
    case "official_notice":
      doc = buildOfficialNotice(payload);
      break;
    case "agenda_explanation":
      doc = buildAgendaExplanation(payload);
      break;
    case "written_resolution":
      doc = buildVoteForm(payload, false);
      break;
    case "proxy_vote_notice":
      doc = buildVoteForm(payload, true);
      break;
    case "minutes":
      doc = buildMinutes(payload);
      break;
    case "business_report":
      doc = buildBusinessReport(payload);
      break;
    default:
      throw new Error(`Unsupported meeting packet doc kind: ${payload.kind}`);
  }

  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
