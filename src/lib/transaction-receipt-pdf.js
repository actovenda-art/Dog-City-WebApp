import { jsPDF } from "jspdf";
import { formatCurrency, formatMovementDateTime } from "../utils/finance.js";

const PAGE_WIDTH_MM = 190;
const MIN_PAGE_HEIGHT_MM = 123;

function normalizeDirection(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function buildFileName(receipt) {
  const details = receipt?.details || {};
  const dateKey = String(details.transaction_date || "").slice(0, 10).replace(/\D/g, "") || "transacao";
  const referenceKey = String(details.provider_reference || receipt?.transaction_id || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-12) || "banco-inter";

  return `comprovante-${dateKey}-${referenceKey}.pdf`;
}

export function createTransactionReceiptPdf(receipt) {
  const details = receipt?.details;
  if (!details) {
    throw new Error("Dados do comprovante não informados.");
  }

  const rows = [
    ["Data", details.transaction_date ? formatMovementDateTime(details.transaction_date) : null],
    ["Situação", details.status],
    ["Contraparte", details.counterparty_name],
    ["Documento", details.counterparty_document],
    ["Referência bancária", details.provider_reference],
    ["End-to-End Pix", details.end_to_end_id],
    ["TXID", details.txid],
    ["NSU", details.nsu],
    ["Autenticação", details.authentication],
  ].filter(([, value]) => value);
  const rowCount = Math.ceil(rows.length / 2);
  const summaryDescription = details.description || "Transação Banco Inter";
  const summaryExtraHeight = summaryDescription.length > 44 ? 5 : 0;
  const requestedPageHeight = Math.max(MIN_PAGE_HEIGHT_MM, 81 + (rowCount * 14) + summaryExtraHeight);
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [PAGE_WIDTH_MM, requestedPageHeight],
    compress: true,
    putOnlyUsedFonts: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentLeft = 12;
  const contentRight = pageWidth - 12;
  const columnWidth = 77;
  const secondColumnX = 101;
  const detailsStartY = 67 + summaryExtraHeight;
  const footerY = pageHeight - 11;
  const direction = normalizeDirection(details.direction);
  const isOutgoing = direction === "saida" || direction === "debito" || direction === "outflow";
  const amountPrefix = isOutgoing ? "-" : "+";
  const amountColor = isOutgoing ? [225, 29, 72] : [5, 150, 105];

  pdf.setProperties({
    title: "Comprovante da transação",
    subject: "Comprovante individual de movimentação bancária",
    author: "Dog City Brasil",
    creator: "Dog City Brasil",
  });
  pdf.setDrawColor(218, 226, 238);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(3, 3, pageWidth - 6, pageHeight - 6, 5, 5, "S");

  pdf.setTextColor(75, 101, 135);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setCharSpace(0.7);
  pdf.text("DOG CITY BRASIL", contentLeft, 14);
  pdf.setCharSpace(0);

  pdf.setTextColor(6, 20, 47);
  pdf.setFontSize(16);
  pdf.text("Comprovante da transação", contentLeft, 24);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(51, 65, 85);
  pdf.text("Dados identificadores retornados pela API oficial do Banco Inter.", contentLeft, 31);

  pdf.setDrawColor(220, 226, 235);
  pdf.line(contentLeft, 39, contentRight, 39);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(75, 101, 135);
  pdf.setCharSpace(0.45);
  pdf.text(String(details.transaction_type || "Movimentação bancária").toUpperCase(), contentLeft, 48);
  pdf.setCharSpace(0);

  pdf.setFontSize(10.5);
  pdf.setTextColor(6, 20, 47);
  const summaryLines = pdf.splitTextToSize(summaryDescription, 104).slice(0, 2);
  pdf.text(summaryLines, contentLeft, 55, { lineHeightFactor: 1.05 });
  pdf.setTextColor(...amountColor);
  pdf.setFontSize(17);
  pdf.text(`${amountPrefix}${formatCurrency(details.amount || 0)}`, contentRight, 53, { align: "right" });

  pdf.setDrawColor(220, 226, 235);
  pdf.line(contentLeft, 61 + summaryExtraHeight, contentRight, 61 + summaryExtraHeight);

  rows.forEach(([label, value], index) => {
    const columnIndex = index % 2;
    const rowIndex = Math.floor(index / 2);
    const x = columnIndex === 0 ? contentLeft : secondColumnX;
    const y = detailsStartY + (rowIndex * 14);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(75, 101, 135);
    pdf.setCharSpace(0.35);
    pdf.text(String(label).toUpperCase(), x, y);
    pdf.setCharSpace(0);

    pdf.setFontSize(8.2);
    pdf.setTextColor(6, 20, 47);
    const valueLines = pdf.splitTextToSize(String(value), columnWidth).slice(0, 2);
    pdf.text(valueLines, x, y + 6, { lineHeightFactor: 1.05 });
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.7);
  pdf.setTextColor(75, 101, 135);
  const footer = "Documento gerado pelo sistema Dog City Brasil a partir dos dados oficiais da transação consultados no Banco Inter.";
  pdf.text(pdf.splitTextToSize(footer, pageWidth - 24), contentLeft, footerY);

  return {
    pdf,
    fileName: buildFileName(receipt),
    pageSize: { width: pageWidth, height: pageHeight },
  };
}

export function downloadTransactionReceiptPdf(receipt) {
  const { pdf, fileName } = createTransactionReceiptPdf(receipt);
  pdf.save(fileName);
  return fileName;
}
