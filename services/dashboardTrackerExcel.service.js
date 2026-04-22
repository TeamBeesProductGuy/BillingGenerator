const ExcelJS = require('exceljs');

function styleHeader(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E78' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
      right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
    };
  });
}

function styleDataRow(row) {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });
}

function asDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date;
}

function asNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : '';
}

function autoFitColumns(worksheet, widths) {
  worksheet.columns = widths.map((width) => ({ width }));
}

function buildSummaryBySowCustomerRows(rows) {
  const customers = Array.from(new Set(rows.map((row) => row.customer_name).filter(Boolean))).sort();
  const sows = Array.from(new Set(rows.map((row) => row.sow_number).filter(Boolean))).sort();

  const header = ['Row Labels'].concat(customers, ['Grand Total']);
  const body = sows.map((sowNumber) => {
    const line = [sowNumber];
    let total = 0;

    customers.forEach((customer) => {
      const count = rows.filter((row) => row.sow_number === sowNumber && row.customer_name === customer).length;
      line.push(count || '');
      total += count;
    });

    line.push(total);
    return line;
  });

  const grandTotal = ['Grand Total'];
  let overall = 0;
  customers.forEach((customer) => {
    const count = rows.filter((row) => row.customer_name === customer).length;
    grandTotal.push(count || '');
    overall += count;
  });
  grandTotal.push(overall);

  return { header, body, footer: grandTotal };
}

function buildSummaryByCustomerGenderRows(rows) {
  const genders = Array.from(new Set(rows.map((row) => row.gender).filter(Boolean))).sort();
  const customers = Array.from(new Set(rows.map((row) => row.customer_name).filter(Boolean))).sort();

  const header = ['Row Labels'].concat(genders, ['Grand Total']);
  const body = customers.map((customer) => {
    const line = [customer];
    let total = 0;

    genders.forEach((gender) => {
      const count = rows.filter((row) => row.customer_name === customer && row.gender === gender).length;
      line.push(count || '');
      total += count;
    });

    line.push(total);
    return line;
  });

  const grandTotal = ['Grand Total'];
  let overall = 0;
  genders.forEach((gender) => {
    const count = rows.filter((row) => row.gender === gender).length;
    grandTotal.push(count || '');
    overall += count;
  });
  grandTotal.push(overall);

  return { header, body, footer: grandTotal };
}

function addSummaryBlock(worksheet, startColumn, title, summary) {
  const titleCell = worksheet.getCell(1, startColumn);
  titleCell.value = title;
  titleCell.font = { bold: true, name: 'Calibri', size: 12 };

  const headerRow = worksheet.getRow(2);
  summary.header.forEach((value, index) => {
    headerRow.getCell(startColumn + index).value = value;
  });

  for (let rowIndex = 0; rowIndex < summary.body.length; rowIndex += 1) {
    const row = worksheet.getRow(3 + rowIndex);
    summary.body[rowIndex].forEach((value, index) => {
      row.getCell(startColumn + index).value = value;
    });
  }

  const footerRowNumber = 3 + summary.body.length;
  const footerRow = worksheet.getRow(footerRowNumber);
  summary.footer.forEach((value, index) => {
    footerRow.getCell(startColumn + index).value = value;
    footerRow.getCell(startColumn + index).font = { bold: true, name: 'Calibri', size: 11 };
  });

  const styledRowNumbers = [2];
  for (let idx = 0; idx < summary.body.length; idx += 1) styledRowNumbers.push(3 + idx);
  styledRowNumbers.push(footerRowNumber);

  styledRowNumbers.forEach((rowNumber) => {
    const row = worksheet.getRow(rowNumber);
    for (let col = startColumn; col < startColumn + summary.header.length; col += 1) {
      const cell = row.getCell(col);
      cell.alignment = { vertical: 'middle', horizontal: col === startColumn ? 'left' : 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      if (rowNumber === 2) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F4E78' },
        };
      }
    }
  });
}

async function generateDashboardTrackerWorkbook(rows) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Billing Engine';
  workbook.created = new Date();

  const dataSheet = workbook.addWorksheet('sample master data', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  dataSheet.getCell('B1').value = 'Sample Master Data file - All emp, all client sample data';
  dataSheet.getCell('B1').font = { bold: true, name: 'Calibri', size: 12 };

  const headers = [
    'Sr. No.',
    'SOW No.',
    'Customer Name',
    'Location',
    'SOW Effective Date',
    'SOW End Date',
    'Resource Desc',
    'Resource Name',
    'Emp Code',
    'DOJ Teambees',
    'DOJ Client',
    'Gender',
    'Status',
    'Reporting Manager',
    'Monthly Rate',
    'PO Number',
    'PO Date',
    'PO Start Date',
    'PO End Date',
    'PO Value',
    'PO Days left',
    'Remark 1',
    'Remark 2',
    'Joining Month (YY-MM)',
    'Joining Caldr Yr',
  ];

  dataSheet.getRow(3).values = headers;
  styleHeader(dataSheet.getRow(3));

  rows.forEach((item, index) => {
    const row = dataSheet.getRow(4 + index);
    row.values = [
      index + 1,
      item.sow_number || '',
      item.customer_name || '',
      item.location || '',
      asDate(item.sow_effective_date),
      asDate(item.sow_end_date),
      item.resource_description || '',
      item.resource_name || '',
      item.emp_code || '',
      asDate(item.doj_teambees),
      asDate(item.doj_client),
      item.gender || '',
      item.resource_status || '',
      item.reporting_manager || '',
      asNumber(item.monthly_rate),
      item.po_number || '',
      asDate(item.po_date),
      asDate(item.po_start_date),
      asDate(item.po_end_date),
      asNumber(item.po_value),
      asNumber(item.po_days_left),
      item.remark_1 || '',
      item.remark_2 || '',
      item.joining_month || '',
      item.joining_calendar_year || '',
    ];
    styleDataRow(row);
  });

  ['E', 'F', 'J', 'K', 'Q', 'R', 'S'].forEach((column) => {
    dataSheet.getColumn(column).numFmt = 'dd-mmm-yyyy';
  });
  ['O', 'T'].forEach((column) => {
    dataSheet.getColumn(column).numFmt = '#,##0.00';
  });

  autoFitColumns(dataSheet, [10, 16, 24, 18, 16, 16, 28, 24, 14, 16, 16, 12, 14, 22, 16, 18, 16, 16, 16, 16, 14, 22, 22, 16, 16]);

  const summarySheet = workbook.addWorksheet('sample summary ');
  const sowCustomerSummary = buildSummaryBySowCustomerRows(rows);
  const customerGenderSummary = buildSummaryByCustomerGenderRows(rows);

  addSummaryBlock(summarySheet, 1, 'Count of Resource Name', sowCustomerSummary);
  addSummaryBlock(summarySheet, 8, 'Count of Resource Name', customerGenderSummary);
  summarySheet.columns.forEach((column) => {
    if (!column.width || column.width < 14) column.width = 14;
  });

  return workbook;
}

module.exports = { generateDashboardTrackerWorkbook };
